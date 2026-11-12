CREATE OR REPLACE FUNCTION public.checkout_place_order(_order jsonb, _items jsonb, _coupon_id uuid DEFAULT NULL::uuid, _discount numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid; new_number text; it jsonb; item_count int := 0;
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'NO_ITEMS'; END IF;

  INSERT INTO public.orders (
    customer_name, customer_phone, customer_email, address_line, city,
    division, district, upazila, delivery_area, note,
    subtotal, delivery_charge, discount, total,
    payment_method, status, source, customer_ip
  ) VALUES (
    _order->>'customer_name', _order->>'customer_phone', _order->>'customer_email',
    _order->>'address_line', _order->>'city',
    _order->>'division', _order->>'district', _order->>'upazila',
    _order->>'delivery_area', _order->>'note',
    COALESCE((_order->>'subtotal')::numeric,0), COALESCE((_order->>'delivery_charge')::numeric,0),
    COALESCE((_order->>'discount')::numeric,0), COALESCE((_order->>'total')::numeric,0),
    'cod', 'processing'::order_status, COALESCE(_order->>'source','website'), _order->>'customer_ip'
  ) RETURNING id, order_number INTO new_id, new_number;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.order_items (order_id, product_id, product_name, product_slug, variant_label, sku, unit_price, quantity, line_total, combo_selections)
    VALUES (new_id, (it->>'product_id')::uuid, it->>'product_name', it->>'product_slug',
            it->>'variant_label', it->>'sku', COALESCE((it->>'unit_price')::numeric,0),
            COALESCE((it->>'quantity')::int,1), COALESCE((it->>'line_total')::numeric,0),
            COALESCE(it->'combo_selections', '[]'::jsonb));
    item_count := item_count + 1;
  END LOOP;

  IF _coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_redemptions (coupon_id, order_id, phone, discount_amount)
    VALUES (_coupon_id, new_id, _order->>'customer_phone', COALESCE(_discount,0));
  END IF;

  INSERT INTO public.order_activity (order_id, kind, message, meta)
  VALUES (
    new_id, 'status',
    'Order placed by customer · ' || item_count::text || ' item(s) · Total '
      || COALESCE((_order->>'total'), '0')
      || ' · Source ' || COALESCE(_order->>'source','website')
      || COALESCE(' · Customer note: ' || NULLIF(btrim(COALESCE(_order->>'note','')), ''), ''),
    jsonb_build_object(
      'actor', COALESCE(_order->>'customer_name','Customer'),
      'from', NULL, 'to', 'processing',
      'source', COALESCE(_order->>'source','website'),
      'customer_note', NULLIF(btrim(COALESCE(_order->>'note','')), ''),
      'customer_ip', _order->>'customer_ip',
      'total', COALESCE((_order->>'total')::numeric,0),
      'items', item_count)
  );

  DELETE FROM public.orders
   WHERE customer_phone = _order->>'customer_phone' AND status = 'incomplete'::order_status;

  RETURN jsonb_build_object('id', new_id, 'order_number', new_number);
END $function$;