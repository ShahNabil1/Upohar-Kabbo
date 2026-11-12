ALTER TABLE public.order_consignments
  ADD COLUMN IF NOT EXISTS payment_invoice_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

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
  collected numeric;
  return_id text;
  invoice_id text;
BEGIN
  IF lower(_provider) = 'pathao' THEN
    pathao_signal := lower(regexp_replace(COALESCE(
      NULLIF(_event, ''), NULLIF(_payload->>'event', ''),
      NULLIF(_payload->>'order_status_slug', ''), NULLIF(_payload->>'order_status', ''), ''),
      '[[:space:]\-\.]+', '_', 'g'));
    pathao_signal := regexp_replace(pathao_signal, '^order_', '');

    effective_status := CASE pathao_signal
      WHEN 'created' THEN 'pending'
      WHEN 'updated' THEN 'pending'
      WHEN 'pickup_requested' THEN 'pending'
      WHEN 'assigned_for_pickup' THEN 'pending'
      WHEN 'picked' THEN 'picked'
      WHEN 'pickup' THEN 'picked'
      WHEN 'at_the_sorting_hub' THEN 'in_transit'
      WHEN 'in_transit' THEN 'in_transit'
      WHEN 'received_at_last_mile_hub' THEN 'in_transit'
      WHEN 'assigned_for_delivery' THEN 'in_transit'
      WHEN 'pickup_failed' THEN 'hold'
      WHEN 'delivery_failed' THEN 'hold'
      WHEN 'on_hold' THEN 'hold'
      WHEN 'pickup_cancelled' THEN 'cancelled'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'delivered' THEN 'delivered'
      WHEN 'partial_delivery' THEN 'partial_delivered'
      WHEN 'partial_delivered' THEN 'partial_delivered'
      WHEN 'paid_return' THEN 'partial_delivered'
      WHEN 'returned' THEN 'return_in_transit'
      WHEN 'return' THEN 'return_in_transit'
      WHEN 'return_id_created' THEN 'return_id_created'
      WHEN 'return_in_transit' THEN 'return_in_transit'
      WHEN 'returned_to_merchant' THEN 'returned'
      WHEN 'exchanged' THEN 'exchange'
      WHEN 'exchange' THEN 'exchange'
      WHEN 'paid' THEN 'paid_invoice'
      WHEN 'lost' THEN 'lost'
      WHEN 'damaged' THEN 'lost'
      ELSE effective_status
    END;
  END IF;

  INSERT INTO public.courier_webhook_events (provider, event, consignment_id, merchant_order_id, payload, processed)
  VALUES (_provider, _event, _consignment_id, _merchant_order_id, COALESCE(_payload,'{}'::jsonb), false)
  RETURNING id INTO event_id;

  IF (_raw_status IS NULL OR _raw_status = '') AND (effective_status IS NULL OR effective_status = '') THEN
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

  collected := NULLIF(regexp_replace(COALESCE(
      _payload->>'collected_amount', _payload->>'collected_amount_in_bdt',
      _payload->>'amount_collected', _payload->>'partial_delivery_amount', ''),
      '[^0-9.\-]', '', 'g'), '')::numeric;

  return_id := NULLIF(btrim(COALESCE(
      _payload->>'return_id', _payload->>'return_consignment_id',
      _payload->>'return_order_id', _payload->>'returned_consignment_id', '')), '');

  invoice_id := NULLIF(btrim(COALESCE(_payload->>'invoice_id', '')), '');

  -- Payment-invoice events carry no parcel movement: record the payout and stop.
  IF effective_status = 'paid_invoice' THEN
    UPDATE public.order_consignments SET
      collected_amount = COALESCE(collected, collected_amount),
      payment_invoice_id = COALESCE(invoice_id, payment_invoice_id),
      paid_at = COALESCE(paid_at, now()),
      raw = COALESCE(_payload,'{}'::jsonb),
      updated_at = now()
    WHERE order_id = target AND provider = _provider;

    INSERT INTO public.order_activity (order_id, kind, message, meta)
    VALUES (target, 'courier',
      _provider || ' payment invoice' || COALESCE(' · Invoice ' || invoice_id, '')
        || COALESCE(' · Collected ৳' || collected::text, ''),
      jsonb_build_object('actor', _provider || ' webhook', 'provider', _provider,
        'status', 'paid_invoice', 'raw_status', _raw_status,
        'invoice_id', invoice_id, 'collected_amount', collected));

    UPDATE public.courier_webhook_events SET processed = true, error = NULL WHERE id = event_id;
    RETURN jsonb_build_object('processed', true, 'message', 'Payment invoice recorded (order status unchanged)');
  END IF;

  UPDATE public.order_consignments SET
    status = effective_status,
    status_message = COALESCE(_message, _raw_status),
    collected_amount = COALESCE(collected, collected_amount),
    return_consignment_id = COALESCE(return_id, return_consignment_id),
    raw = COALESCE(_payload,'{}'::jsonb),
    updated_at = now()
  WHERE order_id = target AND provider = _provider;

  next_status := CASE effective_status
    WHEN 'pending' THEN 'rts'
    WHEN 'picked' THEN 'shipped'
    WHEN 'in_transit' THEN 'shipped'
    WHEN 'hold' THEN 'courier_hold'
    WHEN 'delivered' THEN 'delivered'
    WHEN 'partial_delivered' THEN 'partial_delivered'
    WHEN 'return_id_created' THEN 'awaiting_return'
    WHEN 'return_in_transit' THEN 'awaiting_return'
    WHEN 'returned' THEN 'returned'
    WHEN 'exchange' THEN 'exchange'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'lost' THEN 'lost_damaged'
    ELSE NULL
  END;

  SELECT status::text INTO cur_status FROM public.orders WHERE id = target;

  cur_rank := CASE cur_status
    WHEN 'pending' THEN 0 WHEN 'rts' THEN 1 WHEN 'courier_hold' THEN 2
    WHEN 'shipped' THEN 3 WHEN 'partial_delivered' THEN 4 WHEN 'exchange' THEN 5
    WHEN 'delivered' THEN 6 WHEN 'awaiting_return' THEN 6 WHEN 'returned' THEN 7
    WHEN 'lost_damaged' THEN 8 WHEN 'cancelled' THEN 8 ELSE -1 END;
  new_rank := CASE next_status
    WHEN 'pending' THEN 0 WHEN 'rts' THEN 1 WHEN 'courier_hold' THEN 2
    WHEN 'shipped' THEN 3 WHEN 'partial_delivered' THEN 4 WHEN 'exchange' THEN 5
    WHEN 'delivered' THEN 6 WHEN 'awaiting_return' THEN 6 WHEN 'returned' THEN 7
    WHEN 'lost_damaged' THEN 8 WHEN 'cancelled' THEN 8 ELSE -1 END;

  IF next_status IS NOT NULL AND cur_status IS DISTINCT FROM next_status
     AND (new_rank >= cur_rank OR cur_status = 'courier_hold') THEN
    UPDATE public.orders SET status = next_status::public.order_status, updated_at = now() WHERE id = target;
  ELSE
    next_status := NULL;
  END IF;

  note := _provider || ' webhook: ' || COALESCE(NULLIF(_raw_status, ''), effective_status)
    || COALESCE(' · ' || _message, '')
    || COALESCE(' · Collected ৳' || collected::text, '')
    || COALESCE(' · Return ID ' || return_id, '')
    || COALESCE(' → ' || next_status, '');

  INSERT INTO public.order_activity (order_id, kind, message, meta)
  VALUES (target, 'courier', note,
    jsonb_build_object('actor', _provider || ' webhook', 'provider', _provider,
      'status', effective_status, 'raw_status', _raw_status,
      'collected_amount', collected, 'return_id', return_id));

  UPDATE public.courier_webhook_events SET processed = true, error = NULL WHERE id = event_id;
  RETURN jsonb_build_object('processed', true, 'message', 'Applied', 'order_status', next_status);
END;
$function$;

UPDATE public.order_consignments oc
SET payment_invoice_id = COALESCE(oc.payment_invoice_id, a.meta->>'invoice_id'),
    paid_at = COALESCE(oc.paid_at, a.created_at)
FROM public.order_activity a
WHERE a.order_id = oc.order_id
  AND a.meta->>'status' = 'paid_invoice';