-- 047_cliente_documentos_categorias.sql
-- Al subir un documento se le pregunta al usuario QUÉ está subiendo.
-- Se amplía la lista de categorías permitidas:
--   logo · firma · liquidacion (PDF de liquidación) · control (Excel de control)
--   explicativo (Word explicativo) · otro
-- 'documento' se mantiene por compatibilidad con lo que ya estaba subido.

ALTER TABLE cliente_documentos
  DROP CONSTRAINT IF EXISTS cliente_documentos_categoria_check;

ALTER TABLE cliente_documentos
  ADD CONSTRAINT cliente_documentos_categoria_check
  CHECK (categoria IN ('documento','logo','firma','liquidacion','control','explicativo','otro'));
