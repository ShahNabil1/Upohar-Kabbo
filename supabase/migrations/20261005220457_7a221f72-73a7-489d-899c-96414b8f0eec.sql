CREATE TABLE public.staff_accounts (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  full_access boolean NOT NULL DEFAULT false,
  permissions text[] NOT NULL DEFAULT '{}',
  note text,
  created_by uuid,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_name text,
  actor_email text,
  action text NOT NULL,
  area text,
  detail text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_activity_log_user_time ON public.admin_activity_log (user_id, created_at DESC);
CREATE INDEX admin_activity_log_time ON public.admin_activity_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.is_admin_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin')
      OR EXISTS (SELECT 1 FROM public.staff_accounts WHERE user_id = _user_id AND is_active);
$$;

DO $do$
DECLARE r record; q text; wc text; sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename NOT IN ('staff_accounts','admin_activity_log','user_roles')
       AND (qual ILIKE '%has_role(auth.uid(), ''admin''::app_role)%'
         OR with_check ILIKE '%has_role(auth.uid(), ''admin''::app_role)%')
  LOOP
    q := replace(COALESCE(r.qual,''), 'has_role(auth.uid(), ''admin''::app_role)', 'public.is_admin_user(auth.uid())');
    wc := replace(COALESCE(r.with_check,''), 'has_role(auth.uid(), ''admin''::app_role)', 'public.is_admin_user(auth.uid())');
    sql := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF r.qual IS NOT NULL THEN sql := sql || format(' USING (%s)', q); END IF;
    IF r.with_check IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', wc); END IF;
    EXECUTE sql;
  END LOOP;
END
$do$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_accounts TO authenticated;
GRANT ALL ON public.staff_accounts TO service_role;
ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage staff accounts" ON public.staff_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff read own account" ON public.staff_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT ON public.admin_activity_log TO authenticated;
GRANT ALL ON public.admin_activity_log TO service_role;
ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read all activity" ON public.admin_activity_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR user_id = auth.uid());
CREATE POLICY "Signed in insert own activity" ON public.admin_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_staff_accounts_updated
  BEFORE UPDATE ON public.staff_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_ip_location jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_blocked_identifiers_kind_value
  ON public.blocked_identifiers (kind, value);

CREATE OR REPLACE FUNCTION public.storefront_security_check(
  _ip text DEFAULT NULL,
  _fingerprint text DEFAULT NULL,
  _phone text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blocked_identifiers b
    WHERE (b.kind = 'ip' AND NULLIF(btrim(_ip), '') IS NOT NULL AND b.value = btrim(_ip))
       OR (b.kind = 'fingerprint' AND NULLIF(btrim(_fingerprint), '') IS NOT NULL AND b.value = btrim(_fingerprint))
       OR (b.kind = 'phone' AND NULLIF(btrim(_phone), '') IS NOT NULL AND b.value = btrim(_phone))
  );
$$;

CREATE OR REPLACE FUNCTION public.checkout_place_order(_order jsonb, _items jsonb, _coupon_id uuid DEFAULT NULL::uuid, _discount numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE new_id uuid; new_number text; it jsonb; item_count int := 0;
BEGIN
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'NO_ITEMS'; END IF;
  IF public.storefront_security_check(
    _order->>'customer_ip',
    _order->>'device_fingerprint',
    _order->>'customer_phone'
  ) THEN
    RAISE EXCEPTION 'ORDER_BLOCKED';
  END IF;

  INSERT INTO public.orders (
    customer_name, customer_phone, customer_email, address_line, city,
    division, district, upazila, delivery_area, note,
    subtotal, delivery_charge, discount, total,
    payment_method, status, source, customer_ip, customer_user_agent,
    device_fingerprint, customer_ip_location, attribution
  ) VALUES (
    _order->>'customer_name', _order->>'customer_phone', _order->>'customer_email',
    _order->>'address_line', _order->>'city',
    _order->>'division', _order->>'district', _order->>'upazila',
    _order->>'delivery_area', _order->>'note',
    COALESCE((_order->>'subtotal')::numeric,0), COALESCE((_order->>'delivery_charge')::numeric,0),
    COALESCE((_order->>'discount')::numeric,0), COALESCE((_order->>'total')::numeric,0),
    'cod', 'processing'::order_status, COALESCE(_order->>'source','website'), _order->>'customer_ip',
    left(COALESCE(_order->>'customer_user_agent',''), 500),
    NULLIF(_order->>'device_fingerprint', ''),
    COALESCE(_order->'customer_ip_location', '{}'::jsonb),
    COALESCE(_order->'attribution', '{}'::jsonb)
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
      'device_fingerprint', _order->>'device_fingerprint',
      'customer_ip_location', COALESCE(_order->'customer_ip_location', '{}'::jsonb),
      'attribution', COALESCE(_order->'attribution', '{}'::jsonb),
      'total', COALESCE((_order->>'total')::numeric,0),
      'items', item_count)
  );

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
  IF public.storefront_security_check(
    _order->>'customer_ip',
    _order->>'device_fingerprint',
    _order->>'customer_phone'
  ) THEN
    RETURN jsonb_build_object('blocked', true);
  END IF;

  IF _existing_id IS NOT NULL THEN
    target := _existing_id;
    UPDATE public.orders SET
      customer_name = _order->>'customer_name',
      customer_phone = _order->>'customer_phone',
      address_line = _order->>'address_line',
      city = COALESCE(NULLIF(_order->>'district',''), '—'),
      division = NULLIF(_order->>'division',''),
      district = NULLIF(_order->>'district',''),
      upazila = NULLIF(_order->>'upazila',''),
      note = NULLIF(_order->>'note',''),
      subtotal = COALESCE((_order->>'subtotal')::numeric,0),
      total = COALESCE((_order->>'subtotal')::numeric,0),
      source = COALESCE(_order->>'source','website'),
      customer_ip = NULLIF(_order->>'customer_ip',''),
      customer_user_agent = left(COALESCE(_order->>'customer_user_agent',''), 500),
      device_fingerprint = NULLIF(_order->>'device_fingerprint',''),
      customer_ip_location = COALESCE(_order->'customer_ip_location', '{}'::jsonb),
      attribution = COALESCE(_order->'attribution', '{}'::jsonb),
      updated_at = now()
    WHERE id = target;
    IF _replace_items THEN DELETE FROM public.order_items WHERE order_id = target; END IF;
  ELSE
    INSERT INTO public.orders (
      customer_name, customer_phone, address_line, city, division, district, upazila,
      subtotal, delivery_charge, discount, total, payment_method, status, source, note,
      customer_ip, customer_user_agent, device_fingerprint, customer_ip_location, attribution
    ) VALUES (
      _order->>'customer_name', _order->>'customer_phone', _order->>'address_line',
      COALESCE(NULLIF(_order->>'district',''), '—'), NULLIF(_order->>'division',''),
      NULLIF(_order->>'district',''), NULLIF(_order->>'upazila',''),
      COALESCE((_order->>'subtotal')::numeric,0), 0, 0, COALESCE((_order->>'subtotal')::numeric,0),
      'cod', 'incomplete'::order_status, COALESCE(_order->>'source','website'), NULLIF(_order->>'note',''),
      NULLIF(_order->>'customer_ip',''), left(COALESCE(_order->>'customer_user_agent',''), 500),
      NULLIF(_order->>'device_fingerprint',''), COALESCE(_order->'customer_ip_location', '{}'::jsonb),
      COALESCE(_order->'attribution', '{}'::jsonb)
    ) RETURNING id INTO target;
  END IF;

  IF _replace_items THEN
    FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
      INSERT INTO public.order_items (order_id, product_id, product_name, product_slug, variant_label, sku, unit_price, quantity, line_total, combo_selections)
      VALUES (target, (it->>'product_id')::uuid, it->>'product_name', it->>'product_slug', it->>'variant_label', it->>'sku',
              COALESCE((it->>'unit_price')::numeric,0), COALESCE((it->>'quantity')::int,1),
              COALESCE((it->>'line_total')::numeric,0), COALESCE(it->'combo_selections','[]'::jsonb));
    END LOOP;
  END IF;

  INSERT INTO public.order_activity (order_id, kind, message, meta)
  VALUES (target, _activity_kind, _activity_message, COALESCE(_activity_meta,'{}'::jsonb));
  RETURN jsonb_build_object('id', target, 'blocked', false);
END $function$;

REVOKE ALL ON FUNCTION public.storefront_security_check(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_security_check(text, text, text) TO service_role;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_name text;
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders(created_by);

ALTER TABLE public.promotion_products
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_before numeric,
  ADD COLUMN IF NOT EXISTS compare_before numeric;
ALTER TABLE public.promotion_products
  DROP CONSTRAINT IF EXISTS promotion_products_discount_type_check;
ALTER TABLE public.promotion_products
  ADD CONSTRAINT promotion_products_discount_type_check
  CHECK (discount_type IN ('none','percent','flat','fixed_price'));

ALTER TABLE public.admin_activity_log ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE public.admin_activity_log ADD COLUMN IF NOT EXISTS user_agent text;
CREATE INDEX IF NOT EXISTS admin_activity_log_user_created_idx ON public.admin_activity_log (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_session_revocations (
  user_id uuid PRIMARY KEY,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid,
  revoked_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_session_revocations TO authenticated;
GRANT ALL ON public.admin_session_revocations TO service_role;
ALTER TABLE public.admin_session_revocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own or admin read revocations" ON public.admin_session_revocations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_user(auth.uid()));
CREATE POLICY "admins manage revocations" ON public.admin_session_revocations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.sync_product_stock(_pid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE has_levels boolean; has_variants boolean;
BEGIN
  IF _pid IS NULL THEN RETURN; END IF;
  SELECT EXISTS (SELECT 1 FROM inventory_levels WHERE product_id = _pid) INTO has_levels;
  IF has_levels THEN
    UPDATE product_variants v
       SET stock = GREATEST(l.qty_on_hand, 0)
      FROM inventory_levels l
     WHERE l.product_id = _pid AND l.variant_id = v.id AND v.stock IS DISTINCT FROM GREATEST(l.qty_on_hand, 0);
  END IF;
  SELECT EXISTS (SELECT 1 FROM product_variants WHERE product_id = _pid AND is_active) INTO has_variants;
  IF has_variants THEN
    UPDATE products SET stock = (SELECT COALESCE(SUM(GREATEST(stock,0)),0) FROM product_variants WHERE product_id = _pid AND is_active)
     WHERE id = _pid;
  ELSIF has_levels THEN
    UPDATE products SET stock = COALESCE((SELECT GREATEST(qty_on_hand,0) FROM inventory_levels WHERE product_id = _pid AND variant_id IS NULL), stock)
     WHERE id = _pid;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_sync_stock_levels()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF pg_trigger_depth() > 2 THEN RETURN NULL; END IF;
  PERFORM public.sync_product_stock(COALESCE(NEW.product_id, OLD.product_id));
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.trg_sync_stock_variants()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pid uuid := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE products SET stock = (SELECT COALESCE(SUM(GREATEST(stock,0)),0) FROM product_variants WHERE product_id = pid AND is_active)
   WHERE id = pid AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = pid AND is_active);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS sync_stock_from_levels ON public.inventory_levels;
CREATE TRIGGER sync_stock_from_levels AFTER INSERT OR UPDATE OF qty_on_hand OR DELETE ON public.inventory_levels
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_stock_levels();

DROP TRIGGER IF EXISTS sync_product_stock_from_variants ON public.product_variants;
CREATE TRIGGER sync_product_stock_from_variants AFTER INSERT OR UPDATE OF stock, is_active OR DELETE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_stock_variants();

SELECT public.sync_product_stock(id) FROM public.products;

REVOKE EXECUTE ON FUNCTION public.sync_product_stock(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_stock_levels() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_stock_variants() FROM PUBLIC, anon, authenticated;