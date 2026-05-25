-- ====================================================================
-- 005_NOTAS — Tabla de notas/comentarios sobre pendientes
-- Permite que el equipo deje contexto sobre lo que pasa con un pendiente
-- (mensajes que enviaron, lo que respondio el cliente, etc).
-- Idempotente: se puede correr varias veces.
-- ====================================================================

CREATE TABLE IF NOT EXISTS pendiente_notas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendiente_id  UUID NOT NULL REFERENCES pendientes(id) ON DELETE CASCADE,
  autor_email   TEXT NOT NULL,
  autor_nombre  TEXT NOT NULL,
  texto         TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notas_pendiente
  ON pendiente_notas(pendiente_id, created_at DESC);

-- RLS: solo team_members pueden leer/escribir
ALTER TABLE pendiente_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_only_notas" ON pendiente_notas;
CREATE POLICY "team_only_notas" ON pendiente_notas
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

-- Habilitar realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pendiente_notas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pendiente_notas;
  END IF;
END $$;

SELECT 'pendiente_notas' AS tabla, COUNT(*) AS filas FROM pendiente_notas;
