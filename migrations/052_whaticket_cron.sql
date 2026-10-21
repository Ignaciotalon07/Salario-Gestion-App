-- ====================================================================
-- 052_whaticket_cron.sql
-- Programa la Edge Function `whaticket-sync` cada 2 minutos.
-- Correr DESPUÉS de desplegar la función. Reemplazar los 2 valores
-- entre <> antes de ejecutar (NO subir este archivo con la key real).
--   <PROJECT_REF>  → el id del proyecto (está en la URL de Supabase)
--   <SERVICE_ROLE_KEY> → Settings → API → service_role (secreta)
-- ====================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Si ya existía, la reemplaza
SELECT cron.unschedule('whaticket-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whaticket-sync');

SELECT cron.schedule(
  'whaticket-sync',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/whaticket-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);
