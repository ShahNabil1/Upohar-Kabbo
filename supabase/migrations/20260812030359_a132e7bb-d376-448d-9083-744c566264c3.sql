CREATE TABLE public.inventory_closings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period text NOT NULL UNIQUE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  opening_value numeric NOT NULL DEFAULT 0,
  purchase_value numeric NOT NULL DEFAULT 0,
  cogs_value numeric NOT NULL DEFAULT 0,
  writeoff_value numeric NOT NULL DEFAULT 0,
  packaging_value numeric NOT NULL DEFAULT 0,
  adjustment_value numeric NOT NULL DEFAULT 0,
  closing_value numeric NOT NULL DEFAULT 0,
  closing_qty integer NOT NULL DEFAULT 0,
  supplier_due numeric NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  closed_by uuid,
  closed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_closings TO authenticated;
GRANT ALL ON public.inventory_closings TO service_role;

ALTER TABLE public.inventory_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage inventory closings"
ON public.inventory_closings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE TRIGGER trg_inventory_closings_updated
BEFORE UPDATE ON public.inventory_closings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();