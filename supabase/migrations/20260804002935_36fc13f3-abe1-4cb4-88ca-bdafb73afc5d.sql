-- 1. Delivery partners
CREATE TABLE public.delivery_partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE CHECK (provider IN ('steadfast','pathao','carrybee')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  credentials JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  webhook_secret TEXT,
  connection_ok BOOLEAN NOT NULL DEFAULT false,
  connection_message TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.delivery_partners TO authenticated;
GRANT ALL ON public.delivery_partners TO service_role;
ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view delivery partners" ON public.delivery_partners
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Consignments
CREATE TABLE public.order_consignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('steadfast','pathao','carrybee')),
  consignment_id TEXT,
  tracking_code TEXT,
  merchant_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  status_message TEXT,
  delivery_fee NUMERIC,
  cod_amount NUMERIC,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_consignments_order ON public.order_consignments(order_id);
CREATE UNIQUE INDEX idx_order_consignments_unique
  ON public.order_consignments(provider, consignment_id) WHERE consignment_id IS NOT NULL;
GRANT SELECT ON public.order_consignments TO authenticated;
GRANT ALL ON public.order_consignments TO service_role;
ALTER TABLE public.order_consignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view consignments" ON public.order_consignments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Webhook event log
CREATE TABLE public.courier_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  event TEXT,
  consignment_id TEXT,
  merchant_order_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_courier_webhook_events_created ON public.courier_webhook_events(created_at DESC);
GRANT SELECT ON public.courier_webhook_events TO authenticated;
GRANT ALL ON public.courier_webhook_events TO service_role;
ALTER TABLE public.courier_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view courier webhook events" ON public.courier_webhook_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4. Bulk dispatch jobs (chunked queue)
CREATE TABLE public.courier_bulk_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.courier_bulk_job_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.courier_bulk_jobs(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  message TEXT,
  consignment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_courier_bulk_job_items_job ON public.courier_bulk_job_items(job_id);
GRANT SELECT ON public.courier_bulk_jobs TO authenticated;
GRANT ALL ON public.courier_bulk_jobs TO service_role;
GRANT SELECT ON public.courier_bulk_job_items TO authenticated;
GRANT ALL ON public.courier_bulk_job_items TO service_role;
ALTER TABLE public.courier_bulk_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_bulk_job_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view bulk jobs" ON public.courier_bulk_jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can view bulk job items" ON public.courier_bulk_job_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5. updated_at triggers
CREATE TRIGGER update_delivery_partners_updated_at BEFORE UPDATE ON public.delivery_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_order_consignments_updated_at BEFORE UPDATE ON public.order_consignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_courier_bulk_jobs_updated_at BEFORE UPDATE ON public.courier_bulk_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_courier_bulk_job_items_updated_at BEFORE UPDATE ON public.courier_bulk_job_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();