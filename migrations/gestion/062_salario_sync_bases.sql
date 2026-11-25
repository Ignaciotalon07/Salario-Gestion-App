-- 062: Un cliente puede tener más de una "base" de datos en Salario (ej. "DATOS1", "DATOS2" o el
-- nombre de cada empresa). Salario manda un POST por base y la plataforma las suma/junta.
--   · Se agrega la columna `base` (por defecto 'principal', así lo que ya se mandó sigue valiendo).
--   · La clave única pasa de (cliente_id) a (cliente_id, base).
-- Idempotente.

ALTER TABLE salario_sync ADD COLUMN IF NOT EXISTS base text NOT NULL DEFAULT 'principal';

-- Fuera la restricción vieja (una sola fila por cliente)
ALTER TABLE salario_sync DROP CONSTRAINT IF EXISTS salario_sync_cliente_id_key;

-- Nueva: una fila por cliente y base
CREATE UNIQUE INDEX IF NOT EXISTS salario_sync_cliente_base_uq ON salario_sync (cliente_id, base);
