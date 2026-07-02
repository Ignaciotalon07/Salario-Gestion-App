-- ====================================================================
-- 034_TIPO_PENDIENTE_INTERNOS — Ampliar el CHECK constraint de tipo_pendiente
-- para incluir los tipos de pendientes internos: reunion, actualizacion,
-- revision, programacion, recordatorio, otro, repositorio.
-- ====================================================================

-- Eliminar el constraint anterior (por nombre generado automáticamente)
ALTER TABLE pendientes
  DROP CONSTRAINT IF EXISTS pendientes_tipo_pendiente_check;

-- Crear el nuevo constraint con todos los valores válidos
ALTER TABLE pendientes
  ADD CONSTRAINT pendientes_tipo_pendiente_check
  CHECK (tipo_pendiente IN (
    'soporte',
    'implementacion',
    'bug',
    'comercial',
    'repositorio',
    'reunion',
    'actualizacion',
    'revision',
    'programacion',
    'recordatorio',
    'otro'
  ));

-- Verificación
SELECT tipo_pendiente, COUNT(*) AS filas
FROM pendientes
GROUP BY tipo_pendiente
ORDER BY filas DESC;
