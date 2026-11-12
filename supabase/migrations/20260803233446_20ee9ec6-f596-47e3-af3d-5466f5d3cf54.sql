CREATE TABLE public.order_presence (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  actor_name text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.order_presence TO authenticated;
GRANT ALL ON public.order_presence TO service_role;

ALTER TABLE public.order_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view order presence"
  ON public.order_presence FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE TRIGGER trg_order_presence_updated
  BEFORE UPDATE ON public.order_presence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.order_presence REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_presence;