
-- ============ ENUMS ============
CREATE TYPE public.stock_movement_type AS ENUM (
  'purchase_in','sale_out','return_in','damage_out','loss_out','expiry_out',
  'adjust_in','adjust_out','reversal','exchange_out','exchange_in','packaging_out'
);

CREATE TYPE public.rto_condition AS ENUM ('good','damaged','missing');

-- ============ SUPPLIERS ============
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  address text,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers_admin_all" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PACKAGING MATERIALS ============
CREATE TABLE public.packaging_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text UNIQUE,
  unit text NOT NULL DEFAULT 'pcs',
  /* per_unit = consumed per product piece, per_order = consumed once per parcel */
  consumption text NOT NULL DEFAULT 'per_order',
  reorder_point integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packaging_materials TO authenticated;
GRANT ALL ON public.packaging_materials TO service_role;
ALTER TABLE public.packaging_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packaging_admin_all" ON public.packaging_materials FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER packaging_updated_at BEFORE UPDATE ON public.packaging_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ INVENTORY LEVELS ============
CREATE TABLE public.inventory_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  packaging_id uuid REFERENCES public.packaging_materials(id) ON DELETE CASCADE,
  qty_on_hand integer NOT NULL DEFAULT 0,
  qty_reserved integer NOT NULL DEFAULT 0,
  wac_cost numeric NOT NULL DEFAULT 0,
  reorder_point integer NOT NULL DEFAULT 0,
  reorder_qty integer NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_levels_target_ck CHECK (
    (packaging_id IS NOT NULL AND product_id IS NULL AND variant_id IS NULL)
    OR (packaging_id IS NULL AND product_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX inventory_levels_product_key
  ON public.inventory_levels (product_id, variant_id) NULLS NOT DISTINCT
  WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX inventory_levels_packaging_key
  ON public.inventory_levels (packaging_id) WHERE packaging_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_levels TO authenticated;
GRANT ALL ON public.inventory_levels TO service_role;
ALTER TABLE public.inventory_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_levels_admin_all" ON public.inventory_levels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER inventory_levels_updated_at BEFORE UPDATE ON public.inventory_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ BATCHES ============
CREATE TABLE public.inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  packaging_id uuid REFERENCES public.packaging_materials(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  batch_code text,
  qty_received integer NOT NULL,
  qty_remaining integer NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  /* freight / duty / other landed cost spread over this lot */
  extra_cost numeric NOT NULL DEFAULT 0,
  received_at timestamptz NOT NULL DEFAULT now(),
  expiry_date date,
  invoice_no text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_batches_target_ck CHECK (
    (packaging_id IS NOT NULL AND product_id IS NULL)
    OR (packaging_id IS NULL AND product_id IS NOT NULL)
  )
);
CREATE INDEX inventory_batches_product_idx ON public.inventory_batches (product_id, variant_id);
CREATE INDEX inventory_batches_expiry_idx ON public.inventory_batches (expiry_date) WHERE expiry_date IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_batches TO authenticated;
GRANT ALL ON public.inventory_batches TO service_role;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inventory_batches_admin_all" ON public.inventory_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER inventory_batches_updated_at BEFORE UPDATE ON public.inventory_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STOCK LEDGER (immutable) ============
CREATE TABLE public.stock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  packaging_id uuid REFERENCES public.packaging_materials(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  sku text,
  movement_type public.stock_movement_type NOT NULL,
  /* signed: positive = stock in, negative = stock out */
  quantity integer NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  reference_label text,
  reason text,
  note text,
  reverses_id uuid REFERENCES public.stock_ledger(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_ledger_qty_ck CHECK (quantity <> 0)
);
CREATE INDEX stock_ledger_product_idx ON public.stock_ledger (product_id, variant_id, created_at DESC);
CREATE INDEX stock_ledger_ref_idx ON public.stock_ledger (reference_type, reference_id);
CREATE INDEX stock_ledger_created_idx ON public.stock_ledger (created_at DESC);
GRANT SELECT, INSERT ON public.stock_ledger TO authenticated;
GRANT ALL ON public.stock_ledger TO service_role;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_ledger_admin_read" ON public.stock_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "stock_ledger_admin_insert" ON public.stock_ledger FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ RTO INSPECTIONS ============
CREATE TABLE public.rto_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  sku text,
  quantity integer NOT NULL DEFAULT 1,
  condition public.rto_condition NOT NULL DEFAULT 'good',
  packaging_damaged boolean NOT NULL DEFAULT false,
  resalable boolean NOT NULL DEFAULT true,
  salvage_price numeric,
  note text,
  inspected_by uuid,
  inspected_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rto_inspections_order_idx ON public.rto_inspections (order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rto_inspections TO authenticated;
GRANT ALL ON public.rto_inspections TO service_role;
ALTER TABLE public.rto_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rto_inspections_admin_all" ON public.rto_inspections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER rto_inspections_updated_at BEFORE UPDATE ON public.rto_inspections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PARTIAL DELIVERY RECONCILIATION ============
CREATE TABLE public.order_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  collected_amount numeric NOT NULL DEFAULT 0,
  /* [{order_item_id, sku, kept, returned}] */
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  settled boolean NOT NULL DEFAULT false,
  note text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX order_reconciliations_order_key ON public.order_reconciliations (order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_reconciliations TO authenticated;
GRANT ALL ON public.order_reconciliations TO service_role;
ALTER TABLE public.order_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_reconciliations_admin_all" ON public.order_reconciliations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER order_reconciliations_updated_at BEFORE UPDATE ON public.order_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ LEDGER -> LEVELS / BATCH SYNC ============
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_qty integer := 0;
  cur_wac numeric := 0;
  new_wac numeric := 0;
BEGIN
  IF NEW.packaging_id IS NOT NULL THEN
    INSERT INTO public.inventory_levels (packaging_id) VALUES (NEW.packaging_id)
      ON CONFLICT (packaging_id) WHERE packaging_id IS NOT NULL DO NOTHING;
    SELECT qty_on_hand, wac_cost INTO cur_qty, cur_wac
      FROM public.inventory_levels WHERE packaging_id = NEW.packaging_id;
  ELSE
    INSERT INTO public.inventory_levels (product_id, variant_id) VALUES (NEW.product_id, NEW.variant_id)
      ON CONFLICT (product_id, variant_id) WHERE product_id IS NOT NULL DO NOTHING;
    SELECT qty_on_hand, wac_cost INTO cur_qty, cur_wac
      FROM public.inventory_levels
      WHERE product_id = NEW.product_id AND variant_id IS NOT DISTINCT FROM NEW.variant_id;
  END IF;

  new_wac := cur_wac;
  IF NEW.quantity > 0 AND NEW.unit_cost > 0 THEN
    IF cur_qty + NEW.quantity > 0 THEN
      new_wac := ((GREATEST(cur_qty, 0) * cur_wac) + (NEW.quantity * NEW.unit_cost))
                 / (GREATEST(cur_qty, 0) + NEW.quantity);
    ELSE
      new_wac := NEW.unit_cost;
    END IF;
  END IF;

  IF NEW.packaging_id IS NOT NULL THEN
    UPDATE public.inventory_levels
       SET qty_on_hand = qty_on_hand + NEW.quantity,
           wac_cost = new_wac,
           last_movement_at = NEW.created_at
     WHERE packaging_id = NEW.packaging_id;
  ELSE
    UPDATE public.inventory_levels
       SET qty_on_hand = qty_on_hand + NEW.quantity,
           wac_cost = new_wac,
           last_movement_at = NEW.created_at
     WHERE product_id = NEW.product_id AND variant_id IS NOT DISTINCT FROM NEW.variant_id;
  END IF;

  IF NEW.batch_id IS NOT NULL THEN
    UPDATE public.inventory_batches
       SET qty_remaining = GREATEST(qty_remaining + NEW.quantity, 0)
     WHERE id = NEW.batch_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_ledger_apply AFTER INSERT ON public.stock_ledger
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- Immutability guard: no updates, no deletes, ever.
CREATE OR REPLACE FUNCTION public.stock_ledger_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'stock_ledger entries are immutable — insert a reversal instead';
END;
$$;
CREATE TRIGGER stock_ledger_no_update BEFORE UPDATE OR DELETE ON public.stock_ledger
  FOR EACH ROW EXECUTE FUNCTION public.stock_ledger_immutable();
