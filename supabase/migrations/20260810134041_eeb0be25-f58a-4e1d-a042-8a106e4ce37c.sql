CREATE OR REPLACE FUNCTION public.r2_rewrite_media_urls(old_base TEXT, new_base TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_old TEXT;
  v_new TEXT;
BEGIN
  v_old := rtrim(old_base, '/');
  v_new := rtrim(new_base, '/');

  -- Simple text columns
  UPDATE public.categories
    SET image_url = replace(image_url, v_old, v_new)
    WHERE image_url LIKE v_old || '%';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.subcategories
    SET image_url = replace(image_url, v_old, v_new)
    WHERE image_url LIKE v_old || '%';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.products
    SET og_image_url = replace(og_image_url, v_old, v_new)
    WHERE og_image_url LIKE v_old || '%';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.product_images
    SET url = replace(url, v_old, v_new)
    WHERE url LIKE v_old || '%';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.promotions
    SET banner_url = replace(banner_url, v_old, v_new)
    WHERE banner_url LIKE v_old || '%';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.profiles
    SET avatar_url = replace(avatar_url, v_old, v_new)
    WHERE avatar_url LIKE v_old || '%';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.landing_pages
    SET og_image_url = replace(og_image_url, v_old, v_new)
    WHERE og_image_url LIKE v_old || '%';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- JSONB content (landing pages, promos, etc.)
  UPDATE public.landing_pages
    SET content = (
      SELECT jsonb_agg(
        CASE
          WHEN value::text LIKE '"' || v_old || '%'
          THEN to_jsonb(replace(value::text, v_old, v_new))
          ELSE value
        END
      )
      FROM jsonb_each(content) AS e(key, value)
    )
    WHERE content::text LIKE '%' || v_old || '%';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.r2_rewrite_media_urls(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.r2_rewrite_media_urls(TEXT, TEXT) TO service_role;