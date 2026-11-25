-- 078_portal_novedades_vistas_por_cliente.sql
-- Corrige portal_novedades_vistas (creada en la 077): el "visto" tiene que ser POR CLIENTE,
-- si no, abrir un cliente marcaba como vistos los avisos de todos los demás.
-- La tabla recién se creó y está vacía, por eso se la vuelve a crear. Idempotente: solo
-- actúa si todavía no tiene la columna cliente_id.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'portal_novedades_vistas'
                   AND column_name = 'cliente_id') THEN
    DROP TABLE IF EXISTS portal_novedades_vistas;
    CREATE TABLE portal_novedades_vistas (
      usuario_email text        NOT NULL,
      cliente_id    uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      visto_hasta   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (usuario_email, cliente_id)
    );
    ALTER TABLE portal_novedades_vistas ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "cada uno su visto" ON portal_novedades_vistas
      FOR ALL TO authenticated
      USING (is_team_member() AND usuario_email = (auth.jwt() ->> 'email'))
      WITH CHECK (is_team_member() AND usuario_email = (auth.jwt() ->> 'email'));
  END IF;
END $$;
