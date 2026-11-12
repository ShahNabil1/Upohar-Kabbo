ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_header boolean NOT NULL DEFAULT true;

UPDATE public.categories c
SET is_featured = true
WHERE c.id IN (
  SELECT id FROM public.categories WHERE is_active = true ORDER BY sort_order, created_at LIMIT 4
);