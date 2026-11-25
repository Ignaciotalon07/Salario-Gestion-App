-- 030_implementacion_archivos.sql
-- Archivos adjuntos a tareas de implementación.
-- Los archivos viven en Supabase Storage (bucket: implementacion-archivos).
-- Esta tabla guarda solo los metadatos.

-- ── Tabla de metadatos ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS implementacion_tarea_archivos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id     uuid        NOT NULL REFERENCES implementacion_tareas(id) ON DELETE CASCADE,
  nombre       text        NOT NULL,
  storage_path text        NOT NULL,
  tipo_mime    text,
  tamano_bytes bigint,
  subido_por   text,
  created_at   timestamptz DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE implementacion_tarea_archivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_archivos_all" ON implementacion_tarea_archivos;
CREATE POLICY "team_archivos_all" ON implementacion_tarea_archivos
  FOR ALL TO authenticated
  USING (is_team_member())
  WITH CHECK (is_team_member());

-- ── Realtime ────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE implementacion_tarea_archivos;

-- ── Storage policies (bucket: implementacion-archivos) ──────────────────────
-- IMPORTANTE: el bucket debe crearse manualmente en el dashboard de Supabase
-- Storage → New bucket → nombre: "implementacion-archivos" → Private (no public)

DROP POLICY IF EXISTS "impl_archivos_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "impl_archivos_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "impl_archivos_storage_delete" ON storage.objects;

CREATE POLICY "impl_archivos_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'implementacion-archivos' AND is_team_member());

CREATE POLICY "impl_archivos_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'implementacion-archivos' AND is_team_member());

CREATE POLICY "impl_archivos_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'implementacion-archivos' AND is_team_member());
