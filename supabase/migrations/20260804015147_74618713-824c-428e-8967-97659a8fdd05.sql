INSERT INTO public.order_consignments (order_id, provider, consignment_id, merchant_order_id, status, status_message, delivery_fee, cod_amount, raw)
SELECT o.id, 'pathao', o.courier_consignment_id, o.order_number, 'pending', 'Order created', 60, o.total - o.advance_amount, '{}'::jsonb
FROM public.orders o
WHERE o.order_number = 'UK-02'
  AND o.courier_consignment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.order_consignments c
    WHERE c.order_id = o.id AND c.provider = 'pathao'
  );

UPDATE public.orders
SET courier_status = 'pending'
WHERE order_number = 'UK-02' AND courier_status = 'unknown';