-- Applied manually in the Supabase dashboard AFTER the app is deployed and the
-- cron URL + secret are known. Stores secrets in Supabase Vault, then schedules
-- a 5-minute job that POSTs to the Hono cron route.
--
-- Prerequisites (run once):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Store the deployed cron endpoint and the shared secret in Vault.
--    Replace the values with your real Vercel URL and CRON_SECRET.
--    (Vault upsert pattern; run these selects in the SQL editor.)
select vault.create_secret('https://YOUR_APP.vercel.app/api/cron/reminders', 'reminders_url');
select vault.create_secret('[REDACTED_CRON_SECRET]', 'reminders_secret');

-- 2) Schedule the job: every 5 minutes, POST to the cron route with the secret header.
select cron.schedule(
  'meal-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect/cancel later:
--   select * from cron.job;
--   select cron.unschedule('meal-reminders');
--   select * from net._http_response order by created desc limit 20;
