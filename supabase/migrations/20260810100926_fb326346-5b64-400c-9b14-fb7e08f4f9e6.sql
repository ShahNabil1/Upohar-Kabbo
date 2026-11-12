CREATE OR REPLACE FUNCTION public.r2_rewrite_media_urls(old_base text, new_base text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  affected integer := 0;
  n integer;
BEGIN
  IF old_base IS NULL OR new_base IS NULL OR length(old_base) < 8 OR old_base = new_base THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.is_updatable = 'YES'
      AND c.data_type IN ('text', 'character varying', 'jsonb')
  LOOP
    IF r.data_type = 'jsonb' THEN
      EXECUTE format(
        'UPDATE public.%I SET %I = replace(%I::text, %L, %L)::jsonb WHERE %I::text LIKE %L',
        r.table_name, r.column_name, r.column_name, old_base, new_base,
        r.column_name, '%' || old_base || '%'
      );
    ELSE
      EXECUTE format(
        'UPDATE public.%I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
        r.table_name, r.column_name, r.column_name, old_base, new_base,
        r.column_name, '%' || old_base || '%'
      );
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    affected := affected + n;
  END LOOP;

  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.r2_rewrite_media_urls(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.r2_rewrite_media_urls(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.r2_rewrite_media_urls(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.r2_rewrite_media_urls(text, text) TO service_role;