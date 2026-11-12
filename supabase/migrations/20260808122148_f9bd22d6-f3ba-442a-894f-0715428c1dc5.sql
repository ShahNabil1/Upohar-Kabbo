WITH combo_lines AS (
  SELECT oi.id AS order_item_id,
         oi.product_id,
         oi.combo_selections
  FROM public.order_items oi
  WHERE oi.product_id IS NOT NULL
    AND jsonb_array_length(COALESCE(oi.combo_selections, '[]'::jsonb)) > 0
),
rebuilt AS (
  SELECT cl.order_item_id,
         COALESCE(jsonb_agg(
           COALESCE(
             sel.value,
             jsonb_build_object(
               'item_id', ci.item_id,
               'item_name_bn', COALESCE(NULLIF(ci.label_bn, ''), p.name_bn),
               'item_name_en', COALESCE(NULLIF(ci.label_en, ''), p.name_en, p.name_bn),
               'quantity', ci.quantity,
               'variant_id', NULL,
               'variant_label_bn', '',
               'variant_label_en', '',
               'sku', p.sku
             )
           )
           ORDER BY ci.sort_order, ci.created_at
         ), '[]'::jsonb) AS selections
  FROM combo_lines cl
  JOIN public.combo_items ci ON ci.combo_id = cl.product_id
  JOIN public.products p ON p.id = ci.item_id
  LEFT JOIN LATERAL (
    SELECT s.value
    FROM jsonb_array_elements(cl.combo_selections) AS s(value)
    WHERE s.value->>'item_id' = ci.item_id::text
    LIMIT 1
  ) sel ON TRUE
  GROUP BY cl.order_item_id
)
UPDATE public.order_items oi
SET combo_selections = r.selections
FROM rebuilt r
WHERE oi.id = r.order_item_id
  AND r.selections IS DISTINCT FROM oi.combo_selections;