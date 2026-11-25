-- 068_pendiente_archivos_sin_pendiente.sql
-- Los registros de Implementación cargados a mano (sin pendiente) también pueden llevar archivos:
-- se guardan en pendiente_archivos con pendiente_id NULL y consulta_id = la consulta. Idempotente.
ALTER TABLE pendiente_archivos ALTER COLUMN pendiente_id DROP NOT NULL;
