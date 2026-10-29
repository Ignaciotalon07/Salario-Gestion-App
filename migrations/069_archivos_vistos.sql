-- 069_archivos_vistos.sql
-- Qué archivos/documentos ya vio o descargó CADA persona del equipo (por usuario).
-- Los que no vio se muestran a color; los vistos, en gris.
--   tipo: 'cliente_doc' (documentos del cliente), 'proyecto_doc' (documentos de proyectos),
--         'tarea_archivo' (adjuntos de tareas de implementación)
-- Idempotente.
CREATE TABLE IF NOT EXISTS archivos_vistos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario    text NOT NULL,
  tipo       text NOT NULL,
  archivo_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (usuario, tipo, archivo_id)
);
CREATE INDEX IF NOT EXISTS idx_archivos_vistos_usuario ON archivos_vistos(usuario);
ALTER TABLE archivos_vistos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_archivos_vistos_all" ON archivos_vistos;
CREATE POLICY "team_archivos_vistos_all" ON archivos_vistos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
