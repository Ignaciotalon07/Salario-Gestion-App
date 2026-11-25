-- ====================================================================
-- 007_VENCIMIENTOS — Agregar fecha_vencimiento a pendientes
-- Permite trackear deadlines y mostrar "Vence en X dias" / "Vencido"
-- en el card. Idempotente.
-- ====================================================================

ALTER TABLE pendientes
  ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;

CREATE INDEX IF NOT EXISTS idx_pendientes_vencimiento
  ON pendientes(fecha_vencimiento)
  WHERE fecha_vencimiento IS NOT NULL AND resuelto = FALSE;

-- Verificacion
SELECT COUNT(*) AS pendientes_con_vencimiento
FROM pendientes
WHERE fecha_vencimiento IS NOT NULL;
