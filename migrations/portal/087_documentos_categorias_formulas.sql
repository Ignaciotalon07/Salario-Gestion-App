-- ====================================================================
-- 087_DOCUMENTOS_CATEGORIAS_FORMULAS — Nuevos tipos de documento: 'formulas' (Excel de fórmulas /
-- planilla de conceptos) y 'empleados' (planilla de alta de empleados; ya estaba permitido).
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================
ALTER TABLE cliente_documentos DROP CONSTRAINT IF EXISTS cliente_documentos_categoria_check;
ALTER TABLE cliente_documentos
  ADD CONSTRAINT cliente_documentos_categoria_check
  CHECK (categoria IN ('documento','logo','firma','sello','liquidacion','control','formulas','empleados','explicativo','otro'));
SELECT 'ok' AS resultado;
