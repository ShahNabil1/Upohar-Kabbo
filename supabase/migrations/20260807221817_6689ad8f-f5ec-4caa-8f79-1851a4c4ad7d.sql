DO $$ BEGIN
  CREATE TYPE public.product_kind AS ENUM ('single','component','combo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS kind public.product_kind NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS cost_price numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS products_kind_idx ON public.products (kind);

CREATE TABLE IF NOT EXISTS public.combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  label_bn text,
  label_en text,
  is_free boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS combo_items_combo_idx ON public.combo_items (combo_id, sort_order);
CREATE INDEX IF NOT EXISTS combo_items_item_idx ON public.combo_items (item_id);

GRANT SELECT ON public.combo_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.combo_items TO authenticated;
GRANT ALL ON public.combo_items TO service_role;

ALTER TABLE public.combo_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "combo_items public read" ON public.combo_items;
CREATE POLICY "combo_items public read" ON public.combo_items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "combo_items admin write" ON public.combo_items;
CREATE POLICY "combo_items admin write" ON public.combo_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'));

DROP TRIGGER IF EXISTS trg_combo_items_updated ON public.combo_items;
CREATE TRIGGER trg_combo_items_updated BEFORE UPDATE ON public.combo_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();