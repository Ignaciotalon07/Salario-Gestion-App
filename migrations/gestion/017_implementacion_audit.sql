-- 017_implementacion_audit.sql
-- Audit log de cambios en tareas de implementacion.
-- Cada cambio de estado / asesor / fecha queda registrado con autor y timestamp.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS implementacion_tarea_eventos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id     UUID NOT NULL REFERENCES implementacion_tareas(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,
  autor_email  TEXT,
  autor_nombre TEXT,
  detalle      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS impl_eventos_tarea_idx ON implementacion_tarea_eventos(tarea_id, created_at DESC);

-- RLS
ALTER TABLE implementacion_tarea_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS impl_eventos_select ON implementacion_tarea_eventos;
DROP POLICY IF EXISTS impl_eventos_insert ON implementacion_tarea_eventos;

CREATE POLICY impl_eventos_select ON implementacion_tarea_eventos FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY impl_eventos_insert ON implementacion_tarea_eventos FOR INSERT TO authenticated WITH CHECK (is_team_member());

-- Realtime (opcional, util si quieres ver eventos en vivo)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE implementacion_tarea_eventos;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;

SELECT 'implementacion_tarea_eventos OK' AS resultado;
