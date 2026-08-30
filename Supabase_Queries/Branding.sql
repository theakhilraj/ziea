CREATE TABLE IF NOT EXISTS public.branding_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    section_name TEXT UNIQUE NOT NULL,
    images JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.branding_assets ENABLE ROW LEVEL SECURITY;

-- Allow public read access
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'branding_assets' AND policyname = 'Allow public read access on branding'
    ) THEN
        CREATE POLICY "Allow public read access on branding" 
            ON public.branding_assets FOR SELECT USING (true);
    END IF;
END $$;

-- Allow admins full access
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'branding_assets' AND policyname = 'Allow admins full access on branding'
    ) THEN
        CREATE POLICY "Allow admins full access on branding" 
            ON public.branding_assets FOR ALL USING (
                auth.uid() IN (SELECT id FROM public.users WHERE role = 'Admin')
            );
    END IF;
END $$;

-- Insert defaults if not exist
INSERT INTO public.branding_assets (section_name)
VALUES ('Home Page'), ('About Us'), ('Contact Us'), ('Auth Section'), ('Customisation Studio')
ON CONFLICT (section_name) DO NOTHING;
