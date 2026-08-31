-- ─────────────────────────────────────────────────────────────────────────────
-- Designer Consultation booking spine. Instant-book: a confirmed booking row IS
-- the block (no separate blocking table). Free consultation, admin-only email,
-- Meet link shared manually. Slot length is admin-editable but must NOT affect
-- already-booked slots — each booking snapshots its own slot_minutes, and
-- availability excludes by INTERVAL OVERLAP so mixed durations never collide.
-- Timezone is Asia/Kolkata (IST, fixed UTC+5:30, no DST).
--
-- Applied MANUALLY in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) consultation_settings ────────────────────────────────────────────────
-- Single-row table holding the admin-editable booking config.
CREATE TABLE IF NOT EXISTS public.consultation_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_start TIME NOT NULL,
    work_end TIME NOT NULL,
    slot_minutes INT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    lead_time_hours INT NOT NULL DEFAULT 2,
    max_advance_days INT NOT NULL DEFAULT 30,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed exactly ONE row (only when the table is empty).
INSERT INTO public.consultation_settings
    (work_start, work_end, slot_minutes, lead_time_hours, max_advance_days)
SELECT '09:00'::time, '17:00'::time, 60, 2, 30
WHERE NOT EXISTS (SELECT 1 FROM public.consultation_settings);

-- ── 2) consultation_days_off ────────────────────────────────────────────────
-- Blackout dates (holidays / leave). A day here yields zero availability.
CREATE TABLE IF NOT EXISTS public.consultation_days_off (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day DATE UNIQUE NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3) consultations (bookings) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consultations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ref TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    method TEXT NOT NULL,               -- 'google_meet' | 'whatsapp_video'
    slot_date DATE NOT NULL,
    slot_time TIME NOT NULL,
    slot_minutes INT NOT NULL,          -- duration SNAPSHOT (taken at booking time)
    notes TEXT,
    image_url TEXT,
    image_note TEXT,
    agreed_terms BOOLEAN NOT NULL,
    agreed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consent_ip TEXT,
    consent_ua TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed', -- 'confirmed' | 'completed' | 'cancelled'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency key: the client sends a stable submission_token (UUID) per booking
-- attempt so a retried submit (double-click / network retry) maps to the SAME
-- booking instead of creating a duplicate. Nullable + added idempotently so the
-- column can be introduced on an already-live table without a migration.
ALTER TABLE public.consultations
    ADD COLUMN IF NOT EXISTS submission_token TEXT;

-- One booking per submission_token (ignores NULLs — legacy rows are unaffected).
-- A retried submit surfaces as a 23505 on THIS index, which the action treats as
-- an idempotent success rather than a double-booking error.
CREATE UNIQUE INDEX IF NOT EXISTS consultations_submission_token_idx
    ON public.consultations (submission_token)
    WHERE submission_token IS NOT NULL;

-- Double-booking guard: at most one non-cancelled booking per (date, exact start
-- time). Interval-overlap collisions across differing slot_minutes are handled in
-- the availability layer; this index is the last-line DB guard against an exact
-- same-slot race between two confirmations.
CREATE UNIQUE INDEX IF NOT EXISTS consultations_slot_unique_idx
    ON public.consultations (slot_date, slot_time)
    WHERE status <> 'cancelled';

-- Domain CHECK constraints: enforce valid method / status / slot_minutes at the
-- DB level (not just in the server action), so NO writer — anon insert OR admin
-- update — can persist a value outside the allowed domain. Added idempotently.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_method_chk') THEN
        ALTER TABLE public.consultations
            ADD CONSTRAINT consultations_method_chk
            CHECK (method IN ('google_meet', 'whatsapp_video'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_status_chk') THEN
        ALTER TABLE public.consultations
            ADD CONSTRAINT consultations_status_chk
            CHECK (status IN ('confirmed', 'completed', 'cancelled'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultations_slot_minutes_chk') THEN
        ALTER TABLE public.consultations
            ADD CONSTRAINT consultations_slot_minutes_chk
            CHECK (slot_minutes BETWEEN 1 AND 480);
    END IF;
END $$;

-- Query indexes: day view, status tabs, newest-first admin list.
CREATE INDEX IF NOT EXISTS consultations_slot_date_idx ON public.consultations (slot_date);
CREATE INDEX IF NOT EXISTS consultations_status_idx ON public.consultations (status);
CREATE INDEX IF NOT EXISTS consultations_created_at_idx ON public.consultations (created_at DESC);

-- ── RLS: consultation_settings ───────────────────────────────────────────────
ALTER TABLE public.consultation_settings ENABLE ROW LEVEL SECURITY;

-- Public read: needed to compute available slots on the storefront.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consultation_settings'
          AND policyname = 'Allow public read access on consultation_settings'
    ) THEN
        CREATE POLICY "Allow public read access on consultation_settings"
            ON public.consultation_settings FOR SELECT USING (true);
    END IF;
END $$;

-- Admin full access.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consultation_settings'
          AND policyname = 'Allow admins full access on consultation_settings'
    ) THEN
        CREATE POLICY "Allow admins full access on consultation_settings"
            ON public.consultation_settings FOR ALL USING (
                auth.uid() IN (SELECT id FROM public.users WHERE role = 'Admin')
            );
    END IF;
END $$;

-- ── RLS: consultation_days_off ───────────────────────────────────────────────
ALTER TABLE public.consultation_days_off ENABLE ROW LEVEL SECURITY;

-- Public read: needed to exclude blackout dates when computing slots.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consultation_days_off'
          AND policyname = 'Allow public read access on consultation_days_off'
    ) THEN
        CREATE POLICY "Allow public read access on consultation_days_off"
            ON public.consultation_days_off FOR SELECT USING (true);
    END IF;
END $$;

-- Admin full access.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consultation_days_off'
          AND policyname = 'Allow admins full access on consultation_days_off'
    ) THEN
        CREATE POLICY "Allow admins full access on consultation_days_off"
            ON public.consultation_days_off FOR ALL USING (
                auth.uid() IN (SELECT id FROM public.users WHERE role = 'Admin')
            );
    END IF;
END $$;

-- ── RLS: consultations ───────────────────────────────────────────────────────
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. guests) may create a booking — but ONLY a well-formed one. The
-- anon key is public (shipped in the browser bundle), so a client can POST to
-- PostgREST directly, bypassing the server action. RLS is therefore the real
-- trust boundary: constrain what an anon insert may contain so it cannot forge a
-- non-'confirmed' status (which would evade the double-booking guard/busy-slots
-- RPC), an invalid method, or an out-of-range slot_minutes (which would corrupt
-- interval-overlap availability math). Drop-and-recreate so re-running applies
-- the tightened rule even if the old WITH CHECK(true) policy already exists.
DROP POLICY IF EXISTS "Allow public insert on consultations" ON public.consultations;
CREATE POLICY "Allow public insert on consultations"
    ON public.consultations FOR INSERT WITH CHECK (
        status = 'confirmed'
        AND method IN ('google_meet', 'whatsapp_video')
        AND slot_minutes BETWEEN 1 AND 480
        AND agreed_terms = true
    );

-- Read access: admins only (bookings hold customer PII).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consultations'
          AND policyname = 'Allow admins read on consultations'
    ) THEN
        CREATE POLICY "Allow admins read on consultations"
            ON public.consultations FOR SELECT TO authenticated USING (
                (auth.jwt() ->> 'user_role') = 'Admin'
                OR EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid() AND u.role = 'Admin'
                )
            );
    END IF;
END $$;

-- Update access: admins only (move through confirmed/completed/cancelled).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consultations'
          AND policyname = 'Allow admins update on consultations'
    ) THEN
        CREATE POLICY "Allow admins update on consultations"
            ON public.consultations FOR UPDATE TO authenticated USING (
                (auth.jwt() ->> 'user_role') = 'Admin'
                OR EXISTS (
                    SELECT 1 FROM public.users u
                    WHERE u.id = auth.uid() AND u.role = 'Admin'
                )
            );
    END IF;
END $$;

-- Realtime: live admin bookings list on new/updated consultations.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.consultations;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ── Public availability read (no PII) ────────────────────────────────────────
-- The customer availability calc runs under the anon/public client, which CANNOT
-- SELECT from consultations (admin-only, to protect PII). This SECURITY DEFINER
-- function exposes ONLY the busy interval columns (slot_time, slot_minutes) for a
-- date's active bookings — never name/email/phone/consent — so getAvailableSlots
-- can exclude booked slots without leaking any customer data.
CREATE OR REPLACE FUNCTION public.consultation_busy_slots(target_date date)
RETURNS TABLE (slot_time time, slot_minutes int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT slot_time, slot_minutes
    FROM public.consultations
    WHERE slot_date = target_date
      AND status <> 'cancelled';
$$;

GRANT EXECUTE ON FUNCTION public.consultation_busy_slots(date) TO anon, authenticated;
