-- 067_normalizar_nombres_cliente.sql
-- Algunos clientes tienen espacios dobles en el nombre (ej. "A.I.V.E.L.  S.A."). Los selectores del
-- formulario los guardaban con un solo espacio, y esas consultas/pendientes no aparecían en el
-- historial del cliente (que compara el nombre exacto). Esto iguala cliente_nombre al nombre real
-- del cliente cuando solo cambian los espacios. Idempotente.

UPDATE consultas q
SET cliente_nombre = c.nombre
FROM clientes c
WHERE q.cliente_nombre IS NOT NULL
  AND q.cliente_nombre <> c.nombre
  AND lower(regexp_replace(trim(q.cliente_nombre), '\s+', ' ', 'g')) = lower(regexp_replace(trim(c.nombre), '\s+', ' ', 'g'));

UPDATE pendientes p
SET cliente_nombre = c.nombre
FROM clientes c
WHERE p.cliente_nombre IS NOT NULL
  AND p.cliente_nombre <> c.nombre
  AND lower(regexp_replace(trim(p.cliente_nombre), '\s+', ' ', 'g')) = lower(regexp_replace(trim(c.nombre), '\s+', ' ', 'g'));

-- Verificación: debería dar 0
SELECT COUNT(*) AS consultas_sin_coincidir
FROM consultas q JOIN clientes c ON lower(regexp_replace(trim(q.cliente_nombre), '\s+', ' ', 'g')) = lower(regexp_replace(trim(c.nombre), '\s+', ' ', 'g'))
WHERE q.cliente_nombre <> c.nombre;
