-- 060: Proyectos (Implementación → pestaña "Proyectos")
-- Trabajos puntuales para clientes que YA son de soporte (cambios que ellos pidieron).
-- Cada proyecto tiene su lista de tareas (con duración y fechas, sin predecesoras),
-- fecha de inicio, fecha objetivo y porcentaje de avance. Mientras está en curso ocupa
-- 1 lugar en Disponibilidad. Un cliente tiene UN proyecto en curso a la vez: si pide más
-- cosas se le agregan tareas a ese proyecto.
-- Idempotente.

CREATE TABLE IF NOT EXISTS proyectos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         uuid NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre             text NOT NULL,
  detalle            text,
  estado             text NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','finalizado')),
  fecha_inicio       date,
  fecha_fin_objetivo date,
  finalizado_at      timestamptz,
  creado_por         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Un solo proyecto "en curso" por cliente
CREATE UNIQUE INDEX IF NOT EXISTS uq_proyecto_en_curso_por_cliente
  ON proyectos (cliente_id) WHERE estado = 'en_curso';
CREATE INDEX IF NOT EXISTS proyectos_cliente_idx ON proyectos (cliente_id);

CREATE TABLE IF NOT EXISTS proyecto_tareas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proyecto_id      uuid NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  orden            integer NOT NULL DEFAULT 0,
  tarea            text NOT NULL,
  asesor           text,
  estado           text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_progreso','completada')),
  duracion_dias    integer NOT NULL DEFAULT 1 CHECK (duracion_dias >= 1),
  fecha_inicio     date,
  fecha_fin        date,            -- fecha_inicio + duracion_dias - 1 (la calcula la plataforma)
  fecha_completada timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proyecto_tareas_proy_idx ON proyecto_tareas (proyecto_id, orden);

-- RLS: solo el equipo
ALTER TABLE proyectos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyecto_tareas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipo gestiona proyectos" ON proyectos;
CREATE POLICY "equipo gestiona proyectos" ON proyectos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

DROP POLICY IF EXISTS "equipo gestiona proyecto_tareas" ON proyecto_tareas;
CREATE POLICY "equipo gestiona proyecto_tareas" ON proyecto_tareas
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'proyectos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE proyectos;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'proyecto_tareas') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE proyecto_tareas;
  END IF;
END $$;
