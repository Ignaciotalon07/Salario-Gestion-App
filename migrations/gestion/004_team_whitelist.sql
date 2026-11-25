-- ====================================================================
-- 004_TEAM_WHITELIST — Restringir el acceso a los 6 del equipo
-- Es idempotente: se puede correr varias veces sin error.
-- ====================================================================

-- Tabla con los miembros autorizados del equipo
CREATE TABLE IF NOT EXISTS team_members (
  email      TEXT PRIMARY KEY,
  nombre     TEXT,
  rol        TEXT DEFAULT 'asesor',
  activo     BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer la lista (la app la usa
-- para mostrar quien es del equipo). Pero nadie puede modificarla
-- desde el frontend - solo el admin desde Supabase Dashboard o SQL.
DROP POLICY IF EXISTS "team_read_members" ON team_members;
CREATE POLICY "team_read_members" ON team_members
  FOR SELECT TO authenticated USING (true);

-- Helper: el usuario logueado esta en la whitelist?
CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE email = (auth.jwt() ->> 'email')
      AND activo = TRUE
  );
$$;

-- Reemplazar las policies anteriores: ahora SOLO los del equipo
-- pueden leer/escribir las 4 tablas.
DROP POLICY IF EXISTS "team_full_clientes"   ON clientes;
DROP POLICY IF EXISTS "team_full_pendientes" ON pendientes;
DROP POLICY IF EXISTS "team_full_consultas"  ON consultas;
DROP POLICY IF EXISTS "team_full_soluciones" ON soluciones;

DROP POLICY IF EXISTS "team_only_clientes"   ON clientes;
DROP POLICY IF EXISTS "team_only_pendientes" ON pendientes;
DROP POLICY IF EXISTS "team_only_consultas"  ON consultas;
DROP POLICY IF EXISTS "team_only_soluciones" ON soluciones;

CREATE POLICY "team_only_clientes" ON clientes
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

CREATE POLICY "team_only_pendientes" ON pendientes
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

CREATE POLICY "team_only_consultas" ON consultas
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

CREATE POLICY "team_only_soluciones" ON soluciones
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

-- ====================================================================
-- Los 6 emails del equipo (autorizados a entrar a la app)
-- Si alguno cambia su email despues, se actualiza con UPDATE.
-- ====================================================================
INSERT INTO team_members (email, nombre, rol) VALUES
  ('ignaciotalon07@gmail.com',  'Ignacio',      'asesor'),
  ('matias@salario.local',      'Matias',       'asesor'),
  ('daniel@salario.local',      'Daniel',       'asesor'),
  ('danielferro@salario.local', 'Daniel Ferro', 'asesor'),
  ('renzo@salario.local',       'Renzo',        'asesor'),
  ('alfred@salario.local',      'Alfred',       'asesor')
ON CONFLICT (email) DO NOTHING;

-- Verificacion
SELECT email, nombre, rol, activo FROM team_members ORDER BY created_at;
