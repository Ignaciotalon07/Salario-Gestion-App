-- 026_consultas_material_remota.sql
-- Agrega columnas material y conexion_remota a la tabla consultas.
-- Estas señales alimentan el cálculo automático de autonomía del cliente.

ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS conexion_remota text;
