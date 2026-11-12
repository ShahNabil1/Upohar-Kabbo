CREATE TABLE public.marketing_automation_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger text NOT NULL DEFAULT 'cron',
  dry_run boolean NOT NULL DEFAULT false,
  level text NOT NULL DEFAULT 'campaign',
  preset text NOT NULL DEFAULT '7d',
  evaluated integer NOT NULL DEFAULT 0,
  applied integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.marketing_automation_runs TO authenticated;
GRANT ALL ON public.marketing_automation_runs TO service_role;

ALTER TABLE public.marketing_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view automation runs"
ON public.marketing_automation_runs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE INDEX idx_marketing_automation_runs_created ON public.marketing_automation_runs (created_at DESC);