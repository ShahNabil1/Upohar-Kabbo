CREATE OR REPLACE FUNCTION public.promotions_sync_prices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'UTC')::date;
  _restored int := 0;
  _applied int := 0;
  r record;
  _next numeric;
BEGIN
  -- 1) Offer ended / turned off / not started: put original prices back.
  FOR r IN
    SELECT pp.id, pp.product_id, pp.price_before, pp.compare_before
    FROM promotion_products pp
    JOIN promotions p ON p.id = pp.promotion_id
    WHERE pp.price_before IS NOT NULL
      AND (NOT p.is_active
        OR (p.ends_at IS NOT NULL AND p.ends_at::date < _today)
        OR (p.starts_at IS NOT NULL AND p.starts_at::date > _today))
  LOOP
    UPDATE products SET price = r.price_before, compare_at_price = r.compare_before WHERE id = r.product_id;
    UPDATE promotion_products SET price_before = NULL, compare_before = NULL WHERE id = r.id;
    _restored := _restored + 1;
  END LOOP;

  -- 2) Scheduled offer has now started: apply its discount.
  FOR r IN
    SELECT pp.id, pp.product_id, pp.discount_type, pp.discount_value, pr.price, pr.compare_at_price
    FROM promotion_products pp
    JOIN promotions p ON p.id = pp.promotion_id
    JOIN products pr ON pr.id = pp.product_id
    WHERE pp.price_before IS NULL
      AND pp.discount_type <> 'none' AND pp.discount_value > 0
      AND p.is_active
      AND (p.starts_at IS NULL OR p.starts_at::date <= _today)
      AND (p.ends_at IS NULL OR p.ends_at::date >= _today)
      AND NOT EXISTS (SELECT 1 FROM promotion_products o WHERE o.product_id = pp.product_id AND o.price_before IS NOT NULL)
  LOOP
    _next := round(CASE r.discount_type
      WHEN 'percent' THEN r.price * (1 - r.discount_value / 100)
      WHEN 'flat' THEN r.price - r.discount_value
      ELSE r.discount_value END);
    IF _next IS NULL OR _next < 0 OR _next >= r.price THEN CONTINUE; END IF;
    UPDATE promotion_products SET price_before = r.price, compare_before = r.compare_at_price WHERE id = r.id;
    UPDATE products SET price = _next,
      compare_at_price = CASE WHEN coalesce(r.compare_at_price, 0) > r.price THEN r.compare_at_price ELSE r.price END
    WHERE id = r.product_id;
    _applied := _applied + 1;
  END LOOP;

  RETURN jsonb_build_object('restored', _restored, 'applied', _applied);
END;
$$;

REVOKE ALL ON FUNCTION public.promotions_sync_prices() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'promotions-sync-prices';
SELECT cron.schedule('promotions-sync-prices', '5 * * * *', $$SELECT public.promotions_sync_prices();$$);

SELECT public.promotions_sync_prices();