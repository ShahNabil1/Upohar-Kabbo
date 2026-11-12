CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.cleanup_old_order_logs(_retention_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  cutoff timestamptz := now() - (_retention_days || ' days')::interval;
  deleted_activity int := 0;
  deleted_webhooks int := 0;
  deleted_notes int := 0;
  truncated_consignments int := 0;
BEGIN
  -- Delete old activity logs for orders outside the retention window
  DELETE FROM public.order_activity
  WHERE order_id IN (
    SELECT id FROM public.orders WHERE created_at < cutoff
  );
  GET DIAGNOSTICS deleted_activity = ROW_COUNT;

  -- Delete old webhook event payloads/rows for old orders
  DELETE FROM public.courier_webhook_events
  WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_webhooks = ROW_COUNT;

  -- Delete old manual order notes for old orders
  DELETE FROM public.order_notes
  WHERE order_id IN (
    SELECT id FROM public.orders WHERE created_at < cutoff
  );
  GET DIAGNOSTICS deleted_notes = ROW_COUNT;

  -- Truncate bulky raw payload JSON on consignments but keep the record
  UPDATE public.order_consignments
  SET raw = '{}'::jsonb
  WHERE order_id IN (
    SELECT id FROM public.orders WHERE created_at < cutoff
  )
  AND coalesce(raw,'{}'::jsonb) <> '{}'::jsonb;
  GET DIAGNOSTICS truncated_consignments = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'cutoff', cutoff,
    'retention_days', _retention_days,
    'deleted_activity', deleted_activity,
    'deleted_webhooks', deleted_webhooks,
    'deleted_notes', deleted_notes,
    'truncated_consignments', truncated_consignments
  );
END;
$function$;

-- Default retention setting: 90 days
INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('retention', '{"days": 90, "enabled": true, "last_run": null, "last_result": null}'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET
  value = jsonb_set(
    public.site_settings.value,
    '{days}',
    COALESCE(public.site_settings.value->'days', '90'::jsonb)
  );

-- Schedule daily cleanup at 3:30 AM Asia/Dhaka
SELECT cron.schedule(
  'cleanup-old-order-logs-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://upoharkabbo.com/api/public/hooks/cleanup-old-logs',
    headers := '{"Content-Type": "application/json", "apikey": "' || current_setting('app.settings.anon_key', true) || '"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
