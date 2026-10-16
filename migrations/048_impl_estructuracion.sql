-- 048_impl_estructuracion.sql
-- "Estructuración interna" de Implementación: trabajo del equipo que NO es
-- implementar un cliente (soporte, proyectos internos, mejoras de gestión,
-- capacitaciones). Se dibuja como una fila más en el Gantt de Disponibilidad y,
-- mientras haya tareas pendientes / en curso, ocupa 1 lugar de la capacidad.

CREATE TABLE IF NOT EXISTS impl_estructuracion (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre        text        NOT NULL,
  tipo          text        NOT NULL DEFAULT 'proyecto'
                CHECK (tipo IN ('soporte','proyecto','mejora','capacitacion')),
  fecha_inicio  date        NOT NULL,
  fecha_fin     date        NOT NULL,
  estado        text        NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','en_curso','hecha')),
  creado_por    text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_impl_estructuracion_fechas
  ON impl_estructuracion(fecha_inicio, fecha_fin);

-- ── RLS: solo miembros activos del equipo ───────────────────────────
ALTER TABLE impl_estructuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_impl_estructuracion_all" ON impl_estructuracion;
CREATE POLICY "team_impl_estructuracion_all" ON impl_estructuracion
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

-- ── Realtime (idempotente) ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'impl_estructuracion'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE impl_estructuracion;
  END IF;
END $$;
