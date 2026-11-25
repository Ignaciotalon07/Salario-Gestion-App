-- docs/portal-pruebas-seguridad.sql
-- Pruebas para confirmar que un usuario del portal NUNCA ve datos que no le corresponden.
-- Correr en Supabase → SQL Editor DESPUÉS de la migración 073 y de crear un usuario de prueba
-- (ver el final de migrations/073_portal_clientes.sql).
--
-- Reemplazar <UUID_DEL_USUARIO> y <EMAIL_DEL_USUARIO> en las dos líneas marcadas.
-- Todo corre dentro de una transacción que termina en ROLLBACK: no cambia ningún dato.
--
-- RESULTADO ESPERADO (columna "esperado"): cada fila tiene que dar lo que dice.

BEGIN;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object(
    'sub',   '<UUID_DEL_USUARIO>',      -- ← cambiar
    'email', '<EMAIL_DEL_USUARIO>',     -- ← cambiar
    'role',  'authenticated'
  )::text, true);

SELECT 'portal_cliente_id() devuelve su cliente' AS prueba,
       (portal_cliente_id() IS NOT NULL)::text   AS resultado, 'true' AS esperado
UNION ALL SELECT 'es_team_member() es falso',
       is_team_member()::text, 'false'
UNION ALL SELECT 've 1 sola fila en portal_mi_cliente',
       (SELECT count(*) FROM portal_mi_cliente)::text, '1'
UNION ALL SELECT 'portal_etapas: solo etapas de SU cliente (otros clientes = 0)',
       (SELECT count(*) FROM portal_etapas WHERE cliente_id <> portal_cliente_id())::text, '0'
-- Tablas internas: todas tienen que dar 0 (RLS les niega todo)
UNION ALL SELECT 'clientes (tabla directa)',        (SELECT count(*) FROM clientes)::text,            '0'
UNION ALL SELECT 'consultas',                       (SELECT count(*) FROM consultas)::text,           '0'
UNION ALL SELECT 'pendientes',                      (SELECT count(*) FROM pendientes)::text,          '0'
UNION ALL SELECT 'pendiente_notas',                 (SELECT count(*) FROM pendiente_notas)::text,     '0'
UNION ALL SELECT 'implementacion_tareas (directa)', (SELECT count(*) FROM implementacion_tareas)::text,'0'
UNION ALL SELECT 'implementacion_tarea_notas',      (SELECT count(*) FROM implementacion_tarea_notas)::text, '0'
UNION ALL SELECT 'cliente_conexiones (claves)',     (SELECT count(*) FROM cliente_conexiones)::text,  '0'
UNION ALL SELECT 'salario_sync',                    (SELECT count(*) FROM salario_sync)::text,        '0'
UNION ALL SELECT 'soluciones',                      (SELECT count(*) FROM soluciones)::text,          '0'
UNION ALL SELECT 'team_members',                    (SELECT count(*) FROM team_members)::text,        '0'
UNION ALL SELECT 'portal_usuarios: solo ve SU fila', (SELECT count(*) FROM portal_usuarios)::text,    '1'
-- Documentos: solo los suyos (origen cliente) o los que el equipo marcó visibles
UNION ALL SELECT 'portal_novedades (interna del equipo)', (SELECT count(*) FROM portal_novedades)::text, '0'
UNION ALL SELECT 'portal_novedades_vistas', (SELECT count(*) FROM portal_novedades_vistas)::text, '0'
UNION ALL SELECT 'cliente_empresas de OTROS clientes',
       (SELECT count(*) FROM cliente_empresas WHERE cliente_id <> portal_cliente_id())::text, '0'
UNION ALL SELECT 'cliente_documentos de OTROS clientes',
       (SELECT count(*) FROM cliente_documentos WHERE cliente_id <> portal_cliente_id())::text, '0'
UNION ALL SELECT 'cliente_documentos del equipo NO visibles',
       (SELECT count(*) FROM cliente_documentos WHERE origen = 'equipo' AND visible_cliente = false)::text, '0';

ROLLBACK;
