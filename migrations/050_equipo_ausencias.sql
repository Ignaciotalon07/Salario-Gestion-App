-- 050_equipo_ausencias.sql
-- Ausencias del equipo (vacaciones, licencias, días sueltos, puentes).
-- Todos ven el mismo calendario; cada persona carga / edita / borra SOLO las suyas.
-- Con esto se calcula la cobertura de Soporte e Implementación y cuánto baja la
-- capacidad de Implementación cuando falta alguien.

CREATE TABLE IF NOT EXISTS equipo_ausencias (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  miembro_email  text        NOT NULL,            -- quién es (dueño de la ausencia)
  miembro_nombre text        NOT NULL,            -- nombre tal cual figura en team_members
  tipo           text        NOT NULL DEFAULT 'vacaciones'
                 CHECK (tipo IN ('vacaciones','licencia','dia_suelto','puente')),
  fecha_desde    date        NOT NULL,
  fecha_hasta    date        NOT NULL,
  nota           text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  CHECK (fecha_hasta >= fecha_desde)
);

-- Si esta migración se corrió antes de que se quitara el "medio día", se limpia la
-- columna sobrante (queda vacía; no se pierde ningún dato útil).
ALTER TABLE equipo_ausencias DROP COLUMN IF EXISTS medio_dia;

CREATE INDEX IF NOT EXISTS idx_equipo_ausencias_fechas
  ON equipo_ausencias(fecha_desde, fecha_hasta);
CREATE INDEX IF NOT EXISTS idx_equipo_ausencias_miembro
  ON equipo_ausencias(miembro_email);

-- ── RLS ─────────────────────────────────────────────────────────────
-- Ver: todo el equipo.  Crear / editar / borrar: solo el dueño.
ALTER TABLE equipo_ausencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ausencias_select_team" ON equipo_ausencias;
CREATE POLICY "ausencias_select_team" ON equipo_ausencias
  FOR SELECT TO authenticated
  USING (is_team_member());

DROP POLICY IF EXISTS "ausencias_insert_propias" ON equipo_ausencias;
CREATE POLICY "ausencias_insert_propias" ON equipo_ausencias
  FOR INSERT TO authenticated
  WITH CHECK (is_team_member() AND lower(miembro_email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "ausencias_update_propias" ON equipo_ausencias;
CREATE POLICY "ausencias_update_propias" ON equipo_ausencias
  FOR UPDATE TO authenticated
  USING (is_team_member() AND lower(miembro_email) = lower(auth.jwt() ->> 'email'))
  WITH CHECK (is_team_member() AND lower(miembro_email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "ausencias_delete_propias" ON equipo_ausencias;
CREATE POLICY "ausencias_delete_propias" ON equipo_ausencias
  FOR DELETE TO authenticated
  USING (is_team_member() AND lower(miembro_email) = lower(auth.jwt() ->> 'email'));

-- ── Realtime (idempotente) ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'equipo_ausencias'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE equipo_ausencias;
  END IF;
END $$;
