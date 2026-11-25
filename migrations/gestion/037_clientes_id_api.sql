-- ====================================================================
-- 037_clientes_id_api.sql
-- Agrega columna id_api a la tabla clientes.
-- Identificador numérico del cliente en el sistema Salario (API).
-- Idempotente.
-- ====================================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS id_api INTEGER;

-- Índice único para evitar duplicados (opcional pero recomendado)
CREATE UNIQUE INDEX IF NOT EXISTS clientes_id_api_unique
  ON clientes(id_api) WHERE id_api IS NOT NULL;

-- Verificación
SELECT nombre, id_api FROM clientes WHERE id_api IS NOT NULL ORDER BY nombre LIMIT 10;
