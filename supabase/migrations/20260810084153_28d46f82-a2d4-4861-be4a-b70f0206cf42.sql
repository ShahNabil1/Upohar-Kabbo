SELECT cron.unschedule('steadfast-payment-sync');

SELECT cron.schedule(
  'steadfast-payment-sync',
  '0 22 * * *',
  $$
  SELECT net.http_post(
    url := 'https://upoharkabbo.com/api/public/hooks/steadfast-payments',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "uk_cron_9f3Ba7Qz2Ldx6Vt0Pm4Ye8Rn1Cs5Jw7H"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);