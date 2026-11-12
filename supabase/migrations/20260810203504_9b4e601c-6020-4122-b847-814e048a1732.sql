CREATE TABLE public.tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  platform text NOT NULL,
  event_name text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 1,
  message text,
  match_keys text[] NOT NULL DEFAULT '{}',
  emq integer,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracking_events TO authenticated;
GRANT ALL ON public.tracking_events TO service_role;

ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view tracking events"
ON public.tracking_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff can write tracking events"
ON public.tracking_events FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE UNIQUE INDEX tracking_events_sent_unique
  ON public.tracking_events (order_id, platform, event_name)
  WHERE status = 'sent';

CREATE INDEX tracking_events_order_idx ON public.tracking_events (order_id, created_at DESC);
CREATE INDEX tracking_events_created_idx ON public.tracking_events (created_at DESC);

CREATE TRIGGER trg_tracking_events_updated
BEFORE UPDATE ON public.tracking_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();