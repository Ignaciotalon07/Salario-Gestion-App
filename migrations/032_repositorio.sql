-- 032_repositorio.sql
-- Sección Repositorio: archivos compartidos por el programador,
-- organizados por categoría, con asignación de pendientes al equipo.

-- ── Ampliar tipo_pendiente para incluir 'repositorio' ───────────────────────
ALTER TABLE pendientes DROP CONSTRAINT IF EXISTS pendientes_tipo_pendiente_check;
ALTER TABLE pendientes
  ADD CONSTRAINT pendientes_tipo_pendiente_check
  CHECK (tipo_pendiente IN ('soporte','implementacion','bug','comercial','repositorio'));

-- ── Tabla principal ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repositorio_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo       text        NOT NULL,
  categoria    text        NOT NULL CHECK (categoria IN ('actualizacion','modulo','bug','manual','clientes')),
  descripcion  text,
  subido_por   text,
  revisado     boolean     DEFAULT false NOT NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ── Tabla de archivos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repositorio_archivos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid        NOT NULL REFERENCES repositorio_items(id) ON DELETE CASCADE,
  nombre       text        NOT NULL,
  storage_path text        NOT NULL,
  tipo_mime    text,
  tamano_bytes bigint,
  subido_por   text,
  created_at   timestamptz DEFAULT now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE repositorio_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositorio_archivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_repo_items_all"    ON repositorio_items;
DROP POLICY IF EXISTS "team_repo_archivos_all" ON repositorio_archivos;

CREATE POLICY "team_repo_items_all" ON repositorio_items
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

CREATE POLICY "team_repo_archivos_all" ON repositorio_archivos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- ── Realtime ─────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE repositorio_items;
ALTER PUBLICATION supabase_realtime ADD TABLE repositorio_archivos;

-- ── Storage (bucket: repositorio) ────────────────────────────────────────────
-- Crear manualmente en Supabase: Storage → New bucket → "repositorio" → Private

DROP POLICY IF EXISTS "repo_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "repo_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "repo_storage_delete" ON storage.objects;

CREATE POLICY "repo_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'repositorio' AND is_team_member());
CREATE POLICY "repo_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'repositorio' AND is_team_member());
CREATE POLICY "repo_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'repositorio' AND is_team_member());
