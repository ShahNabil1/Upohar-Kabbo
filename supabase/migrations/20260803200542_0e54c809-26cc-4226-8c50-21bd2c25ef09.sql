CREATE TABLE public.courier_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  success_ratio numeric NOT NULL DEFAULT 0,
  total_parcel integer NOT NULL DEFAULT 0,
  success_parcel integer NOT NULL DEFAULT 0,
  cancelled_parcel integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.courier_checks TO authenticated;
GRANT ALL ON public.courier_checks TO service_role;

ALTER TABLE public.courier_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage courier checks"
ON public.courier_checks FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_courier_checks_updated
BEFORE UPDATE ON public.courier_checks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();