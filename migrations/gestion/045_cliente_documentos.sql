-- 045_cliente_documentos.sql
-- Documentos propios de cada cliente (logos, firmas, PDF, Excel, Word...) que
-- el cliente nos pasa por WhatsApp y que se guardan en la pestaña "Documentos"
-- del detalle de Implementación.
--
-- ANTES de usarla: crear el bucket de Storage a mano en Supabase:
--   Storage → New bucket → nombre: cliente-documentos → Private (no public)

CREATE TABLE IF NOT EXISTS cliente_documentos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre        text        NOT NULL,             -- nombre original del archivo
  categoria     text        NOT NULL DEFAULT 'documento'
                CHECK (categoria IN ('documento','logo','firma')),
  storage_path  text        NOT NULL,
  tipo_mime     text,
  tamano_bytes  bigint,
  subido_por    text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_documentos_cliente
  ON cliente_documentos(cliente_id);

-- ── RLS: solo miembros activos del equipo ───────────────────────────
ALTER TABLE cliente_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_cliente_documentos_all" ON cliente_documentos;
CREATE POLICY "team_cliente_documentos_all" ON cliente_documentos
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

-- ── Realtime (idempotente) ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cliente_documentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cliente_documentos;
  END IF;
END $$;

-- ── Storage (bucket: cliente-documentos) ────────────────────────────
DROP POLICY IF EXISTS "clidoc_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "clidoc_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "clidoc_storage_delete" ON storage.objects;

CREATE POLICY "clidoc_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'cliente-documentos' AND is_team_member());
CREATE POLICY "clidoc_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cliente-documentos' AND is_team_member());
CREATE POLICY "clidoc_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cliente-documentos' AND is_team_member());
