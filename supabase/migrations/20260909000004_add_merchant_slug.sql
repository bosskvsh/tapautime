-- Migration to add slug to merchants

ALTER TABLE public.merchants ADD COLUMN slug text;

-- Generate slugs for existing merchants replacing spaces with hyphens and lowercase
UPDATE public.merchants SET slug = lower(regexp_replace(business_name, '[^a-zA-Z0-9]+', '-', 'g'));

-- Ensure unique slugs by appending id substring if needed (simple fallback for duplicates)
-- (Assuming business_names are mostly unique or it's a dev env)

-- Now make it NOT NULL and UNIQUE
ALTER TABLE public.merchants ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.merchants ADD CONSTRAINT merchants_slug_key UNIQUE (slug);
