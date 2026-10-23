-- ─────────────────────────────────────────────────────────────────────────────
-- SALES INVOICES (GST billing) — brings GoGST's "Sale Invoice" flow into ZIEA.
--
-- Tables
--   issuer_companies        the "Client Information" profiles that ISSUE invoices
--                           (Ziea or any other company): logo, GSTIN, bank, terms.
--                           Exactly one row may be is_default (partial unique idx).
--   billing_parties         recurring CUSTOMERS (M/S, GSTIN, place of supply…).
--   invoice_number_counters per-(company, financial-year) running counter. Seedable
--                           (set last_seq so migration from GoGST continues, e.g. 8).
--   sale_invoices           the invoice HEADER: numbering, party SNAPSHOT, totals,
--                           payment, status ('draft' | 'saved' | 'cancelled').
--   sale_invoice_items      one row per line — a self-contained SNAPSHOT (name, HSN,
--                           qty, price, discount, rate, computed CGST/SGST/IGST/total).
--                           product_id is an OPTIONAL link (SET NULL) — ad-hoc = NULL.
--   payment_receipts        receipts against an invoice; a trigger recomputes the
--                           parent's amount_paid / outstanding.
--   products (+3 cols)      hsn_sac, gst_rate, uom — left blank for the client to fill.
--
-- RPCs (atomic, SECURITY DEFINER + admin guard)
--   gst_financial_year(date)                 → '26-27' (Indian FY, Apr–Mar).
--   save_sale_invoice(id, company, party, header, items) → allocate number (new only)
--                                              + upsert header + replace items, in ONE
--                                              transaction. Returns {id, invoice_no}.
--   set_default_issuer_company(id)           → flip the single default safely.
--
-- Applied MANUALLY in the Supabase SQL editor. Idempotent — safe to re-run. Avoids
-- anonymous dollar-quoted DO blocks (the editor's splitter mis-pairs repeated $$);
-- every function body uses a uniquely-named tag and idempotency is DROP…IF EXISTS.
-- All tables are ADMIN-ONLY (no public/anon access) — invoices are internal.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1) issuer_companies (Client Information) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.issuer_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,                     -- legal / trade name (prints as issuer)
    logo_url TEXT,
    logo_width INT,                         -- intrinsic px size — aspect-correct on the PDF
    logo_height INT,
    gstin TEXT,
    pan TEXT,
    state TEXT,                             -- registered state (drives intra/inter GST)
    state_code TEXT,                        -- 2-digit GST state code (optional)
    address TEXT,
    phone TEXT,
    email TEXT,
    -- bank block (prints on the invoice)
    bank_name TEXT,
    bank_branch TEXT,
    bank_account_name TEXT,
    bank_account_number TEXT,
    bank_ifsc TEXT,
    -- invoice defaults
    invoice_prefix TEXT,                    -- series prefix, e.g. 'ZIEA'
    terms_title TEXT DEFAULT 'Terms and Conditions',
    terms_detail TEXT,
    signatory TEXT,                         -- 'Authorised Signatory' label / name
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logo intrinsic dimensions (idempotent — adds the columns to an already-applied table).
ALTER TABLE public.issuer_companies ADD COLUMN IF NOT EXISTS logo_width INT;
ALTER TABLE public.issuer_companies ADD COLUMN IF NOT EXISTS logo_height INT;

ALTER TABLE public.issuer_companies DROP CONSTRAINT IF EXISTS issuer_companies_gstin_len_chk;
ALTER TABLE public.issuer_companies ADD CONSTRAINT issuer_companies_gstin_len_chk
    CHECK (gstin IS NULL OR char_length(gstin) <= 15);

-- At most ONE default company (partial unique index over the TRUE rows).
CREATE UNIQUE INDEX IF NOT EXISTS issuer_companies_one_default_idx
    ON public.issuer_companies (is_default) WHERE is_default = true;

-- ── 2) billing_parties (recurring customers) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_parties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,                     -- M/S
    address TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    pan TEXT,
    place_of_supply TEXT,                   -- customer state (intra vs inter)
    state_code TEXT,
    ship_to TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_parties_name_idx ON public.billing_parties (lower(name));

-- ── 3) invoice_number_counters (per company + FY, seedable) ──────────────────
CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
    issuer_company_id UUID NOT NULL REFERENCES public.issuer_companies(id) ON DELETE CASCADE,
    financial_year TEXT NOT NULL,           -- '26-27'
    last_seq INT NOT NULL DEFAULT 0,        -- set this to seed a continue-from number
    PRIMARY KEY (issuer_company_id, financial_year)
);

-- ── 4) sale_invoices (header) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    issuer_company_id UUID NOT NULL REFERENCES public.issuer_companies(id) ON DELETE RESTRICT,
    billing_party_id UUID REFERENCES public.billing_parties(id) ON DELETE SET NULL,
    -- numbering
    invoice_prefix TEXT,
    financial_year TEXT NOT NULL,           -- '26-27'
    invoice_seq INT NOT NULL,               -- running number within (company, FY)
    invoice_no TEXT NOT NULL,               -- 'ZIEA/26-27/0009'
    invoice_date DATE NOT NULL,
    due_date DATE,
    -- party SNAPSHOT (immutable copy taken at save)
    party_name TEXT NOT NULL,
    party_address TEXT,
    party_gstin TEXT,
    party_phone TEXT,
    party_contact TEXT,
    place_of_supply TEXT,
    ship_to TEXT,
    -- invoice meta
    invoice_type TEXT,
    delivery_mode TEXT,
    reverse_charge BOOLEAN NOT NULL DEFAULT false,
    tax_type TEXT NOT NULL DEFAULT 'intra', -- 'intra' = CGST+SGST | 'inter' = IGST
    -- totals (computed; the printed source of truth)
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    additional_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_taxable NUMERIC(12,2) NOT NULL DEFAULT 0,
    cgst_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    sgst_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    igst_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
    round_off NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_in_words TEXT,
    -- payment
    payment_type TEXT,                      -- CREDIT | CASH | CHEQUE | ONLINE | BANK
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    outstanding NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- notes
    terms_title TEXT,
    terms_detail TEXT,
    document_note TEXT,
    -- lifecycle
    status TEXT NOT NULL DEFAULT 'saved',   -- 'draft' | 'saved' | 'cancelled'
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sale_invoices DROP CONSTRAINT IF EXISTS sale_invoices_status_chk;
ALTER TABLE public.sale_invoices ADD CONSTRAINT sale_invoices_status_chk
    CHECK (status IN ('draft', 'saved', 'cancelled'));

ALTER TABLE public.sale_invoices DROP CONSTRAINT IF EXISTS sale_invoices_tax_type_chk;
ALTER TABLE public.sale_invoices ADD CONSTRAINT sale_invoices_tax_type_chk
    CHECK (tax_type IN ('intra', 'inter'));

ALTER TABLE public.sale_invoices DROP CONSTRAINT IF EXISTS sale_invoices_payment_type_chk;
ALTER TABLE public.sale_invoices ADD CONSTRAINT sale_invoices_payment_type_chk
    CHECK (payment_type IS NULL OR payment_type IN ('CREDIT', 'CASH', 'CHEQUE', 'ONLINE', 'BANK'));

-- Unique series: one seq per (company, FY), and the formatted number per company.
ALTER TABLE public.sale_invoices DROP CONSTRAINT IF EXISTS sale_invoices_series_uniq;
ALTER TABLE public.sale_invoices ADD CONSTRAINT sale_invoices_series_uniq
    UNIQUE (issuer_company_id, financial_year, invoice_seq);

ALTER TABLE public.sale_invoices DROP CONSTRAINT IF EXISTS sale_invoices_no_uniq;
ALTER TABLE public.sale_invoices ADD CONSTRAINT sale_invoices_no_uniq
    UNIQUE (issuer_company_id, invoice_no);

CREATE INDEX IF NOT EXISTS sale_invoices_date_idx ON public.sale_invoices (invoice_date DESC);
CREATE INDEX IF NOT EXISTS sale_invoices_status_idx ON public.sale_invoices (status);
CREATE INDEX IF NOT EXISTS sale_invoices_party_idx ON public.sale_invoices (billing_party_id);
CREATE INDEX IF NOT EXISTS sale_invoices_company_idx ON public.sale_invoices (issuer_company_id);

-- ── 5) sale_invoice_items (line SNAPSHOTS) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES public.sale_invoices(id) ON DELETE CASCADE,
    line_no INT NOT NULL,                   -- SR. order
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL, -- NULL = ad-hoc
    -- snapshot (what prints)
    name TEXT NOT NULL,
    hsn_sac TEXT,
    uom TEXT,
    qty NUMERIC(12,3) NOT NULL DEFAULT 0,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_type TEXT NOT NULL DEFAULT 'amount',   -- 'amount' | 'percent'
    discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
    -- computed (source of truth for the header totals)
    taxable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    cgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    sgst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    igst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sale_invoice_items DROP CONSTRAINT IF EXISTS sale_invoice_items_discount_type_chk;
ALTER TABLE public.sale_invoice_items ADD CONSTRAINT sale_invoice_items_discount_type_chk
    CHECK (discount_type IN ('amount', 'percent'));

CREATE INDEX IF NOT EXISTS sale_invoice_items_invoice_idx ON public.sale_invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS sale_invoice_items_product_idx ON public.sale_invoice_items (product_id);

-- ── 6) payment_receipts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID NOT NULL REFERENCES public.sale_invoices(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    payment_type TEXT NOT NULL,             -- CASH|CHEQUE|ONLINE|BANK|TDS|Bad Debts/Kasar
    amount NUMERIC(12,2) NOT NULL,
    note TEXT,
    attachment_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payment_receipts DROP CONSTRAINT IF EXISTS payment_receipts_amount_chk;
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_amount_chk
    CHECK (amount > 0);

ALTER TABLE public.payment_receipts DROP CONSTRAINT IF EXISTS payment_receipts_type_chk;
ALTER TABLE public.payment_receipts ADD CONSTRAINT payment_receipts_type_chk
    CHECK (payment_type IN ('CASH', 'CHEQUE', 'ONLINE', 'BANK', 'TDS', 'Bad Debts / Kasar'));

CREATE INDEX IF NOT EXISTS payment_receipts_invoice_idx ON public.payment_receipts (invoice_id);
CREATE INDEX IF NOT EXISTS payment_receipts_date_idx ON public.payment_receipts (payment_date DESC);

-- ── 7) products: billing fields (blank; the client fills them in later) ───────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS hsn_sac TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS uom TEXT;

-- Issuer company snapshot — the full issuer_companies row is frozen onto the
-- invoice at creation, so later edits to Company Details never alter old/completed
-- invoices (audit-safe). The invoice view/PDF reads from here, not the live company.
ALTER TABLE public.sale_invoices ADD COLUMN IF NOT EXISTS issuer_snapshot JSONB;

-- Customer state code snapshot — so editing an invoice can restore the exact
-- intra/inter (CGST+SGST vs IGST) determination.
ALTER TABLE public.sale_invoices ADD COLUMN IF NOT EXISTS party_state_code TEXT;

-- ── 8) FUNCTION: gst_financial_year(date) → 'YY-YY' (India, Apr–Mar) ──────────
CREATE OR REPLACE FUNCTION public.gst_financial_year(p_date DATE)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $gst_fy$
DECLARE
    v_start INT;
BEGIN
    IF EXTRACT(MONTH FROM p_date) >= 4 THEN
        v_start := EXTRACT(YEAR FROM p_date)::INT;
    ELSE
        v_start := EXTRACT(YEAR FROM p_date)::INT - 1;
    END IF;
    RETURN lpad((v_start % 100)::TEXT, 2, '0') || '-' || lpad(((v_start + 1) % 100)::TEXT, 2, '0');
END;
$gst_fy$;

-- ── 9) FUNCTION: save_sale_invoice(...) — atomic header + items + numbering ───
-- p_invoice_id NULL → create (allocates the next number for the company/FY);
-- otherwise → update the header and REPLACE all items (safe because lines are
-- pure snapshots). Amounts arrive already-computed from the app. Returns the id
-- and the assigned invoice_no.
CREATE OR REPLACE FUNCTION public.save_sale_invoice(
    p_invoice_id UUID,
    p_company_id UUID,
    p_party_id UUID,
    p_header JSONB,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $save_inv$
DECLARE
    v_id UUID;
    v_date DATE;
    v_fy TEXT;
    v_prefix TEXT;
    v_seq INT;
    v_no TEXT;
    v_issuer JSONB;
    v_item JSONB;
    v_line INT := 0;
BEGIN
    -- Admin guard (this function is SECURITY DEFINER, so it bypasses RLS).
    IF NOT ((auth.jwt() ->> 'user_role') = 'Admin'
            OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin')) THEN
        RAISE EXCEPTION 'Not authorised';
    END IF;

    v_date := (p_header ->> 'invoice_date')::DATE;

    IF p_invoice_id IS NULL THEN
        -- Allocate the next number atomically for (company, FY).
        v_fy := public.gst_financial_year(v_date);
        -- Snapshot the whole issuer company row (frozen onto this invoice).
        SELECT to_jsonb(c) INTO v_issuer FROM public.issuer_companies c WHERE id = p_company_id;
        v_prefix := COALESCE(NULLIF(btrim(v_issuer ->> 'invoice_prefix'), ''), 'INV');

        INSERT INTO public.invoice_number_counters (issuer_company_id, financial_year, last_seq)
        VALUES (p_company_id, v_fy, 1)
        ON CONFLICT (issuer_company_id, financial_year)
        DO UPDATE SET last_seq = public.invoice_number_counters.last_seq + 1
        RETURNING last_seq INTO v_seq;

        -- A caller-supplied custom number overrides the auto one (the internal seq
        -- still advances, for ordering + the unique series). Otherwise: prefix/FY/seq.
        IF COALESCE(btrim(p_header ->> 'custom_invoice_no'), '') <> '' THEN
            v_no := btrim(p_header ->> 'custom_invoice_no');
        ELSE
            v_no := v_prefix || '/' || v_fy || '/' || lpad(v_seq::TEXT, 4, '0');
        END IF;

        INSERT INTO public.sale_invoices (
            issuer_company_id, billing_party_id, invoice_prefix, financial_year, invoice_seq, invoice_no,
            invoice_date, due_date, party_name, party_address, party_gstin, party_phone, party_contact,
            place_of_supply, party_state_code, ship_to, invoice_type, delivery_mode, reverse_charge, tax_type,
            subtotal, additional_charge, total_taxable, cgst_total, sgst_total, igst_total, total_tax,
            round_off, grand_total, amount_in_words, payment_type, amount_paid, outstanding,
            terms_title, terms_detail, document_note, status, pdf_url, issuer_snapshot
        ) VALUES (
            p_company_id, p_party_id, v_prefix, v_fy, v_seq, v_no,
            v_date, NULLIF(p_header ->> 'due_date','')::DATE, p_header ->> 'party_name', p_header ->> 'party_address',
            p_header ->> 'party_gstin', p_header ->> 'party_phone', p_header ->> 'party_contact',
            p_header ->> 'place_of_supply', p_header ->> 'party_state_code', p_header ->> 'ship_to', p_header ->> 'invoice_type',
            p_header ->> 'delivery_mode', COALESCE((p_header ->> 'reverse_charge')::BOOLEAN, false),
            COALESCE(p_header ->> 'tax_type', 'intra'),
            COALESCE((p_header ->> 'subtotal')::NUMERIC, 0), COALESCE((p_header ->> 'additional_charge')::NUMERIC, 0),
            COALESCE((p_header ->> 'total_taxable')::NUMERIC, 0), COALESCE((p_header ->> 'cgst_total')::NUMERIC, 0),
            COALESCE((p_header ->> 'sgst_total')::NUMERIC, 0), COALESCE((p_header ->> 'igst_total')::NUMERIC, 0),
            COALESCE((p_header ->> 'total_tax')::NUMERIC, 0), COALESCE((p_header ->> 'round_off')::NUMERIC, 0),
            COALESCE((p_header ->> 'grand_total')::NUMERIC, 0), p_header ->> 'amount_in_words',
            p_header ->> 'payment_type', COALESCE((p_header ->> 'amount_paid')::NUMERIC, 0),
            COALESCE((p_header ->> 'grand_total')::NUMERIC, 0) - COALESCE((p_header ->> 'amount_paid')::NUMERIC, 0),
            p_header ->> 'terms_title', p_header ->> 'terms_detail', p_header ->> 'document_note',
            COALESCE(p_header ->> 'status', 'saved'), p_header ->> 'pdf_url', v_issuer
        ) RETURNING id INTO v_id;
    ELSE
        -- Update the header; KEEP the existing number. Replace items below.
        v_id := p_invoice_id;
        UPDATE public.sale_invoices SET
            billing_party_id = p_party_id,
            invoice_date = v_date,
            due_date = NULLIF(p_header ->> 'due_date','')::DATE,
            party_name = p_header ->> 'party_name',
            party_address = p_header ->> 'party_address',
            party_gstin = p_header ->> 'party_gstin',
            party_phone = p_header ->> 'party_phone',
            party_contact = p_header ->> 'party_contact',
            place_of_supply = p_header ->> 'place_of_supply',
            party_state_code = p_header ->> 'party_state_code',
            ship_to = p_header ->> 'ship_to',
            invoice_type = p_header ->> 'invoice_type',
            delivery_mode = p_header ->> 'delivery_mode',
            reverse_charge = COALESCE((p_header ->> 'reverse_charge')::BOOLEAN, false),
            tax_type = COALESCE(p_header ->> 'tax_type', 'intra'),
            subtotal = COALESCE((p_header ->> 'subtotal')::NUMERIC, 0),
            additional_charge = COALESCE((p_header ->> 'additional_charge')::NUMERIC, 0),
            total_taxable = COALESCE((p_header ->> 'total_taxable')::NUMERIC, 0),
            cgst_total = COALESCE((p_header ->> 'cgst_total')::NUMERIC, 0),
            sgst_total = COALESCE((p_header ->> 'sgst_total')::NUMERIC, 0),
            igst_total = COALESCE((p_header ->> 'igst_total')::NUMERIC, 0),
            total_tax = COALESCE((p_header ->> 'total_tax')::NUMERIC, 0),
            round_off = COALESCE((p_header ->> 'round_off')::NUMERIC, 0),
            grand_total = COALESCE((p_header ->> 'grand_total')::NUMERIC, 0),
            amount_in_words = p_header ->> 'amount_in_words',
            payment_type = p_header ->> 'payment_type',
            outstanding = COALESCE((p_header ->> 'grand_total')::NUMERIC, 0) - amount_paid,
            terms_title = p_header ->> 'terms_title',
            terms_detail = p_header ->> 'terms_detail',
            document_note = p_header ->> 'document_note',
            status = COALESCE(p_header ->> 'status', status),
            pdf_url = COALESCE(p_header ->> 'pdf_url', pdf_url),
            updated_at = NOW()
        WHERE id = v_id;

        DELETE FROM public.sale_invoice_items WHERE invoice_id = v_id;
    END IF;

    -- (Re)insert the line snapshots.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_line := v_line + 1;
        INSERT INTO public.sale_invoice_items (
            invoice_id, line_no, product_id, name, hsn_sac, uom, qty, unit_price,
            discount_type, discount_value, gst_rate,
            taxable_amount, cgst_amount, sgst_amount, igst_amount, line_total
        ) VALUES (
            v_id, v_line, NULLIF(v_item ->> 'product_id','')::UUID, v_item ->> 'name', v_item ->> 'hsn_sac',
            v_item ->> 'uom', COALESCE((v_item ->> 'qty')::NUMERIC, 0), COALESCE((v_item ->> 'unit_price')::NUMERIC, 0),
            COALESCE(v_item ->> 'discount_type', 'amount'), COALESCE((v_item ->> 'discount_value')::NUMERIC, 0),
            COALESCE((v_item ->> 'gst_rate')::NUMERIC, 0),
            COALESCE((v_item ->> 'taxable_amount')::NUMERIC, 0), COALESCE((v_item ->> 'cgst_amount')::NUMERIC, 0),
            COALESCE((v_item ->> 'sgst_amount')::NUMERIC, 0), COALESCE((v_item ->> 'igst_amount')::NUMERIC, 0),
            COALESCE((v_item ->> 'line_total')::NUMERIC, 0)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'id', v_id,
        'invoice_no', (SELECT invoice_no FROM public.sale_invoices WHERE id = v_id)
    );
END;
$save_inv$;

-- ── 10) FUNCTION: set_default_issuer_company(id) — flip the single default ────
CREATE OR REPLACE FUNCTION public.set_default_issuer_company(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $set_def$
BEGIN
    IF NOT ((auth.jwt() ->> 'user_role') = 'Admin'
            OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin')) THEN
        RAISE EXCEPTION 'Not authorised';
    END IF;
    UPDATE public.issuer_companies SET is_default = false, updated_at = NOW()
        WHERE is_default = true AND id <> p_id;
    UPDATE public.issuer_companies SET is_default = true, updated_at = NOW()
        WHERE id = p_id;
END;
$set_def$;

-- ── 11) TRIGGER: recompute invoice amount_paid / outstanding from receipts ────
CREATE OR REPLACE FUNCTION public.recompute_invoice_outstanding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $recompute$
DECLARE
    v_invoice UUID := COALESCE(NEW.invoice_id, OLD.invoice_id);
    v_paid NUMERIC(12,2);
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
        FROM public.payment_receipts WHERE invoice_id = v_invoice;
    UPDATE public.sale_invoices
        SET amount_paid = v_paid,
            outstanding = GREATEST(grand_total - v_paid, 0),
            updated_at = NOW()
        WHERE id = v_invoice;
    RETURN NULL;
END;
$recompute$;

DROP TRIGGER IF EXISTS trg_recompute_invoice_outstanding ON public.payment_receipts;
CREATE TRIGGER trg_recompute_invoice_outstanding
AFTER INSERT OR UPDATE OR DELETE ON public.payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.recompute_invoice_outstanding();

-- ── 12) Function grants: authenticated (admin-guarded) only, never anon ───────
REVOKE ALL ON FUNCTION public.save_sale_invoice(UUID, UUID, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_sale_invoice(UUID, UUID, UUID, JSONB, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.set_default_issuer_company(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_issuer_company(UUID) TO authenticated;

-- ── 13) RLS — every table is ADMIN-ONLY (no public/anon access) ───────────────
ALTER TABLE public.issuer_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admins full access on issuer_companies" ON public.issuer_companies;
CREATE POLICY "Allow admins full access on issuer_companies" ON public.issuer_companies
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'))
    WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'));

ALTER TABLE public.billing_parties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admins full access on billing_parties" ON public.billing_parties;
CREATE POLICY "Allow admins full access on billing_parties" ON public.billing_parties
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'))
    WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'));

ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admins full access on invoice_number_counters" ON public.invoice_number_counters;
CREATE POLICY "Allow admins full access on invoice_number_counters" ON public.invoice_number_counters
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'))
    WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'));

ALTER TABLE public.sale_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admins full access on sale_invoices" ON public.sale_invoices;
CREATE POLICY "Allow admins full access on sale_invoices" ON public.sale_invoices
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'))
    WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'));

ALTER TABLE public.sale_invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admins full access on sale_invoice_items" ON public.sale_invoice_items;
CREATE POLICY "Allow admins full access on sale_invoice_items" ON public.sale_invoice_items
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'))
    WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'));

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow admins full access on payment_receipts" ON public.payment_receipts;
CREATE POLICY "Allow admins full access on payment_receipts" ON public.payment_receipts
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'))
    WITH CHECK ((auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin'));
