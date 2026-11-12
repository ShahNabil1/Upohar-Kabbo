CREATE OR REPLACE FUNCTION public.courier_webhook_apply(_provider text, _event text, _consignment_id text, _merchant_order_id text, _payload jsonb, _status text, _raw_status text, _message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  event_id uuid; target uuid; next_status text; note text;
  cur_status text; cur_rank int; new_rank int;
  effective_status text := _status;
  pathao_signal text;
BEGIN
  -- Resolve canonical Pathao state inside the database as a final safety net.
  -- This prevents a stale application deployment from turning a valid Picked
  -- webhook into Pending/Unknown before it reaches the transition engine.
  IF lower(_provider) = 'pathao' THEN
    pathao_signal := lower(regexp_replace(COALESCE(NULLIF(_payload->>'order_status_slug', ''), NULLIF(_event, ''), NULLIF(_payload->>'event', ''), NULLIF(_payload->>'order_status', ''), ''), '[[:space:]-]+', '_', 'g'));
    effective_status := CASE pathao_signal
      WHEN 'picked' THEN 'picked'
      WHEN 'pickup' THEN 'picked'
      WHEN 'order.picked' THEN 'picked'
      WHEN 'order.pickup' THEN 'picked'
      WHEN 'pickup_failed' THEN 'hold'
      WHEN 'order.pickup_failed' THEN 'hold'
      WHEN 'delivery_failed' THEN 'hold'
      WHEN 'order.delivery_failed' THEN 'hold'
      WHEN 'on_hold' THEN 'hold'
      WHEN 'order.on_hold' THEN 'hold'
      WHEN 'assigned_for_delivery' THEN 'in_transit'
      WHEN 'order.assigned_for_delivery' THEN 'in_transit'
      WHEN 'in_transit' THEN 'in_transit'
      WHEN 'order.in_transit' THEN 'in_transit'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'order.delivered' THEN 'delivered'
      WHEN 'partial_delivery' THEN 'partial_delivered'
      WHEN 'order.partial_delivery' THEN 'partial_delivered'
      WHEN 'returned_to_merchant' THEN 'returned'
      WHEN 'order.returned_to_merchant' THEN 'returned'
      WHEN 'lost' THEN 'lost'
      WHEN 'order.lost' THEN 'lost'
      ELSE effective_status
    END;
  END IF;

  INSERT INTO public.courier_webhook_events (provider, event, consignment_id, merchant_order_id, payload, processed)
  VALUES (_provider, _event, _consignment_id, _merchant_order_id, COALESCE(_payload,'{}'::jsonb), false)
  RETURNING id INTO event_id;

  IF _raw_status IS NULL OR _raw_status = '' THEN
    UPDATE public.courier_webhook_events SET processed = true WHERE id = event_id;
    RETURN jsonb_build_object('processed', true, 'message', 'No status in payload — logged only');
  END IF;

  IF _consignment_id IS NOT NULL AND _consignment_id <> '' THEN
    SELECT order_id INTO target FROM public.order_consignments WHERE consignment_id = _consignment_id LIMIT 1;
  END IF;
  IF target IS NULL AND _merchant_order_id IS NOT NULL AND _merchant_order_id <> '' THEN
    SELECT id INTO target FROM public.orders WHERE order_number = _merchant_order_id LIMIT 1;
  END IF;
  IF target IS NULL AND _merchant_order_id IS NOT NULL AND _merchant_order_id <> '' THEN
    SELECT order_id INTO target FROM public.order_consignments WHERE consignment_id = _merchant_order_id LIMIT 1;
  END IF;
  IF target IS NULL AND _consignment_id IS NOT NULL AND _consignment_id <> '' THEN
    SELECT id INTO target FROM public.orders WHERE order_number = _consignment_id LIMIT 1;
  END IF;
  IF target IS NULL THEN
    UPDATE public.courier_webhook_events SET processed = false, error = 'No matching order found for this event' WHERE id = event_id;
    RETURN jsonb_build_object('processed', false, 'message', 'No matching order found for this event');
  END IF;

  UPDATE public.order_consignments SET
    status = effective_status,
    status_message = COALESCE(_message, _raw_status),
    raw = COALESCE(_payload,'{}'::jsonb),
    updated_at = now()
  WHERE order_id = target AND provider = _provider;

  next_status := CASE effective_status
    WHEN 'picked' THEN 'shipped'
    WHEN 'in_transit' THEN 'shipped'
    WHEN 'hold' THEN 'courier_hold'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'partial_delivered' THEN 'partial_delivered'
    WHEN 'return_in_transit' THEN 'awaiting_return'
    WHEN 'returned' THEN 'returned'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'lost' THEN 'lost_damaged'
    ELSE NULL END;

  SELECT status::text INTO cur_status FROM public.orders WHERE id = target;
  IF cur_status IN ('paid','unpaid','lost_damaged') THEN next_status := NULL; END IF;

  IF next_status IS NOT NULL THEN
    cur_rank := CASE cur_status
      WHEN 'incomplete' THEN 0 WHEN 'pending' THEN 1 WHEN 'no_response' THEN 1
      WHEN 'good_no_response' THEN 1 WHEN 'hold' THEN 1 WHEN 'confirmed' THEN 2
      WHEN 'processing' THEN 2 WHEN 'rts' THEN 3
      WHEN 'shipped' THEN 4 WHEN 'courier_hold' THEN 4
      WHEN 'partial_delivered' THEN 5 WHEN 'delivered' THEN 5
      WHEN 'awaiting_return' THEN 5 WHEN 'returned' THEN 6
      WHEN 'cancelled' THEN 6 WHEN 'lost_damaged' THEN 6 ELSE 0 END;
    new_rank := CASE next_status
      WHEN 'shipped' THEN 4 WHEN 'courier_hold' THEN 4
      WHEN 'partial_delivered' THEN 5 WHEN 'delivered' THEN 5
      WHEN 'awaiting_return' THEN 5 WHEN 'returned' THEN 6
      WHEN 'cancelled' THEN 6 WHEN 'lost_damaged' THEN 6 ELSE 0 END;
    IF new_rank < cur_rank THEN next_status := NULL; END IF;
  END IF;

  UPDATE public.orders SET courier_status = effective_status, status = COALESCE(next_status::order_status, status) WHERE id = target;

  note := _provider || ' update: ' || _raw_status || COALESCE(' — ' || _message, '');
  INSERT INTO public.order_activity (order_id, kind, message, meta)
  VALUES (target, 'courier', note, jsonb_build_object('actor', _provider || ' webhook', 'provider', _provider, 'status', effective_status, 'raw_status', _raw_status, 'consignment_id', _consignment_id, 'order_status', next_status));

  UPDATE public.courier_webhook_events SET processed = true, error = NULL WHERE id = event_id;
  RETURN jsonb_build_object('processed', true, 'message', 'Courier status ' || effective_status || COALESCE(' → order ' || next_status, ' (order status unchanged)'));
END $function$;

-- Repair orders currently stuck on Courier Hold even though their newest
-- successfully processed Pathao webhook is a Picked event.
WITH latest_picked AS (
  SELECT DISTINCT ON (o.id) o.id
  FROM public.orders o
  JOIN public.courier_webhook_events e
    ON e.provider = 'pathao'
   AND e.processed = true
   AND (e.merchant_order_id = o.order_number OR e.consignment_id = o.courier_consignment_id)
  WHERE o.status = 'courier_hold'
    AND lower(COALESCE(e.payload->>'order_status_slug', e.event, '')) IN ('picked', 'order.picked')
  ORDER BY o.id, e.created_at DESC
)
UPDATE public.orders o
SET status = 'shipped'::public.order_status,
    courier_status = 'picked',
    updated_at = now()
FROM latest_picked p
WHERE o.id = p.id;

UPDATE public.order_consignments c
SET status = 'picked', status_message = 'Picked up', updated_at = now()
FROM public.orders o
WHERE c.order_id = o.id
  AND c.provider = 'pathao'
  AND o.status = 'shipped'
  AND o.courier_status = 'picked';