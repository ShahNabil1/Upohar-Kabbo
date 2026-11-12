ALTER TABLE public.order_items
  ADD COLUMN combo_selections jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.checkout_place_order(_order jsonb, _items jsonb, _coupon_id uuid DEFAULT NULL::uuid, _discount numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid; new_number text; it jsonb;
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
  END LOOP;

  IF _coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_redemptions (coupon_id, order_id, phone, discount_amount)
    VALUES (_coupon_id, new_id, _order->>'customer_phone', COALESCE(_discount,0));
  END IF;

  DELETE FROM public.orders
   WHERE customer_phone = _order->>'customer_phone' AND status = 'incomplete'::order_status;

  RETURN jsonb_build_object('id', new_id, 'order_number', new_number);
END $function$;

CREATE OR REPLACE FUNCTION public.checkout_save_incomplete(_existing_id uuid, _order jsonb, _items jsonb, _replace_items boolean, _activity_kind text, _activity_message text, _activity_meta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE target uuid; it jsonb;
BEGIN
  IF _existing_id IS NOT NULL THEN
    target := _existing_id;
    IF _replace_items THEN
      UPDATE public.orders SET
        customer_name = _order->>'customer_name', address_line = _order->>'address_line',
        city = COALESCE(_order->>'city','—'), division = _order->>'division',
        district = _order->>'district', upazila = _order->>'upazila', note = _order->>'note',
        subtotal = COALESCE((_order->>'subtotal')::numeric,0),
        total = COALESCE((_order->>'subtotal')::numeric,0),
        source = COALESCE(_order->>'source','website')
      WHERE id = target AND status = 'incomplete'::order_status;
      DELETE FROM public.order_items WHERE order_id = target;
    END IF;
  ELSE
    INSERT INTO public.orders (customer_name, customer_phone, address_line, city, division, district, upazila, note,
      subtotal, delivery_charge, discount, total, payment_method, status, source)
    VALUES (_order->>'customer_name', _order->>'customer_phone', COALESCE(_order->>'address_line','—'),
      COALESCE(_order->>'city','—'), _order->>'division', _order->>'district', _order->>'upazila', _order->>'note',
      COALESCE((_order->>'subtotal')::numeric,0), 0, 0, COALESCE((_order->>'subtotal')::numeric,0),
      'cod', 'incomplete'::order_status, COALESCE(_order->>'source','website'))
    RETURNING id INTO target;
  END IF;

  IF _existing_id IS NULL OR _replace_items THEN
    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(_items,'[]'::jsonb)) LOOP
      INSERT INTO public.order_items (order_id, product_id, product_name, product_slug, variant_label, sku, unit_price, quantity, line_total, combo_selections)
      VALUES (target, (it->>'product_id')::uuid, it->>'product_name', it->>'product_slug', it->>'variant_label', it->>'sku',
        COALESCE((it->>'unit_price')::numeric,0), COALESCE((it->>'quantity')::int,1),
        COALESCE((it->>'line_total')::numeric,0), COALESCE(it->'combo_selections', '[]'::jsonb));
    END LOOP;
  END IF;

  IF _activity_kind IS NOT NULL THEN
    INSERT INTO public.order_activity (order_id, kind, message, meta)
    VALUES (target, _activity_kind, COALESCE(_activity_message,''), COALESCE(_activity_meta,'{}'::jsonb));
  END IF;
  RETURN jsonb_build_object('id', target);
END $function$;

CREATE OR REPLACE FUNCTION public.order_receipt(_order_number text, _phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'created_at', o.created_at,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'address_line', o.address_line, 'city', o.city, 'delivery_area', o.delivery_area,
    'subtotal', o.subtotal, 'delivery_charge', o.delivery_charge, 'discount', o.discount, 'total', o.total,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product_name', i.product_name, 'product_slug', i.product_slug, 'variant_label', i.variant_label,
        'unit_price', i.unit_price, 'quantity', i.quantity, 'line_total', i.line_total,
        'combo_selections', i.combo_selections) ORDER BY i.created_at)
        FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
    INTO result
    FROM public.orders o
   WHERE o.order_number = _order_number AND o.customer_phone = _phone
   LIMIT 1;
  RETURN result;
END $function$;