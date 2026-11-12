ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note_template text;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_partners_single_default
  ON public.delivery_partners ((is_default)) WHERE is_default;