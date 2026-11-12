ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'rts' AFTER 'pending';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_provider TEXT,
  ADD COLUMN IF NOT EXISTS courier_consignment_id TEXT,
  ADD COLUMN IF NOT EXISTS courier_tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS courier_status TEXT,
  ADD COLUMN IF NOT EXISTS courier_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_courier_consignment
  ON public.orders(courier_consignment_id) WHERE courier_consignment_id IS NOT NULL;