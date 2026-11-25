-- 066_pendiente_archivos_consulta.sql
-- Al cerrar un pendiente se crea una consulta en el historial del cliente. Esta columna
-- vincula los archivos del pendiente con esa consulta, para verlos en el detalle del cliente.
-- Idempotente.
ALTER TABLE pendiente_archivos ADD COLUMN IF NOT EXISTS consulta_id uuid;
CREATE INDEX IF NOT EXISTS idx_pendiente_archivos_consulta ON pendiente_archivos(consulta_id) WHERE consulta_id IS NOT NULL;
