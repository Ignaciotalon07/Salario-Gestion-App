-- 014_implementacion.sql
-- Crea las tablas, funciones y permisos para el modulo "Implementación".
-- Cada cliente nuevo con area='impl' arranca con las 23 etapas estandar
-- del proceso de onboarding (relevamiento, armado, paralelos, capacitacion,
-- acompañamiento), y el equipo va marcando cada una como completada.
--
-- Idempotente: se puede correr varias veces sin error.

-- ════════════════════════════════════════
-- 1. PLANTILLA — las 23 etapas estandar
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS implementacion_plantilla (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden            INTEGER NOT NULL UNIQUE,
  tarea            TEXT NOT NULL,
  responsable_tipo TEXT NOT NULL CHECK (responsable_tipo IN ('cliente','equipo','ambos')),
  descripcion      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed: las 23 etapas (solo si la tabla esta vacia)
INSERT INTO implementacion_plantilla (orden, tarea, responsable_tipo)
SELECT * FROM (VALUES
  ( 1, 'Entrevista de relevamiento',                                     'ambos'),
  ( 2, 'Armado de empresa',                                              'equipo'),
  ( 3, 'Armado de nomina',                                               'equipo'),
  ( 4, 'Recibir PDF de ultimas liquidaciones',                           'cliente'),
  ( 5, 'Recibir LSD y libro Ministerio de ultimas liquidaciones',        'cliente'),
  ( 6, 'Logos y firmas + diseño recibo',                                 'ambos'),
  ( 7, 'Recibir ejemplos de informes especiales solicitados',            'cliente'),
  ( 8, 'Excel de acumulados de ganancias',                               'cliente'),
  ( 9, 'Plan de cuenta para asientos contables',                         'cliente'),
  (10, 'Recibir solicitud de centros de costos',                         'cliente'),
  (11, 'Analisis de liquidaciones',                                      'equipo'),
  (12, 'Armado de modelo de calculo',                                    'equipo'),
  (13, 'Analisis de carga de novedades',                                 'equipo'),
  (14, 'Primer paralelo de liquidacion',                                 'equipo'),
  (15, 'Segundo paralelo de liquidacion',                                'equipo'),
  (16, 'Pruebas bancarias',                                              'equipo'),
  (17, 'Prueba 931',                                                     'equipo'),
  (18, 'Pruebas otras exportaciones (Sindicato + SICORE + SIJCOR)',      'equipo'),
  (19, 'Instalacion de Salario',                                         'equipo'),
  (20, 'Capacitacion a usuarios',                                        'equipo'),
  (21, 'Primer mes de acompañamiento - adopcion cliente',                'equipo'),
  (22, 'Segundo mes de acompañamiento - adopcion cliente',               'equipo'),
  (23, 'Devolucion de mediciones de adopcion cliente',                   'equipo')
) AS seed_plantilla(orden, tarea, responsable_tipo)
WHERE NOT EXISTS (SELECT 1 FROM implementacion_plantilla LIMIT 1);


-- ════════════════════════════════════════
-- 2. TAREAS — instancia por cliente
-- ════════════════════════════════════════
CREATE TABLE IF NOT EXISTS implementacion_tareas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  orden             INTEGER NOT NULL,
  tarea             TEXT NOT NULL,
  responsable_tipo  TEXT NOT NULL CHECK (responsable_tipo IN ('cliente','equipo','ambos')),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','en_progreso','completada','demorada')),
  asesor            TEXT,
  fecha_completada  TIMESTAMPTZ,
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id, orden)
);

CREATE INDEX IF NOT EXISTS impl_tareas_cliente_idx ON implementacion_tareas(cliente_id, orden);

-- Trigger para actualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION impl_tareas_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  -- Si pasa a completada, registrar la fecha
  IF NEW.estado = 'completada' AND OLD.estado <> 'completada' THEN
    NEW.fecha_completada = NOW();
  END IF;
  -- Si vuelve atras desde completada, limpiar fecha
  IF NEW.estado <> 'completada' AND OLD.estado = 'completada' THEN
    NEW.fecha_completada = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS impl_tareas_updated_at_trg ON implementacion_tareas;
CREATE TRIGGER impl_tareas_updated_at_trg
  BEFORE UPDATE ON implementacion_tareas
  FOR EACH ROW EXECUTE FUNCTION impl_tareas_set_updated_at();


-- ════════════════════════════════════════
-- 3. FUNCION para seedear las 23 tareas para un cliente nuevo
-- ════════════════════════════════════════
-- Llamada desde JS al crear un cliente con area='impl' (o al cambiar a impl).
-- Idempotente: si ya existen tareas para ese cliente, no las duplica.
CREATE OR REPLACE FUNCTION crear_implementacion_para_cliente(p_cliente_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  insertadas INTEGER;
BEGIN
  INSERT INTO implementacion_tareas (cliente_id, orden, tarea, responsable_tipo)
  SELECT p_cliente_id, p.orden, p.tarea, p.responsable_tipo
  FROM implementacion_plantilla p
  WHERE NOT EXISTS (
    SELECT 1 FROM implementacion_tareas t
    WHERE t.cliente_id = p_cliente_id AND t.orden = p.orden
  )
  ORDER BY p.orden;

  GET DIAGNOSTICS insertadas = ROW_COUNT;
  RETURN insertadas;
END;
$$;

-- Permitir llamarla desde JS via supabase
GRANT EXECUTE ON FUNCTION crear_implementacion_para_cliente(UUID) TO authenticated;


-- ════════════════════════════════════════
-- 4. RLS — solo el equipo puede ver/editar
-- ════════════════════════════════════════
ALTER TABLE implementacion_plantilla ENABLE ROW LEVEL SECURITY;
ALTER TABLE implementacion_tareas    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS impl_plantilla_select ON implementacion_plantilla;
CREATE POLICY impl_plantilla_select ON implementacion_plantilla
  FOR SELECT TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS impl_tareas_select ON implementacion_tareas;
DROP POLICY IF EXISTS impl_tareas_insert ON implementacion_tareas;
DROP POLICY IF EXISTS impl_tareas_update ON implementacion_tareas;
DROP POLICY IF EXISTS impl_tareas_delete ON implementacion_tareas;

CREATE POLICY impl_tareas_select ON implementacion_tareas FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY impl_tareas_insert ON implementacion_tareas FOR INSERT TO authenticated WITH CHECK (is_team_member());
CREATE POLICY impl_tareas_update ON implementacion_tareas FOR UPDATE TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
CREATE POLICY impl_tareas_delete ON implementacion_tareas FOR DELETE TO authenticated USING (is_team_member());


-- ════════════════════════════════════════
-- 5. Realtime
-- ════════════════════════════════════════
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE implementacion_tareas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END$$;


-- ════════════════════════════════════════
-- 6. Backfill: crear tareas para clientes existentes con area='impl'
-- ════════════════════════════════════════
DO $$
DECLARE
  c RECORD;
  total_creadas INTEGER := 0;
  creadas INTEGER;
BEGIN
  FOR c IN SELECT id FROM clientes WHERE area = 'impl' LOOP
    SELECT crear_implementacion_para_cliente(c.id) INTO creadas;
    total_creadas := total_creadas + creadas;
  END LOOP;
  RAISE NOTICE 'Backfill: % tareas creadas para clientes con area=impl', total_creadas;
END$$;


-- ════════════════════════════════════════
-- Verificacion
-- ════════════════════════════════════════
SELECT
  (SELECT COUNT(*) FROM implementacion_plantilla)             AS etapas_plantilla,
  (SELECT COUNT(*) FROM implementacion_tareas)                AS tareas_creadas,
  (SELECT COUNT(DISTINCT cliente_id) FROM implementacion_tareas) AS clientes_con_impl;
