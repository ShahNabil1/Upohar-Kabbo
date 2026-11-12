ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS advance_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_method text,
  ADD COLUMN IF NOT EXISTS delivery_partner text;