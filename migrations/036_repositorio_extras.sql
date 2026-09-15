-- 036_repositorio_extras.sql
-- ============================================================
-- Nuevas columnas en repositorio_items:
--   - url_externa TEXT  → link externo (Drive/WeTransfer para archivos > 50 MB)
--   - descargas INT     → contador para ordenar por "más descargados"
--
-- Idempotente.
-- ============================================================

BEGIN;

ALTER TABLE repositorio_items
  ADD COLUMN IF NOT EXISTS url_externa TEXT,
  ADD COLUMN IF NOT EXISTS descargas   INTEGER NOT NULL DEFAULT 0;

-- Function para incrementar descargas atómicamente (evita race conditions)
CREATE OR REPLACE FUNCTION incrementar_descargas_repo(item_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE repositorio_items
  SET descargas = COALESCE(descargas, 0) + 1
  WHERE id = item_uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION incrementar_descargas_repo(UUID) TO authenticated;

COMMIT;
