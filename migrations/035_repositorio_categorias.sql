-- 035_repositorio_categorias.sql
-- ============================================================
-- Ajuste de categorías del Repositorio:
--   - "bug"    → ELIMINADA (no había items usándola)
--   - "manual" → ELIMINADA (no había items usándola)
--   - "convenios" → NUEVA categoría
--   - "errores"   → NUEVA categoría (Errores de Salario)
--
-- Categorías finales: actualizacion, modulo, convenios, errores, clientes
--
-- Idempotente: se puede correr varias veces sin efecto.
-- ============================================================

BEGIN;

-- Actualizar CHECK constraint con el nuevo set de categorías.
ALTER TABLE repositorio_items
  DROP CONSTRAINT IF EXISTS repositorio_items_categoria_check;

ALTER TABLE repositorio_items
  ADD CONSTRAINT repositorio_items_categoria_check
  CHECK (categoria IN ('actualizacion', 'modulo', 'convenios', 'errores', 'clientes'));

-- Verificación: mostrar cómo quedaron las categorías.
SELECT categoria, COUNT(*) AS total
FROM repositorio_items
GROUP BY categoria
ORDER BY categoria;

COMMIT;
