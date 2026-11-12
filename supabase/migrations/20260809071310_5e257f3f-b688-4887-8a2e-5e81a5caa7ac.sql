select cron.alter_job(
  (select jobid from cron.job where jobname = 'cleanup-old-order-logs-daily'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://upoharkabbo.com/api/public/hooks/cleanup-old-logs',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "uk_cron_9f3Ba7Qz2Ldx6Vt0Pm4Ye8Rn1Cs5Jw7H"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cmd$
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'steadfast-payment-sync'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://project--92cdac08-5a8f-43a4-af29-da13a2aba9b7.lovable.app/api/public/hooks/steadfast-payments',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "uk_cron_9f3Ba7Qz2Ldx6Vt0Pm4Ye8Rn1Cs5Jw7H"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cmd$
);