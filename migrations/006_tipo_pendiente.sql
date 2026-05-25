-- ====================================================================
-- 006_TIPO_PENDIENTE — Agregar el campo tipo_pendiente
-- Diferencia entre soporte / implementacion / bug / comercial
-- para que cada rol tenga su propio flujo. Idempotente.
-- ====================================================================

ALTER TABLE pendientes
  ADD COLUMN IF NOT EXISTS tipo_pendiente TEXT
    NOT NULL DEFAULT 'soporte'
    CHECK (tipo_pendiente IN ('soporte', 'implementacion', 'bug', 'comercial'));

CREATE INDEX IF NOT EXISTS idx_pendientes_tipo ON pendientes(tipo_pendiente);

-- Verificacion
SELECT tipo_pendiente, COUNT(*) AS filas
FROM pendientes
GROUP BY tipo_pendiente;
