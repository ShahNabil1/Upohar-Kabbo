ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_scheduled_for
  ON public.orders (scheduled_for)
  WHERE status = 'scheduled_order'::order_status;

CREATE OR REPLACE FUNCTION public.promote_scheduled_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE moved int := 0; r record;
BEGIN
  FOR r IN
    SELECT id FROM public.orders
     WHERE status = 'scheduled_order'::order_status
       AND scheduled_for IS NOT NULL
       AND scheduled_for <= now()
  LOOP
    UPDATE public.orders
       SET status = 'processing'::order_status
     WHERE id = r.id;

    INSERT INTO public.order_activity (order_id, kind, message, meta)
    VALUES (r.id, 'status', 'Scheduled date reached — status changed scheduled_order → processing',
            jsonb_build_object('actor', 'System', 'from', 'scheduled_order', 'to', 'processing'));

    moved := moved + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'promoted', moved, 'ran_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_scheduled_orders() TO authenticated, service_role;