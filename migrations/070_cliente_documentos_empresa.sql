-- 070_cliente_documentos_empresa.sql
-- Empresa a la que pertenece cada documento (ej: estudios contables que mandan
-- archivos de varias empresas). Texto libre y opcional.
ALTER TABLE cliente_documentos ADD COLUMN IF NOT EXISTS empresa text;
CREATE INDEX IF NOT EXISTS idx_cliente_documentos_empresa ON cliente_documentos(cliente_id, empresa);
