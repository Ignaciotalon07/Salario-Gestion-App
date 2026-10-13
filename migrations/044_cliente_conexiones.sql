-- 044_cliente_conexiones.sql
-- Accesos (conexiones) al escritorio remoto de cada cliente: usuario, clave
-- y si ya está instalado. Un cliente puede tener varias conexiones.
--
-- Nota de seguridad: la clave se guarda como texto en la base (la ve el
-- equipo por la política RLS, y quien administre Supabase). En la app se
-- muestra oculta y se copia con un botón. Si más adelante se quiere cifrar,
-- se puede migrar esta columna a pgcrypto / Supabase Vault.

CREATE TABLE IF NOT EXISTS cliente_conexiones (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  usuario     text        NOT NULL,
  clave       text,
  instalado   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_conexiones_cliente
  ON cliente_conexiones(cliente_id);

-- ── RLS: solo miembros activos del equipo ───────────────────────────
ALTER TABLE cliente_conexiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_cliente_conexiones_all" ON cliente_conexiones;
CREATE POLICY "team_cliente_conexiones_all" ON cliente_conexiones
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

-- ── Realtime (idempotente: no falla si ya estaba agregada) ──────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cliente_conexiones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cliente_conexiones;
  END IF;
END $$;
