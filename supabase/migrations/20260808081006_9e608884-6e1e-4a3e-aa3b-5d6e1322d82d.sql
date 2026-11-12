ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_consignments REPLICA IDENTITY FULL;
ALTER TABLE public.courier_webhook_events REPLICA IDENTITY FULL;
ALTER TABLE public.order_activity REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_consignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_webhook_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_activity;