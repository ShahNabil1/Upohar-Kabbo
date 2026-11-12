ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'incomplete';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'no_response';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'good_no_response';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'hold';

CREATE TABLE IF NOT EXISTS public.order_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note',
  message text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_activity TO authenticated;
GRANT ALL ON public.order_activity TO service_role;

ALTER TABLE public.order_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage order activity" ON public.order_activity
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS order_activity_order_idx ON public.order_activity(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_phone_status_idx ON public.orders(customer_phone, status);