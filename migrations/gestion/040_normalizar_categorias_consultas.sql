-- 040_normalizar_categorias_consultas.sql
-- Limpieza puntual (no crea nada nuevo): unifica variantes de categoría que
-- se cargaron a mano con distinta ortografía/mayúsculas/acentos, y que hoy
-- se cuentan como categorías separadas en gráficos y reportes aunque en
-- realidad son la misma cosa.
--
-- Correr una sola vez en el SQL Editor de Supabase. Es seguro re-ejecutarla
-- (los UPDATE no rompen nada si ya no queda ninguna fila con esos valores).

-- "Actualización" / "actualizacion" (variantes sueltas, cargadas por
-- "Otro — nueva categoría") → se unifican con la categoría fija
-- "actualizaciones", que es como el resto de la app ya guarda esta
-- categoría cuando se elige del desplegable normal.
UPDATE consultas
SET categoria = 'actualizaciones'
WHERE categoria IN ('Actualización', 'actualización', 'Actualizacion', 'actualizacion', 'ACTUALIZACION', 'Actualizaciones');

-- "revision" → se unifica con "Revisión" (no existe como categoría fija,
-- así que se deja esa ortografía como la canónica).
UPDATE consultas
SET categoria = 'Revisión'
WHERE categoria IN ('revision', 'Revision', 'REVISION');

-- Después de correr esto, recargá la app: el desplegable de categorías
-- del formulario "Registrar consulta" va a dejar de mostrar las variantes
-- duplicadas.
