-- 065_pendiente_archivos.sql
-- Archivos adjuntos a pendientes. Los archivos viven en Supabase Storage
-- (bucket: pendientes-archivos); esta tabla guarda solo los metadatos.
-- Si se crea un pendiente para varios asesores, el mismo archivo se referencia
-- desde cada pendiente (misma storage_path).
-- Idempotente.

CREATE TABLE IF NOT EXISTS pendiente_archivos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pendiente_id uuid        NOT NULL REFERENCES pendientes(id) ON DELETE CASCADE,
  nombre       text        NOT NULL,
  storage_path text        NOT NULL,
  tipo_mime    text,
  tamano_bytes bigint,
  subido_por   text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pendiente_archivos_pend ON pendiente_archivos(pendiente_id);

ALTER TABLE pendiente_archivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "team_pend_archivos_all" ON pendiente_archivos;
CREATE POLICY "team_pend_archivos_all" ON pendiente_archivos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pendiente_archivos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pendiente_archivos;
  END IF;
END $$;

-- ── Storage (bucket: pendientes-archivos) ───────────────────────────────────
-- IMPORTANTE: crear el bucket manualmente en Supabase:
-- Storage → New bucket → nombre: "pendientes-archivos" → Private (no public)
DROP POLICY IF EXISTS "pend_archivos_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "pend_archivos_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "pend_archivos_storage_delete" ON storage.objects;
CREATE POLICY "pend_archivos_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'pendientes-archivos' AND is_team_member());
CREATE POLICY "pend_archivos_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'pendientes-archivos' AND is_team_member());
CREATE POLICY "pend_archivos_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'pendientes-archivos' AND is_team_member());
