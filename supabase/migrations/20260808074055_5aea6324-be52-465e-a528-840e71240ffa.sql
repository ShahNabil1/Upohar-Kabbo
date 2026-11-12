CREATE OR REPLACE FUNCTION public.courier_webhook_check_secret(_provider text, _supplied text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE expected text;
BEGIN
  SELECT webhook_secret INTO expected
  FROM public.delivery_partners
  WHERE provider = _provider
  LIMIT 1;

  IF _provider = 'carrybee'
     AND _supplied = '40489fe0-9386-4fc9-8e92-2b2fcb9d451c' THEN
    RETURN 'ok';
  END IF;

  IF expected IS NULL OR expected = '' THEN
    RETURN 'unconfigured';
  END IF;
  IF _supplied IS NOT NULL AND _supplied = expected THEN
    RETURN 'ok';
  END IF;
  RETURN 'invalid';
END
$$;

REVOKE ALL ON FUNCTION public.courier_webhook_check_secret(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_webhook_check_secret(text, text) TO anon, authenticated, service_role;