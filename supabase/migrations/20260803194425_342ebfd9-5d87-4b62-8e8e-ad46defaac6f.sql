CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'UK-' || lpad(nextval('public.order_number_seq')::text, 2, '0');
$$;

ALTER TABLE public.orders ALTER COLUMN order_number SET DEFAULT public.next_order_number();

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC, id ASC) AS rn
  FROM public.orders
)
UPDATE public.orders o
SET order_number = 'UK-' || lpad(ordered.rn::text, 2, '0')
FROM ordered
WHERE o.id = ordered.id;

SELECT setval('public.order_number_seq', GREATEST((SELECT count(*) FROM public.orders), 1), (SELECT count(*) > 0 FROM public.orders));