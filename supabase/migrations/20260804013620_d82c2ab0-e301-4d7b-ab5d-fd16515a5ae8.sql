
-- 1. Data API grants ---------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.subcategories TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT ON public.product_images TO anon;
GRANT SELECT ON public.promotions TO anon;
GRANT SELECT ON public.promotion_products TO anon;
GRANT SELECT ON public.faqs TO anon;
GRANT SELECT ON public.landing_pages TO anon;
GRANT SELECT ON public.site_settings TO anon;

-- 2. Missing admin policies ---------------------------------------------------
CREATE POLICY "Admins manage delivery partners" ON public.delivery_partners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage consignments" ON public.order_consignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage bulk jobs" ON public.courier_bulk_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage bulk job items" ON public.courier_bulk_job_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage webhook events" ON public.courier_webhook_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage order presence" ON public.order_presence FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage redemptions" ON public.coupon_redemptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3. Guest checkout routines --------------------------------------------------
CREATE OR REPLACE FUNCTION public.checkout_place_order(
  _order jsonb, _items jsonb, _coupon_id uuid DEFAULT NULL, _discount numeric DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    INSERT INTO public.order_items (order_id, product_id, product_name, product_slug, variant_label, sku, unit_price, quantity, line_total)
    VALUES (new_id, (it->>'product_id')::uuid, it->>'product_name', it->>'product_slug',
            it->>'variant_label', it->>'sku', COALESCE((it->>'unit_price')::numeric,0),
            COALESCE((it->>'quantity')::int,1), COALESCE((it->>'line_total')::numeric,0));
  END LOOP;

  IF _coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_redemptions (coupon_id, order_id, phone, discount_amount)
    VALUES (_coupon_id, new_id, _order->>'customer_phone', COALESCE(_discount,0));
  END IF;

  DELETE FROM public.orders
   WHERE customer_phone = _order->>'customer_phone' AND status = 'incomplete'::order_status;

  RETURN jsonb_build_object('id', new_id, 'order_number', new_number);
END $$;

CREATE OR REPLACE FUNCTION public.checkout_incomplete_state(_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_recent boolean; ex jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.orders
     WHERE customer_phone = _phone AND status <> 'incomplete'::order_status
       AND created_at >= now() - interval '24 hours'
  ) INTO has_recent;

  SELECT jsonb_build_object(
    'id', o.id, 'customer_name', o.customer_name, 'address_line', o.address_line,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('product_name', i.product_name, 'variant_label', i.variant_label, 'quantity', i.quantity))
        FROM public.order_items i WHERE i.order_id = o.id
    ), '[]'::jsonb))
    INTO ex
    FROM public.orders o
   WHERE o.customer_phone = _phone AND o.status = 'incomplete'::order_status
   ORDER BY o.created_at DESC LIMIT 1;

  RETURN jsonb_build_object('has_recent_order', has_recent, 'existing', ex);
END $$;

CREATE OR REPLACE FUNCTION public.checkout_save_incomplete(
  _existing_id uuid, _order jsonb, _items jsonb, _replace_items boolean,
  _activity_kind text, _activity_message text, _activity_meta jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; it jsonb;
BEGIN
  IF _existing_id IS NOT NULL THEN
    target := _existing_id;
    IF _replace_items THEN
      UPDATE public.orders SET
        customer_name = _order->>'customer_name',
        address_line  = _order->>'address_line',
        city          = COALESCE(_order->>'city','—'),
        division      = _order->>'division',
        district      = _order->>'district',
        upazila       = _order->>'upazila',
        note          = _order->>'note',
        subtotal      = COALESCE((_order->>'subtotal')::numeric,0),
        total         = COALESCE((_order->>'subtotal')::numeric,0),
        source        = COALESCE(_order->>'source','website')
      WHERE id = target AND status = 'incomplete'::order_status;
      DELETE FROM public.order_items WHERE order_id = target;
    END IF;
  ELSE
    INSERT INTO public.orders (
      customer_name, customer_phone, address_line, city, division, district, upazila, note,
      subtotal, delivery_charge, discount, total, payment_method, status, source
    ) VALUES (
      _order->>'customer_name', _order->>'customer_phone', COALESCE(_order->>'address_line','—'),
      COALESCE(_order->>'city','—'), _order->>'division', _order->>'district', _order->>'upazila', _order->>'note',
      COALESCE((_order->>'subtotal')::numeric,0), 0, 0, COALESCE((_order->>'subtotal')::numeric,0),
      'cod', 'incomplete'::order_status, COALESCE(_order->>'source','website')
    ) RETURNING id INTO target;
  END IF;

  IF _existing_id IS NULL OR _replace_items THEN
    FOR it IN SELECT * FROM jsonb_array_elements(COALESCE(_items,'[]'::jsonb)) LOOP
      INSERT INTO public.order_items (order_id, product_id, product_name, product_slug, variant_label, sku, unit_price, quantity, line_total)
      VALUES (target, (it->>'product_id')::uuid, it->>'product_name', it->>'product_slug',
              it->>'variant_label', it->>'sku', COALESCE((it->>'unit_price')::numeric,0),
              COALESCE((it->>'quantity')::int,1), COALESCE((it->>'line_total')::numeric,0));
    END LOOP;
  END IF;

  IF _activity_kind IS NOT NULL THEN
    INSERT INTO public.order_activity (order_id, kind, message, meta)
    VALUES (target, _activity_kind, COALESCE(_activity_message,''), COALESCE(_activity_meta,'{}'::jsonb));
  END IF;

  RETURN jsonb_build_object('id', target);
END $$;

CREATE OR REPLACE FUNCTION public.order_receipt(_order_number text, _phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
        'unit_price', i.unit_price, 'quantity', i.quantity, 'line_total', i.line_total))
        FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
    INTO result
    FROM public.orders o
   WHERE o.order_number = _order_number AND o.customer_phone = _phone
   LIMIT 1;
  RETURN result;
END $$;

-- 4. Courier webhook routines -------------------------------------------------
CREATE OR REPLACE FUNCTION public.courier_webhook_check_secret(_provider text, _supplied text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE expected text;
BEGIN
  SELECT webhook_secret INTO expected FROM public.delivery_partners WHERE provider = _provider LIMIT 1;
  IF expected IS NULL OR expected = '' THEN RETURN 'unconfigured'; END IF;
  IF _supplied IS NOT NULL AND _supplied = expected THEN RETURN 'ok'; END IF;
  RETURN 'invalid';
END $$;

CREATE OR REPLACE FUNCTION public.courier_webhook_apply(
  _provider text, _event text, _consignment_id text, _merchant_order_id text,
  _payload jsonb, _status text, _raw_status text, _message text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE event_id uuid; target uuid; next_status text; note text;
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

  next_status := CASE
    WHEN _status IN ('delivered','partial_delivered') THEN 'delivered'
    WHEN _status = 'returned' THEN 'returned'
    WHEN _status = 'cancelled' THEN 'cancelled'
    ELSE NULL END;

  UPDATE public.orders SET
    courier_status = _status,
    courier_consignment_id = COALESCE(NULLIF(_consignment_id,''), courier_consignment_id),
    status = COALESCE(next_status::order_status, status)
  WHERE id = target;

  note := _provider || ' update: ' || _raw_status || COALESCE(' — ' || _message, '');
  INSERT INTO public.order_activity (order_id, kind, message, meta)
  VALUES (target, 'courier', note, jsonb_build_object(
    'actor', _provider || ' webhook', 'provider', _provider, 'status', _status,
    'raw_status', _raw_status, 'consignment_id', _consignment_id));

  UPDATE public.courier_webhook_events SET processed = true, error = NULL WHERE id = event_id;
  RETURN jsonb_build_object('processed', true, 'message', 'Order updated to ' || _status);
END $$;

-- 5. Execute grants -----------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.checkout_place_order(jsonb, jsonb, uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_incomplete_state(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_save_incomplete(uuid, jsonb, jsonb, boolean, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_receipt(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.courier_webhook_check_secret(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.courier_webhook_apply(text, text, text, text, jsonb, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric, uuid[], text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
