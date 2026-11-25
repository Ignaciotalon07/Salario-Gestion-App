-- ====================================================================
-- 011_TELEFONO_CLIENTES — Agregar telefono al cliente
-- Si esta cargado, en cada card aparece un boton "WhatsApp" que abre
-- el chat directo. Idempotente.
-- ====================================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS telefono TEXT;

-- Verificacion
SELECT COUNT(*) AS clientes_con_telefono
FROM clientes
WHERE telefono IS NOT NULL;
