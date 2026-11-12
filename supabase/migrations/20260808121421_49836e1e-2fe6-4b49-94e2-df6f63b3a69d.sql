CREATE OR REPLACE FUNCTION public.order_receipt_short(_order_number text, _p text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF _p IS NULL OR length(_p) < 4 THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'created_at', o.created_at,
    'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'address_line', o.address_line, 'city', o.city, 'delivery_area', o.delivery_area,
    'upazila', o.upazila, 'district', o.district, 'division', o.division, 'note', o.note,
    'subtotal', o.subtotal, 'delivery_charge', o.delivery_charge, 'discount', o.discount, 'total', o.total,
    'courier_provider', o.courier_provider,
    'courier_consignment_id', o.courier_consignment_id,
    'courier_tracking_code', o.courier_tracking_code,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product_name', i.product_name, 'product_slug', i.product_slug, 'variant_label', i.variant_label,
        'unit_price', i.unit_price, 'quantity', i.quantity, 'line_total', i.line_total,
        'combo_selections', i.combo_selections,
        'image_url', (
          SELECT pi.url FROM public.product_images pi
           WHERE pi.product_id = i.product_id
           ORDER BY pi.sort_order, pi.created_at LIMIT 1)
        ) ORDER BY i.created_at)
        FROM public.order_items i WHERE i.order_id = o.id), '[]'::jsonb))
    INTO result
    FROM public.orders o
   WHERE upper(o.order_number) = upper(_order_number)
     AND right(regexp_replace(o.customer_phone, '\D', '', 'g'), 4) = right(regexp_replace(_p, '\D', '', 'g'), 4)
   LIMIT 1;
  RETURN result;
END $function$;