-- ====================================================================
-- 008_AUDIT_LOG — Tabla de eventos para historial de pendientes
-- Cada accion sobre un pendiente (creacion, reasignacion, cierre,
-- nota, edicion) queda registrada con autor, tipo y timestamp.
-- Idempotente.
-- ====================================================================

CREATE TABLE IF NOT EXISTS pendiente_eventos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendiente_id  UUID NOT NULL REFERENCES pendientes(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('creado', 'reasignado', 'cerrado', 'reabierto', 'editado', 'nota', 'venc_actualizado')),
  autor_email   TEXT NOT NULL,
  autor_nombre  TEXT NOT NULL,
  detalle       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eventos_pendiente
  ON pendiente_eventos(pendiente_id, created_at DESC);

ALTER TABLE pendiente_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_only_eventos" ON pendiente_eventos;
CREATE POLICY "team_only_eventos" ON pendiente_eventos
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

-- Verificacion
SELECT COUNT(*) AS eventos FROM pendiente_eventos;
