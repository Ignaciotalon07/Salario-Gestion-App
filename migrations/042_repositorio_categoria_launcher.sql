-- 042_repositorio_categoria_launcher.sql
-- Nueva categoría "Para launcher" en el Repositorio: archivos PDF que un
-- compañero después sube manualmente al launcher del Salario.

ALTER TABLE repositorio_items
  DROP CONSTRAINT IF EXISTS repositorio_items_categoria_check;

ALTER TABLE repositorio_items
  ADD CONSTRAINT repositorio_items_categoria_check
  CHECK (categoria IN ('actualizacion', 'modulo', 'convenios', 'errores', 'clientes', 'launcher'));
