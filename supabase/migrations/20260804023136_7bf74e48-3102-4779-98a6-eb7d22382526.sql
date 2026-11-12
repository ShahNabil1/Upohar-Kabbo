CREATE OR REPLACE FUNCTION public.courier_webhook_apply(_provider text, _event text, _consignment_id text, _merchant_order_id text, _payload jsonb, _status text, _raw_status text, _message text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  event_id uuid; target uuid; next_status text; note text;
  cur_status text; cur_rank int; new_rank int;
BEGIN
  INSERT INTO public.courier_webhook_events (provider, event, consignment_id, merchant_order_id, payload, processed)
  VALUES (_provider, _event, _consignment_id, _merchant_order_id, COALESCE(_payload,'{}'::jsonb), false)
  RETURNING id INTO event_id;

  IF _raw_status IS NULL OR _raw_status = '' THEN
    UPDATE public.courier_webhook_events SET processed = true WHERE id = event_id;
    RETURN jsonb_build_object('processed', true, 'message', 'No status in payload — logged only');
  END IF;

  IF _consignment_id IS NOT NULL AND _consignment_id <> '' THEN
    SELECT order_id INTO target FROM public.order_consignments
     WHERE consignment_id = _consignment_id LIMIT 1;
  END IF;
  IF target IS NULL AND _merchant_order_id IS NOT NULL AND _merchant_order_id <> '' THEN
    SELECT id INTO target FROM public.orders WHERE order_number = _merchant_order_id LIMIT 1;
  END IF;
  IF target IS NULL THEN
    UPDATE public.courier_webhook_events SET processed = false, error = 'No matching order found for this event' WHERE id = event_id;
    RETURN jsonb_build_object('processed', false, 'message', 'No matching order found for this event');
  END IF;

  UPDATE public.order_consignments SET
    status = _status,
    status_message = COALESCE(_message, _raw_status),
    raw = COALESCE(_payload,'{}'::jsonb),
    consignment_id = COALESCE(NULLIF(_consignment_id,''), consignment_id),
    updated_at = now()
  WHERE order_id = target AND provider = _provider;

  -- normalised courier status -> order status
  next_status := CASE _status
    WHEN 'picked'             THEN 'shipped'
    WHEN 'in_transit'         THEN 'shipped'
    WHEN 'delivered'          THEN 'delivered'
    WHEN 'partial_delivered'  THEN 'partial_delivered'
    WHEN 'return_in_transit'  THEN 'awaiting_return'
    WHEN 'returned'           THEN 'returned'
    WHEN 'cancelled'          THEN 'cancelled'
    WHEN 'lost'               THEN 'lost_damaged'
    ELSE NULL END;

  SELECT status::text INTO cur_status FROM public.orders WHERE id = target;

  -- never overwrite manual financial / terminal-accounting states
  IF cur_status IN ('paid','unpaid','lost_damaged') THEN
    next_status := NULL;
  END IF;

  -- never move an order backwards on a late/out-of-order event
  IF next_status IS NOT NULL THEN
    cur_rank := CASE cur_status
      WHEN 'incomplete' THEN 0 WHEN 'pending' THEN 1 WHEN 'no_response' THEN 1
      WHEN 'good_no_response' THEN 1 WHEN 'hold' THEN 1 WHEN 'confirmed' THEN 2
      WHEN 'processing' THEN 2 WHEN 'rts' THEN 3 WHEN 'shipped' THEN 4
      WHEN 'partial_delivered' THEN 5 WHEN 'delivered' THEN 5
      WHEN 'awaiting_return' THEN 5 WHEN 'returned' THEN 6
      WHEN 'cancelled' THEN 6 WHEN 'lost_damaged' THEN 6 ELSE 0 END;
    new_rank := CASE next_status
      WHEN 'shipped' THEN 4 WHEN 'partial_delivered' THEN 5 WHEN 'delivered' THEN 5
      WHEN 'awaiting_return' THEN 5 WHEN 'returned' THEN 6
      WHEN 'cancelled' THEN 6 WHEN 'lost_damaged' THEN 6 ELSE 0 END;
    IF new_rank < cur_rank THEN next_status := NULL; END IF;
  END IF;

  UPDATE public.orders SET
    courier_status = _status,
    courier_consignment_id = COALESCE(NULLIF(_consignment_id,''), courier_consignment_id),
    status = COALESCE(next_status::order_status, status)
  WHERE id = target;

  note := _provider || ' update: ' || _raw_status || COALESCE(' — ' || _message, '');
  INSERT INTO public.order_activity (order_id, kind, message, meta)
  VALUES (target, 'courier', note, jsonb_build_object(
    'actor', _provider || ' webhook', 'provider', _provider, 'status', _status,
    'raw_status', _raw_status, 'consignment_id', _consignment_id,
    'order_status', next_status));

  UPDATE public.courier_webhook_events SET processed = true, error = NULL WHERE id = event_id;
  RETURN jsonb_build_object('processed', true, 'message',
    'Courier status ' || _status || COALESCE(' → order ' || next_status, ' (order status unchanged)'));
END $function$;