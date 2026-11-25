-- 031_soluciones_archivos.sql
-- Archivos adjuntos a soluciones de la base de conocimiento.
-- Los archivos viven en Supabase Storage (bucket: soluciones-archivos).
-- Esta tabla guarda solo los metadatos.

-- ── Tabla de metadatos ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS soluciones_archivos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  solucion_id  uuid        NOT NULL REFERENCES soluciones(id) ON DELETE CASCADE,
  nombre       text        NOT NULL,
  storage_path text        NOT NULL,
  tipo_mime    text,
  tamano_bytes bigint,
  subido_por   text,
  created_at   timestamptz DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE soluciones_archivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_sol_archivos_all" ON soluciones_archivos;
CREATE POLICY "team_sol_archivos_all" ON soluciones_archivos
  FOR ALL TO authenticated
  USING (is_team_member())
  WITH CHECK (is_team_member());

-- ── Realtime ────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE soluciones_archivos;

-- ── Storage policies (bucket: soluciones-archivos) ───────────────────────────
-- IMPORTANTE: crear el bucket manualmente en Supabase:
-- Storage → New bucket → nombre: "soluciones-archivos" → Private (no public)

DROP POLICY IF EXISTS "sol_archivos_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "sol_archivos_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "sol_archivos_storage_delete" ON storage.objects;

CREATE POLICY "sol_archivos_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'soluciones-archivos' AND is_team_member());

CREATE POLICY "sol_archivos_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'soluciones-archivos' AND is_team_member());

CREATE POLICY "sol_archivos_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'soluciones-archivos' AND is_team_member());
