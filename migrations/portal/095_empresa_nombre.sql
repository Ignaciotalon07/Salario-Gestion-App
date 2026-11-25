-- 095 · Nombre de la empresa (distinto de la razón social)
-- Una empresa puede ser conocida por un nombre y tener otra razón social.
-- Idempotente: se puede correr más de una vez.
ALTER TABLE cliente_empresas ADD COLUMN IF NOT EXISTS nombre text;
COMMENT ON COLUMN cliente_empresas.nombre IS 'Nombre con el que se conoce a la empresa (puede ser distinto de la razón social). Vacío = se usa la razón social.';
