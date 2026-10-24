-- Normal (non-GST) sales invoice support.
-- Run after SalesInvoices.sql in the Supabase SQL editor.
-- Normal and GST invoices share the company/financial-year numbering counter;
-- The invoice_kind and /N/ number segment distinguish normal invoices from GST.

ALTER TABLE public.sale_invoices
    ADD COLUMN IF NOT EXISTS invoice_kind TEXT NOT NULL DEFAULT 'gst';
ALTER TABLE public.sale_invoices
    ADD COLUMN IF NOT EXISTS party_email TEXT;
ALTER TABLE public.sale_invoices
    ADD COLUMN IF NOT EXISTS issuer_snapshot JSONB;

ALTER TABLE public.sale_invoices DROP CONSTRAINT IF EXISTS sale_invoices_kind_chk;
ALTER TABLE public.sale_invoices ADD CONSTRAINT sale_invoices_kind_chk
    CHECK (invoice_kind IN ('gst', 'normal'));

ALTER TABLE public.sale_invoices DROP CONSTRAINT IF EXISTS sale_invoices_series_uniq;
ALTER TABLE public.sale_invoices ADD CONSTRAINT sale_invoices_series_uniq
    UNIQUE (issuer_company_id, financial_year, invoice_kind, invoice_seq);

CREATE OR REPLACE FUNCTION public.save_normal_sale_invoice(
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
AS $normal_invoice$
DECLARE
    v_id UUID;
    v_date DATE;
    v_fy TEXT;
    v_prefix TEXT;
    v_seq INT;
    v_no TEXT;
    v_custom_seq TEXT;
    v_issuer JSONB;
    v_item JSONB;
    v_line INT := 0;
    v_paid NUMERIC(12,2) := 0;
    v_subtotal NUMERIC(12,2) := 0;
    v_discount_type TEXT;
    v_discount_value NUMERIC(12,2);
    v_gross NUMERIC(12,2);
    v_discount NUMERIC(12,2);
    v_line_total NUMERIC(12,2);
    v_total NUMERIC(12,2) := 0;
BEGIN
    IF NOT ((auth.jwt() ->> 'user_role') = 'Admin'
            OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin')) THEN
        RAISE EXCEPTION 'Not authorised';
    END IF;

    IF NULLIF(btrim(p_header ->> 'party_name'), '') IS NULL
       OR NULLIF(btrim(p_header ->> 'party_phone'), '') IS NULL
       OR NULLIF(btrim(p_header ->> 'party_address'), '') IS NULL THEN
        RAISE EXCEPTION 'Customer name, phone, and address are required';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'At least one invoice item is required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.issuer_companies WHERE id = p_company_id AND is_active) THEN
        RAISE EXCEPTION 'Choose an active issuing company';
    END IF;

    IF NULLIF(p_header ->> 'invoice_date', '') IS NULL THEN
        RAISE EXCEPTION 'Invoice date is required';
    END IF;
    v_date := (p_header ->> 'invoice_date')::DATE;
    IF v_date > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        RAISE EXCEPTION 'Invoice date cannot be in the future';
    END IF;

    IF p_invoice_id IS NULL THEN
        v_fy := public.gst_financial_year(v_date);
        SELECT to_jsonb(c) INTO v_issuer
        FROM public.issuer_companies c
        WHERE c.id = p_company_id;
        v_prefix := COALESCE(NULLIF(btrim(v_issuer ->> 'invoice_prefix'), ''), 'INV');

        INSERT INTO public.invoice_number_counters (issuer_company_id, financial_year, last_seq)
        VALUES (p_company_id, v_fy, 1)
        ON CONFLICT (issuer_company_id, financial_year)
        DO UPDATE SET last_seq = public.invoice_number_counters.last_seq + 1
        RETURNING last_seq INTO v_seq;

        v_custom_seq := NULLIF(btrim(p_header ->> 'custom_invoice_no'), '');
        IF v_custom_seq IS NOT NULL AND v_custom_seq !~ '^[0-9]+$' THEN
            RAISE EXCEPTION 'Manual invoice number must contain digits only';
        END IF;
        v_custom_seq := COALESCE(v_custom_seq, v_seq::TEXT);
        v_no := v_prefix || '/' || v_fy || '/N/' || lpad(v_custom_seq, GREATEST(4, length(v_custom_seq)), '0');

        INSERT INTO public.sale_invoices (
            invoice_kind, issuer_company_id, billing_party_id, invoice_prefix, financial_year, invoice_seq, invoice_no,
            invoice_date, party_name, party_address, party_phone, party_email, invoice_type,
            tax_type, subtotal, total_taxable, grand_total, amount_paid, outstanding, status, issuer_snapshot
        ) VALUES (
            'normal', p_company_id, p_party_id, v_prefix, v_fy, v_seq, v_no,
            v_date, btrim(p_header ->> 'party_name'), btrim(p_header ->> 'party_address'),
            btrim(p_header ->> 'party_phone'), NULLIF(btrim(p_header ->> 'party_email'), ''),
            'Normal Invoice', 'intra',
            COALESCE((p_header ->> 'subtotal')::NUMERIC, 0),
            COALESCE((p_header ->> 'subtotal')::NUMERIC, 0),
            COALESCE((p_header ->> 'grand_total')::NUMERIC, 0),
            0, COALESCE((p_header ->> 'grand_total')::NUMERIC, 0), 'saved', v_issuer
        ) RETURNING id INTO v_id;
    ELSE
        v_id := p_invoice_id;
        SELECT amount_paid, invoice_no INTO v_paid, v_no
        FROM public.sale_invoices
        WHERE id = v_id AND invoice_kind = 'normal' AND status <> 'cancelled'
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Normal invoice was not found or cannot be edited';
        END IF;

        UPDATE public.sale_invoices SET
            billing_party_id = p_party_id,
            invoice_date = v_date,
            party_name = btrim(p_header ->> 'party_name'),
            party_address = btrim(p_header ->> 'party_address'),
            party_phone = btrim(p_header ->> 'party_phone'),
            party_email = NULLIF(btrim(p_header ->> 'party_email'), ''),
            invoice_type = 'Normal Invoice',
            subtotal = COALESCE((p_header ->> 'subtotal')::NUMERIC, 0),
            total_taxable = COALESCE((p_header ->> 'subtotal')::NUMERIC, 0),
            grand_total = COALESCE((p_header ->> 'grand_total')::NUMERIC, 0),
            outstanding = COALESCE((p_header ->> 'grand_total')::NUMERIC, 0) - v_paid,
            updated_at = NOW()
        WHERE id = v_id;
        DELETE FROM public.sale_invoice_items WHERE invoice_id = v_id;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        IF NULLIF(btrim(v_item ->> 'name'), '') IS NULL
           OR COALESCE((v_item ->> 'qty')::NUMERIC, 0) <= 0
           OR COALESCE((v_item ->> 'unit_price')::NUMERIC, -1) < 0 THEN
            RAISE EXCEPTION 'Each invoice item needs a description, positive quantity, and non-negative unit price';
        END IF;
        v_gross := round((v_item ->> 'qty')::NUMERIC * (v_item ->> 'unit_price')::NUMERIC, 2);
        v_discount_type := COALESCE(NULLIF(v_item ->> 'discount_type', ''), 'amount');
        v_discount_value := COALESCE((v_item ->> 'discount_value')::NUMERIC, 0);
        IF v_discount_type NOT IN ('amount', 'percent')
           OR v_discount_value < 0
           OR (v_discount_type = 'percent' AND v_discount_value > 100)
           OR (v_discount_type = 'amount' AND v_discount_value > v_gross) THEN
            RAISE EXCEPTION 'Discount must be between zero and 100 percent or no more than the item subtotal';
        END IF;
        v_discount := CASE
            WHEN v_discount_type = 'percent' THEN round(v_gross * v_discount_value / 100, 2)
            ELSE v_discount_value
        END;
        v_line_total := round(v_gross - v_discount, 2);
        v_subtotal := v_subtotal + v_gross;
        v_total := v_total + v_line_total;
        v_line := v_line + 1;
        INSERT INTO public.sale_invoice_items (
            invoice_id, line_no, product_id, name, qty, unit_price,
            discount_type, discount_value, gst_rate,
            taxable_amount, cgst_amount, sgst_amount, igst_amount, line_total
        ) VALUES (
            v_id, v_line, NULLIF(v_item ->> 'product_id', '')::UUID, btrim(v_item ->> 'name'),
            (v_item ->> 'qty')::NUMERIC, (v_item ->> 'unit_price')::NUMERIC,
            v_discount_type, v_discount_value, 0,
            v_line_total, 0, 0, 0, v_line_total
        );
    END LOOP;

    UPDATE public.sale_invoices SET
        subtotal = v_subtotal,
        total_taxable = v_total,
        grand_total = v_total,
        outstanding = v_total - amount_paid,
        updated_at = NOW()
    WHERE id = v_id;

    RETURN jsonb_build_object('id', v_id, 'invoice_no', v_no);
END;
$normal_invoice$;

REVOKE ALL ON FUNCTION public.save_normal_sale_invoice(UUID, UUID, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_normal_sale_invoice(UUID, UUID, UUID, JSONB, JSONB) TO authenticated;
