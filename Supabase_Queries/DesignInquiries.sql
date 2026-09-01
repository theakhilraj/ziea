-- ─────────────────────────────────────────────────────────────────────────────
-- Design Inquiry spine. A customer (as an Individual or a Group) submits their
-- design vision, sizing, a preferred delivery date (within an admin-configurable
-- lead-time window) and reference/moodboard images, plus consent. On submit we
-- store the inquiry, mint a booking-style reference (ZI-<MMDD>-<code>) and drop a
-- notification into the admin activity log. Deliberate CLONE of the Designer
-- Consultation spine (Consultations.sql) — same idempotency / RLS / realtime
-- idioms. Timezone is Asia/Kolkata (IST, fixed UTC+5:30, no DST).
--
-- Applied MANUALLY in the Supabase SQL editor. Idempotent — safe to re-run.
--
-- NOTE: this file deliberately AVOIDS anonymous dollar-quoted DO blocks for the
-- constraints/policies (the Supabase SQL editor's statement splitter mis-pairs
-- repeated dollar-quote delimiters and raises "unterminated dollar-quoted
-- string"). Idempotency is achieved with DROP … IF EXISTS + ADD/CREATE instead.
-- The single unavoidable block (the realtime publication, which needs exception
-- handling) uses a uniquely named dollar-quote tag.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) design_inquiry_settings ──────────────────────────────────────────────
-- Single-row table holding the admin-editable delivery window. The earliest
-- selectable delivery day is today + delivery_lead_days; the latest is
-- today + max_advance_days (both computed in IST at request time).
CREATE TABLE IF NOT EXISTS public.design_inquiry_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    delivery_lead_days INT NOT NULL DEFAULT 7,
    max_advance_days INT NOT NULL DEFAULT 365,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Range + cross-field CHECKs. The earliest selectable day must be strictly before
-- the latest, so a customer always has at least one bookable day. Idempotent via
-- DROP … IF EXISTS + ADD (a fresh table has no rows to violate them).
ALTER TABLE public.design_inquiry_settings
    DROP CONSTRAINT IF EXISTS design_inquiry_settings_lead_days_chk;
ALTER TABLE public.design_inquiry_settings
    ADD CONSTRAINT design_inquiry_settings_lead_days_chk
    CHECK (delivery_lead_days BETWEEN 0 AND 365);

ALTER TABLE public.design_inquiry_settings
    DROP CONSTRAINT IF EXISTS design_inquiry_settings_max_advance_chk;
ALTER TABLE public.design_inquiry_settings
    ADD CONSTRAINT design_inquiry_settings_max_advance_chk
    CHECK (max_advance_days BETWEEN 1 AND 730);

ALTER TABLE public.design_inquiry_settings
    DROP CONSTRAINT IF EXISTS design_inquiry_settings_window_chk;
ALTER TABLE public.design_inquiry_settings
    ADD CONSTRAINT design_inquiry_settings_window_chk
    CHECK (delivery_lead_days < max_advance_days);

-- Seed exactly ONE row (only when the table is empty) with an EXPLICIT column
-- list so a future column addition can't silently shift positional values.
INSERT INTO public.design_inquiry_settings
    (delivery_lead_days, max_advance_days)
SELECT 7, 365
WHERE NOT EXISTS (SELECT 1 FROM public.design_inquiry_settings);

-- ── 2) design_inquiries ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.design_inquiries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ref TEXT UNIQUE NOT NULL,           -- auto-constraint design_inquiries_ref_key
    submission_token TEXT,              -- idempotency key (nullable)
    mode TEXT NOT NULL,                 -- 'individual' | 'group'
    name TEXT NOT NULL,                 -- primary contact (for group)
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    garment TEXT,                       -- individual "looking for" (required-per-mode)
    requirements TEXT,                  -- individual intent (required-per-mode)
    theme TEXT,                         -- group intent (required-per-mode)
    bust_chest TEXT,                    -- individual sizing (numeric string)
    size_unit TEXT,                     -- 'cm' | 'inches'
    delivery_date DATE NOT NULL,
    members JSONB NOT NULL DEFAULT '[]', -- group: {name, garment, bustChest}[]
    image_urls JSONB NOT NULL DEFAULT '[]',
    image_note TEXT,
    agreed_terms BOOLEAN NOT NULL,
    agreed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consent_ip TEXT,
    consent_ua TEXT,
    status TEXT NOT NULL DEFAULT 'new', -- 'new' | 'reviewed' | 'closed'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency key: the client sends a stable submission_token (UUID) per submit
-- attempt so a retried submit (double-click / network retry) maps to the SAME
-- inquiry instead of creating a duplicate. Added idempotently so the column can
-- be introduced on an already-live table without a migration.
ALTER TABLE public.design_inquiries
    ADD COLUMN IF NOT EXISTS submission_token TEXT;

-- Individual "looking for" garment. Added idempotently for an already-live table.
-- (For group, each member carries their own garment inside the members JSONB.)
ALTER TABLE public.design_inquiries
    ADD COLUMN IF NOT EXISTS garment TEXT;

-- ── Domain + array-count + per-mode CHECK constraints ────────────────────────
-- RLS WITH CHECK cannot count JSONB or express per-mode rules, so these are the
-- real backstop against a direct anon insert that forges an out-of-range array or
-- a mode-inconsistent row. All idempotent via DROP … IF EXISTS + ADD.

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_mode_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_mode_chk
    CHECK (mode IN ('individual', 'group'));

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_status_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_status_chk
    CHECK (status IN ('new', 'reviewed', 'closed'));

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_size_unit_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_size_unit_chk
    CHECK (size_unit IS NULL OR size_unit IN ('cm', 'inches'));

-- Sizing rules are MODE-SCOPED. An unconditional both-present-or-both-absent pair
-- CHECK would reject every GROUP row: group stores the shared size_unit (present)
-- while the top-level bust_chest is always NULL (each group member carries their
-- own bustChest inside the members JSONB).
--   • individual: bust_chest and size_unit are both-present-or-both-absent.
--   • group: top-level bust_chest MUST be NULL; size_unit is the REQUIRED shared
--     unit for all members.
ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_sizing_pair_chk;
ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_individual_sizing_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_individual_sizing_chk
    CHECK (mode <> 'individual' OR ((size_unit IS NULL) = (bust_chest IS NULL)));

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_group_sizing_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_group_sizing_chk
    CHECK (mode <> 'group' OR (bust_chest IS NULL AND size_unit IS NOT NULL));

-- Per-mode intent is REQUIRED (mirrors the Zod discriminated union): an individual
-- must carry non-blank requirements; a group must carry a non-blank theme.
ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_individual_intent_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_individual_intent_chk
    CHECK (mode <> 'individual' OR (requirements IS NOT NULL AND char_length(btrim(requirements)) >= 1));

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_group_intent_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_group_intent_chk
    CHECK (mode <> 'group' OR (theme IS NOT NULL AND char_length(btrim(theme)) >= 1));

-- An individual must also carry a non-blank garment ("looking for"). Group garments
-- live per-member in the members JSONB, so the top-level column stays NULL for group.
ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_individual_garment_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_individual_garment_chk
    CHECK (mode <> 'individual' OR (garment IS NOT NULL AND char_length(btrim(garment)) >= 1));

-- members cardinality per mode: group 2–20, individual exactly 0.
ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_members_group_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_members_group_chk
    CHECK (mode <> 'group' OR jsonb_array_length(members) BETWEEN 2 AND 20);

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_members_individual_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_members_individual_chk
    CHECK (mode <> 'individual' OR jsonb_array_length(members) = 0);

-- image_urls cardinality per mode: group ≤10 (moodboard), individual ≤1.
ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_images_group_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_images_group_chk
    CHECK (mode <> 'group' OR jsonb_array_length(image_urls) <= 10);

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_images_individual_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_images_individual_chk
    CHECK (mode <> 'individual' OR jsonb_array_length(image_urls) <= 1);

-- Char-length CHECKs mirroring the Zod caps (belt-and-braces vs a direct anon insert).
ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_name_len_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_name_len_chk
    CHECK (char_length(name) <= 80);

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_requirements_len_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_requirements_len_chk
    CHECK (requirements IS NULL OR char_length(requirements) <= 2000);

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_theme_len_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_theme_len_chk
    CHECK (theme IS NULL OR char_length(theme) <= 2000);

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_image_note_len_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_image_note_len_chk
    CHECK (image_note IS NULL OR char_length(image_note) <= 500);

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_bust_chest_len_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_bust_chest_len_chk
    CHECK (bust_chest IS NULL OR char_length(bust_chest) <= 20);

ALTER TABLE public.design_inquiries DROP CONSTRAINT IF EXISTS design_inquiries_garment_len_chk;
ALTER TABLE public.design_inquiries ADD CONSTRAINT design_inquiries_garment_len_chk
    CHECK (garment IS NULL OR char_length(garment) <= 80);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- One inquiry per submission_token (ignores NULLs). A retried submit surfaces as
-- a 23505 on THIS index, which the action treats as an idempotent success. The
-- name is EXACT: the action branches on
-- error.message.includes('design_inquiries_submission_token_idx') so ONLY a token
-- collision maps to success; any other 23505 (e.g. the ref key) must NOT be.
CREATE UNIQUE INDEX IF NOT EXISTS design_inquiries_submission_token_idx
    ON public.design_inquiries (submission_token)
    WHERE submission_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS design_inquiries_status_idx ON public.design_inquiries (status);
CREATE INDEX IF NOT EXISTS design_inquiries_created_at_idx ON public.design_inquiries (created_at DESC);

-- ── RLS: design_inquiry_settings ─────────────────────────────────────────────
ALTER TABLE public.design_inquiry_settings ENABLE ROW LEVEL SECURITY;

-- Public read: needed to compute the delivery window on the storefront calendar.
DROP POLICY IF EXISTS "Allow public read access on design_inquiry_settings" ON public.design_inquiry_settings;
CREATE POLICY "Allow public read access on design_inquiry_settings"
    ON public.design_inquiry_settings FOR SELECT USING (true);

-- Admin full access. Uses the simpler settings predicate (matches
-- consultation_settings) — NOT the PII-table form.
DROP POLICY IF EXISTS "Allow admins full access on design_inquiry_settings" ON public.design_inquiry_settings;
CREATE POLICY "Allow admins full access on design_inquiry_settings"
    ON public.design_inquiry_settings FOR ALL USING (
        auth.uid() IN (SELECT id FROM public.users WHERE role = 'Admin')
    );

-- ── RLS: design_inquiries ────────────────────────────────────────────────────
ALTER TABLE public.design_inquiries ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. guests) may create an inquiry — but ONLY a well-formed one. The
-- anon key is public (shipped in the browser bundle), so a client can POST to
-- PostgREST directly, bypassing the server action. RLS is therefore the real
-- trust boundary: constrain what an anon insert may contain so it cannot forge a
-- non-'new' status or an invalid mode, and cannot skip consent. Array/JSONB count
-- and per-mode invariants live in the CHECK constraints above (RLS can't count).
DROP POLICY IF EXISTS "Allow public insert on design_inquiries" ON public.design_inquiries;
CREATE POLICY "Allow public insert on design_inquiries"
    ON public.design_inquiries FOR INSERT WITH CHECK (
        agreed_terms = true
        AND mode IN ('individual', 'group')
        AND status = 'new'
    );

-- Read access: admins only (inquiries hold customer PII).
DROP POLICY IF EXISTS "Allow admins read on design_inquiries" ON public.design_inquiries;
CREATE POLICY "Allow admins read on design_inquiries"
    ON public.design_inquiries FOR SELECT TO authenticated USING (
        (auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'Admin'
        )
    );

-- Update access: admins only (move through new/reviewed/closed).
DROP POLICY IF EXISTS "Allow admins update on design_inquiries" ON public.design_inquiries;
CREATE POLICY "Allow admins update on design_inquiries"
    ON public.design_inquiries FOR UPDATE TO authenticated USING (
        (auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'Admin'
        )
    );

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Live admin inquiries list + 'new' badge on new/updated inquiries. This is the
-- ONLY anonymous block in the file; it needs exception handling because
-- ALTER PUBLICATION errors if the table is already a member. Uniquely-named tag.
DO $di$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.design_inquiries;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $di$;
