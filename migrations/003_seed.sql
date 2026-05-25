-- ====================================================================
-- 003_SEED — Datos iniciales (idempotente: se puede correr varias veces)
-- Si las filas ya existen, las salteamos sin error.
-- ====================================================================

-- ───── CLIENTES ─────
-- ON CONFLICT (nombre) DO NOTHING: si ya existe el nombre, no hace nada.
INSERT INTO clientes (nombre, tipo, area, asesor, autonomia, iniciales, adopcion, score, nota) VALUES
  ('Nina',          'empresa',       'soporte', 'Ignacio', 'baja',  'NI', 50, 8, 'Consultas frecuentes: liquidacion SAC y cierre de mes'),
  ('Noetinger',     'municipalidad', 'impl',    'Ignacio', 'baja',  'NO', 27, 7, 'Demora en etapa Carga de empleados - 5 dias sin respuesta'),
  ('Mark Twain',    'colegio',       'impl',    'Matias',  'baja',  'MT', 20, 6, 'El equipo directivo tarda en aprobar cada etapa'),
  ('ESTIN',         'empresa',       'soporte', 'Daniel',  'media', 'ES', 60, 5, 'No usa aun los modulos de reportes ni exportaciones'),
  ('Zarazaga',      'estudio',       'soporte', 'Daniel',  'media', 'ZA', 65, 5, 'Preguntas frecuentes sobre SAC y convenios colectivos'),
  ('Estudio Bocco', 'estudio',       'soporte', 'Matias',  'media', 'BO', 72, 4, NULL),
  ('Taborin',       'colegio',       'soporte', 'Daniel',  'media', 'TA', 75, 3, NULL),
  ('Ispova',        'estudio',       'soporte', 'Renzo',   'alta',  'IS', 88, 2, NULL),
  ('Sartori',       'estudio',       'soporte', 'Renzo',   'alta',  'SA', 90, 2, NULL),
  ('m3',            'empresa',       'soporte', 'Renzo',   'alta',  'M3', 95, 2, NULL)
ON CONFLICT (nombre) DO NOTHING;

-- ───── PENDIENTES ─────
-- Usamos WHERE NOT EXISTS para que no inserte si ya hay un pendiente
-- con la misma descripcion (clave funcional para evitar duplicados).
INSERT INTO pendientes (cliente_id, cliente_nombre, asesor, prioridad, categoria, descripcion, intento, prox_paso)
SELECT
  (SELECT id FROM clientes WHERE nombre='Nina'),
  'Nina', 'Ignacio', 'alta', 'Liquidacion',
  'El cliente no puede cerrar la liquidacion de mayo. El sistema muestra un error de validacion al intentar procesar.',
  'Se verifico la configuracion de conceptos, se revisaron los parametros del periodo y se reinicio el servicio. El error sigue apareciendo.',
  'Conectarse esta manana y revisar si hay empleados con datos incompletos que bloqueen el cierre.'
WHERE NOT EXISTS (SELECT 1 FROM pendientes WHERE cliente_nombre='Nina' AND descripcion LIKE 'El cliente no puede cerrar la liquidacion%');

INSERT INTO pendientes (cliente_id, cliente_nombre, asesor, prioridad, categoria, descripcion, intento, prox_paso)
SELECT
  (SELECT id FROM clientes WHERE nombre='Noetinger'),
  'Noetinger', 'Matias', 'media', 'Configuracion',
  'El cliente tiene dudas con la carga de los feriados provinciales. Se le explico el proceso pero necesitan hacer la prueba ellos solos.',
  'Se mostro el proceso paso a paso por conexion remota. El cliente tomo nota.',
  'Consultar hoy si pudieron hacerlo solos. Si no, programar una segunda videollamada.'
WHERE NOT EXISTS (SELECT 1 FROM pendientes WHERE cliente_nombre='Noetinger' AND descripcion LIKE 'El cliente tiene dudas con la carga de los feriados%');

INSERT INTO pendientes (cliente_id, cliente_nombre, asesor, prioridad, categoria, descripcion, intento, prox_paso)
SELECT
  (SELECT id FROM clientes WHERE nombre='ESTIN'),
  'ESTIN', 'Daniel', 'media', 'Errores',
  'El recibo de un empleado especifico no se genera en PDF. Los demas salen bien.',
  'Se verifico la plantilla de recibos, estaba activa. El resto de los empleados genera bien.',
  'Revisar el legajo del empleado afectado: CBU, categoria, datos personales. Buscar que campo tiene diferente.'
WHERE NOT EXISTS (SELECT 1 FROM pendientes WHERE cliente_nombre='ESTIN' AND descripcion LIKE 'El recibo de un empleado especifico%');

-- ───── SOLUCIONES ─────
-- Tampoco hay UNIQUE en titulo (lo agregamos para el futuro), asi que
-- usamos WHERE NOT EXISTS para evitar duplicados por titulo.
INSERT INTO soluciones (titulo, cat, sub, usos, autor, material, aplica, pasos)
SELECT * FROM (VALUES
  ('El cliente no sabe como liquidar horas extras en feriado', 'liquidacion', 'Feriados', 14, 'Ignacio', 'Video', 'Todos',
   '["Ir a Liquidacion > Conceptos","Seleccionar el concepto Horas extras feriado","Verificar que el porcentaje este en 100% en Configuracion > Parametros > Feriados","Cargar la cantidad de horas en el legajo del empleado","Procesar la liquidacion normalmente"]'::jsonb),
  ('Error al generar el recibo de sueldo en PDF', 'errores', 'Recibos / PDF', 9, 'Matias', 'PDF', 'Todos',
   '["Verificar que el empleado tenga CBU cargado","Ir a Configuracion > Impresion","Chequear que la plantilla de recibo este activa","Intentar generar nuevamente desde Liquidacion > Recibos","Si persiste, reiniciar el servicio de impresion"]'::jsonb),
  ('El cliente no puede configurar los feriados regionales', 'configuracion', 'Feriados', 8, 'Ignacio', 'PDF', 'Todos',
   '["Ir a Configuracion > Parametros","Seleccionar la pestana Feriados","Hacer clic en Agregar feriado regional","Ingresar fecha, descripcion y porcentaje aplicable","Guardar y verificar en una liquidacion de prueba"]'::jsonb),
  ('El cliente no entiende los cambios en vacaciones de la version 3.2', 'actualizaciones', 'Version 3.x', 7, 'Matias', 'Video', 'Version 3.x+',
   '["Revisar el documento de cambios v3.2","Ir a Liquidacion > Vacaciones","Notar el nuevo campo Dias habiles vs corridos","Configurar segun convenio del cliente","Hacer una liquidacion de prueba"]'::jsonb),
  ('El cliente no sabe la diferencia entre sueldo basico y bruto', 'liquidacion', 'Sueldo basico y bruto', 6, 'Renzo', 'PDF', 'Todos',
   '["Explicar: basico = sin adicionales, bruto = basico + adicionales","Mostrar en Liquidacion > Resumen la columna Bruto","Senalar donde se configuran los adicionales","Hacer una liquidacion de ejemplo"]'::jsonb),
  ('El cliente no puede liquidar el SAC correctamente', 'liquidacion', 'SAC / Aguinaldo', 5, 'Matias', 'Video', 'Todos',
   '["Verificar el periodo en Configuracion > Periodos","Ir a Liquidacion > SAC","Confirmar que todos los empleados tienen sueldo en el periodo","Verificar que el modulo SAC este activo","Procesar y revisar el calculo"]'::jsonb),
  ('No aparece el boton para generar el F931', 'errores', 'AFIP / Presentaciones', 5, 'Matias', 'Sin material', 'Todos',
   '["Verificar que la liquidacion del mes este cerrada","Ir a AFIP > F931","Si no aparece, chequear permisos del usuario","Verificar que el periodo fiscal este configurado","Contactar soporte tecnico si persiste"]'::jsonb),
  ('El cliente no sabe cargar una licencia medica', 'liquidacion', 'Licencias', 4, 'Ignacio', 'Imagen', 'Todos',
   '["Ir a Empleados > Legajo > Novedades","Seleccionar Nueva novedad > Licencia medica","Ingresar fecha de inicio y dias","El sistema descuenta automaticamente del presentismo","Verificar en la liquidacion que figure el descuento"]'::jsonb)
) AS v(titulo, cat, sub, usos, autor, material, aplica, pasos)
WHERE NOT EXISTS (SELECT 1 FROM soluciones s WHERE s.titulo = v.titulo);

-- Verificacion final
SELECT 'clientes' AS tabla, COUNT(*) AS filas FROM clientes
UNION ALL SELECT 'pendientes', COUNT(*) FROM pendientes
UNION ALL SELECT 'consultas',  COUNT(*) FROM consultas
UNION ALL SELECT 'soluciones', COUNT(*) FROM soluciones;
