-- 071: Historial mensual de los datos de Salario + versión + motor + CUILes.
-- Corre en Supabase → SQL Editor. Idempotente.
--
--  · salario_sync (estado ACTUAL por cliente y base) suma: cuiles, version, motor y el período (anio, mes)
--    al que corresponde el dato actual.
--  · salario_historial (UNA fila por cliente + base + año + mes) guarda cómo estaba cada mes.
--    La escribe la Edge Function `salario-api` (service_role); el equipo solo lee.

ALTER TABLE salario_sync ADD COLUMN IF NOT EXISTS cuiles  integer;     -- personas distintas (por CUIL)
ALTER TABLE salario_sync ADD COLUMN IF NOT EXISTS version text;        -- versión de Salario, ej. "5.2.1"
ALTER TABLE salario_sync ADD COLUMN IF NOT EXISTS motor   text;        -- 'mysql' | 'dbf'
ALTER TABLE salario_sync ADD COLUMN IF NOT EXISTS anio    smallint;    -- período del dato actual
ALTER TABLE salario_sync ADD COLUMN IF NOT EXISTS mes     smallint;

CREATE TABLE IF NOT EXISTS salario_historial (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id  uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  base        text NOT NULL DEFAULT 'principal',
  anio        smallint NOT NULL,
  mes         smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  legajos     integer,
  cuiles      integer,
  convenios   jsonb,
  empresas    jsonb,
  version     text,
  motor       text,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (cliente_id, base, anio, mes)
);
CREATE INDEX IF NOT EXISTS idx_salario_historial_cliente ON salario_historial (cliente_id, anio DESC, mes DESC);

ALTER TABLE salario_historial ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipo lee salario_historial" ON salario_historial;
CREATE POLICY "equipo lee salario_historial" ON salario_historial
  FOR SELECT TO authenticated USING (is_team_member());

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'salario_historial'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE salario_historial;
  END IF;
END $$;

-- Lo que ya había en salario_sync se copia como historial del mes en que se actualizó (para no empezar de cero)
INSERT INTO salario_historial (cliente_id, base, anio, mes, legajos, convenios, empresas, updated_at)
SELECT cliente_id, base,
       EXTRACT(YEAR  FROM updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::smallint,
       EXTRACT(MONTH FROM updated_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::smallint,
       legajos, convenios, empresas, updated_at
FROM salario_sync
WHERE updated_at IS NOT NULL
ON CONFLICT (cliente_id, base, anio, mes) DO NOTHING;
