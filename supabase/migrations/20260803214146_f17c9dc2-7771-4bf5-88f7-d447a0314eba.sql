UPDATE public.orders SET status = 'processing', updated_at = now() WHERE order_number = 'UK-01';

INSERT INTO public.order_activity (order_id, kind, message, meta)
VALUES (
  (SELECT id FROM public.orders WHERE order_number = 'UK-01'),
  'status_change',
  'Status changed to Processing',
  '{"from":"pending","to":"processing"}'::jsonb
);