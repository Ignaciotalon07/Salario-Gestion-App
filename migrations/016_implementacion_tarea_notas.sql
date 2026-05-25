-- 016_implementacion_tarea_notas.sql
-- Tabla de notas por tarea de implementacion, con autor y timestamp.
-- Misma estructura que pendiente_notas para mantener consistencia visual.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS implementacion_tarea_notas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id     UUID NOT NULL REFERENCES implementacion_tareas(id) ON DELETE CASCADE,
  autor_email  TEXT,
  autor_nombre TEXT,
  texto        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS impl_tarea_notas_tarea_idx ON implementacion_tarea_notas(tarea_id, created_at);

-- RLS — equipo
ALTER TABLE implementacion_tarea_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS impl_tarea_notas_select ON implementacion_tarea_notas;
DROP POLICY IF EXISTS impl_tarea_notas_insert ON implementacion_tarea_notas;
DROP POLICY IF EXISTS impl_tarea_notas_delete ON implementacion_tarea_notas;

CREATE POLICY impl_tarea_notas_select ON implementacion_tarea_notas FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY impl_tarea_notas_insert ON implementacion_tarea_notas FOR INSERT TO authenticated WITH CHECK (is_team_member());
CREATE POLICY impl_tarea_notas_delete ON implementacion_tarea_notas FOR DELETE TO authenticated USING (is_team_member());

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE implementacion_tarea_notas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

SELECT 'implementacion_tarea_notas OK' AS resultado;
