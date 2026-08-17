-- ─────────────────────────────────────────────────────────────────────────────
-- WhatsApp orders. Buy Now (and later the cart) records the customer's intent
-- here BEFORE redirecting them to WhatsApp, so no lead is ever lost. Payment and
-- confirmation happen in the WhatsApp chat; admins move the row through statuses.
-- Idempotent — safe to run as-is.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- null for guests
    customer_name TEXT,
    customer_phone TEXT,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_code TEXT,
    product_name TEXT,
    size TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Initiated', -- Initiated | Confirmed | Fulfilled | Cancelled
    source TEXT NOT NULL DEFAULT 'buy_now',   -- buy_now | cart
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grouping: every line item placed in one checkout shares an order_group_id, and
-- carries a short human-friendly order_number shown to the customer ("My Orders")
-- and referenced in the WhatsApp chat. Added idempotently; legacy rows keep NULL
-- (each is then treated as its own single-item order by the app).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_group_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number   TEXT;

-- Fast filters for the admin inbox (status tabs) + newest-first ordering.
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
-- Fast "My Orders" lookups: a customer's own orders, and a single order by number/group.
CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_group_idx ON orders (order_group_id);
CREATE INDEX IF NOT EXISTS orders_number_idx ON orders (order_number);

-- Row Level Security.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Anyone (incl. guests) may place an order.
DROP POLICY IF EXISTS "Enable insert access for all users" ON orders;
CREATE POLICY "Enable insert access for all users" ON orders
    FOR INSERT WITH CHECK (true);

-- Read access: a customer sees ONLY their own orders (My Orders); admins see all.
-- Admin is recognised either via the `user_role` JWT claim (when the custom
-- access-token hook is applied) OR via a self-lookup of the user's role — so this
-- works whether or not Admin_Role_Claim_Hook.sql has been applied.
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON orders;
DROP POLICY IF EXISTS "Users read own orders, admins read all" ON orders;
CREATE POLICY "Users read own orders, admins read all" ON orders
    FOR SELECT TO authenticated USING (
        auth.uid() = user_id
        OR (auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'Admin'
        )
    );

-- Update access: admins may move an order through any status; a customer may only
-- CANCEL their own order while it is still "Initiated" (nothing confirmed/shipped).
-- USING checks the existing row (own + Initiated); WITH CHECK checks the new row
-- (own + Cancelled), so a customer can do nothing but Initiated -> Cancelled.
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON orders;
DROP POLICY IF EXISTS "Owners cancel initiated, admins update all" ON orders;
CREATE POLICY "Owners cancel initiated, admins update all" ON orders
    FOR UPDATE TO authenticated
    USING (
        (auth.uid() = user_id AND status = 'Initiated')
        OR (auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin')
    )
    WITH CHECK (
        (auth.uid() = user_id AND status = 'Cancelled')
        OR (auth.jwt() ->> 'user_role') = 'Admin'
        OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'Admin')
    );

-- Realtime: live admin sidebar counter on new orders / status changes.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
