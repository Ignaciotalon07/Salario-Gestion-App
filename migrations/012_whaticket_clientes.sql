-- 012_whaticket_clientes.sql
-- Agrega columna whaticket_url a la tabla clientes para guardar el link
-- directo al chat del cliente en https://app.whaticket.com/tickets/<UUID>
--
-- Idempotente: se puede correr varias veces sin error.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS whaticket_url TEXT;

-- Verificacion rapida
SELECT
  COUNT(*)                                           AS total_clientes,
  COUNT(*) FILTER (WHERE whaticket_url IS NOT NULL)  AS con_whaticket
FROM clientes;
