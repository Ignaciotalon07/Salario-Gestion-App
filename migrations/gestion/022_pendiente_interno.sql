-- 022_pendiente_interno.sql
-- Agrega columna "interno" a la tabla pendientes.
-- Los pendientes internos al resolverse NO generan consulta ni alimentan métricas.

ALTER TABLE pendientes
  ADD COLUMN IF NOT EXISTS interno boolean NOT NULL DEFAULT false;
