-- 059: Datos que manda Salario (VFP) por cliente: legajos, convenios y empresas.
-- Los escribe la Edge Function `salario-api` (con service_role, que ignora RLS).
-- El equipo solo LEE. Idempotente: sirve aunque la tabla ya exista de antes.

CREATE TABLE IF NOT EXISTS salario_sync (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id uuid REFERENCES clientes(id) ON DELETE CASCADE,
  legajos integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(cliente_id)
);

-- Convenios: ["Comercio", "UOCRA", ...]  ·  Empresas (solo estudios): [{"nombre": "...", "cuit": "..."}]
ALTER TABLE salario_sync ADD COLUMN IF NOT EXISTS convenios jsonb;
ALTER TABLE salario_sync ADD COLUMN IF NOT EXISTS empresas  jsonb;

ALTER TABLE salario_sync ENABLE ROW LEVEL SECURITY;

-- Lectura: solo el equipo
DROP POLICY IF EXISTS "equipo lee salario_sync" ON salario_sync;
CREATE POLICY "equipo lee salario_sync" ON salario_sync
  FOR SELECT TO authenticated USING (is_team_member());

-- IMPORTANTE: se elimina la política vieja "service inserta salario_sync" (FOR ALL USING true).
-- Permitía que cualquiera con la clave pública escribiera en la tabla. La función usa
-- service_role, que no necesita política.
DROP POLICY IF EXISTS "service inserta salario_sync" ON salario_sync;

-- Realtime: la plataforma se actualiza sola cuando llegan datos nuevos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'salario_sync'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE salario_sync;
  END IF;
END $$;
