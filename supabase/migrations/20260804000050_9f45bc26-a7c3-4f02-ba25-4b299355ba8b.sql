CREATE TYPE public.coupon_discount_type AS ENUM ('percent','flat');
CREATE TYPE public.coupon_applies_to AS ENUM ('all','products','categories');
CREATE TYPE public.coupon_target_type AS ENUM ('product','category');

CREATE TABLE public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  discount_type public.coupon_discount_type NOT NULL DEFAULT 'percent',
  discount_value numeric(12,2) NOT NULL CHECK (discount_value > 0),
  cap_amount numeric(12,2),
  min_spend numeric(12,2) NOT NULL DEFAULT 0,
  max_uses_total integer,
  max_uses_per_customer integer,
  applies_to public.coupon_applies_to NOT NULL DEFAULT 'all',
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  exclude_shipping boolean NOT NULL DEFAULT true,
  uses_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX coupons_code_lower_uidx ON public.coupons (lower(code)) WHERE deleted_at IS NULL;
CREATE INDEX coupons_active_idx ON public.coupons(is_active) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view coupons" ON public.coupons FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "Staff insert coupons" ON public.coupons FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "Staff update coupons" ON public.coupons FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));
CREATE POLICY "Admins delete coupons" ON public.coupons FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_coupons_updated BEFORE UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.coupon_targets (
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  target_type public.coupon_target_type NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coupon_id, target_type, target_id)
);

CREATE INDEX coupon_targets_lookup_idx ON public.coupon_targets (target_type, target_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_targets TO authenticated;
GRANT ALL ON public.coupon_targets TO service_role;

ALTER TABLE public.coupon_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage coupon targets" ON public.coupon_targets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));

CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id uuid,
  phone text,
  discount_amount numeric(12,2) NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coupon_redemptions_coupon_idx ON public.coupon_redemptions(coupon_id);
CREATE INDEX coupon_redemptions_phone_idx ON public.coupon_redemptions(phone);

GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));

CREATE OR REPLACE FUNCTION public.coupon_bump_uses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.coupons SET uses_count = uses_count + 1, updated_at = now()
   WHERE id = NEW.coupon_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER coupon_redemption_bump AFTER INSERT ON public.coupon_redemptions
FOR EACH ROW EXECUTE FUNCTION public.coupon_bump_uses();

CREATE OR REPLACE FUNCTION public.validate_coupon(
  _code text,
  _subtotal numeric,
  _product_ids uuid[],
  _phone text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.coupons%ROWTYPE;
  d numeric := 0;
  now_ts timestamptz := now();
  applies boolean := false;
  used_by_customer integer := 0;
  cat_ids uuid[] := '{}'::uuid[];
BEGIN
  IF _code IS NULL OR btrim(_code) = '' THEN
    RETURN jsonb_build_object('ok',false,'discount',0,'reason','not_found');
  END IF;

  SELECT * INTO c FROM public.coupons
   WHERE lower(code) = lower(btrim(_code)) AND deleted_at IS NULL
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'discount',0,'reason','not_found');
  END IF;

  IF NOT c.is_active THEN
    RETURN jsonb_build_object('ok',false,'discount',0,'reason','inactive');
  END IF;
  IF c.starts_at IS NOT NULL AND now_ts < c.starts_at THEN
    RETURN jsonb_build_object('ok',false,'discount',0,'reason','not_started');
  END IF;
  IF c.ends_at IS NOT NULL AND now_ts > c.ends_at THEN
    RETURN jsonb_build_object('ok',false,'discount',0,'reason','expired');
  END IF;
  IF c.min_spend IS NOT NULL AND _subtotal < c.min_spend THEN
    RETURN jsonb_build_object('ok',false,'discount',0,'reason','min_spend','min_spend',c.min_spend);
  END IF;
  IF c.max_uses_total IS NOT NULL AND c.uses_count >= c.max_uses_total THEN
    RETURN jsonb_build_object('ok',false,'discount',0,'reason','max_uses');
  END IF;

  IF c.max_uses_per_customer IS NOT NULL AND _phone IS NOT NULL THEN
    SELECT count(*) INTO used_by_customer FROM public.coupon_redemptions r
     WHERE r.coupon_id = c.id AND r.phone = _phone;
    IF used_by_customer >= c.max_uses_per_customer THEN
      RETURN jsonb_build_object('ok',false,'discount',0,'reason','max_uses_customer');
    END IF;
  END IF;

  IF c.applies_to = 'all' THEN
    applies := true;
  ELSIF c.applies_to = 'products' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.coupon_targets t
       WHERE t.coupon_id = c.id AND t.target_type = 'product'
         AND t.target_id = ANY(COALESCE(_product_ids,'{}'::uuid[]))
    ) INTO applies;
  ELSIF c.applies_to = 'categories' THEN
    SELECT COALESCE(array_agg(DISTINCT p.category_id), '{}'::uuid[]) INTO cat_ids
      FROM public.products p WHERE p.id = ANY(COALESCE(_product_ids,'{}'::uuid[]));
    SELECT EXISTS(
      SELECT 1 FROM public.coupon_targets t
       WHERE t.coupon_id = c.id AND t.target_type = 'category'
         AND t.target_id = ANY(cat_ids)
    ) INTO applies;
  ELSE
    applies := false;
  END IF;

  IF NOT applies THEN
    RETURN jsonb_build_object('ok',false,'discount',0,'reason','not_applicable');
  END IF;

  IF c.discount_type = 'flat' THEN
    d := LEAST(c.discount_value, _subtotal);
  ELSE
    d := round(_subtotal * (c.discount_value / 100.0), 2);
    IF c.cap_amount IS NOT NULL AND d > c.cap_amount THEN d := c.cap_amount; END IF;
    IF d > _subtotal THEN d := _subtotal; END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'discount', d,
    'coupon_id', c.id,
    'code', c.code,
    'name', c.name,
    'discount_type', c.discount_type,
    'reason', NULL
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.validate_coupon(text,numeric,uuid[],text) TO anon, authenticated, service_role;