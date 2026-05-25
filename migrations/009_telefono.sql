-- ====================================================================
-- 009_TELEFONO — Agregar telefono opcional al pendiente
-- Si esta cargado, aparece un boton para abrir el chat de WhatsApp
-- del cliente con un click. Idempotente.
--
-- Mas adelante, cuando migremos clientes a Supabase, este campo
-- podria venir directamente desde la tabla clientes en lugar de
-- cargarse manualmente en cada pendiente.
-- ====================================================================

ALTER TABLE pendientes
  ADD COLUMN IF NOT EXISTS telefono TEXT;

-- Verificacion
SELECT COUNT(*) AS pendientes_con_telefono
FROM pendientes
WHERE telefono IS NOT NULL;
