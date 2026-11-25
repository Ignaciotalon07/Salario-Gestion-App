-- 061: Documentos de cada proyecto (Implementación → Proyectos → botón "Documentos")
-- Guarda archivos subidos y links (ej: carpetas de Google Drive) de un proyecto.
--   · Archivo → storage_path con valor, url NULL  (bucket EXISTENTE `cliente-documentos`, carpeta proyectos/<id>/)
--   · Link    → url con valor, storage_path NULL
-- No hace falta crear ningún bucket nuevo. Idempotente.

CREATE TABLE IF NOT EXISTS proyecto_documentos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id   uuid        NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  nombre        text        NOT NULL,
  storage_path  text,
  url           text,
  tipo_mime     text,
  tamano_bytes  bigint,
  subido_por    text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proyecto_documentos_proy ON proyecto_documentos(proyecto_id);

ALTER TABLE proyecto_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipo gestiona proyecto_documentos" ON proyecto_documentos;
CREATE POLICY "equipo gestiona proyecto_documentos" ON proyecto_documentos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'proyecto_documentos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE proyecto_documentos;
  END IF;
END $$;
