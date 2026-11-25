-- ====================================================================
-- 010_REALTIME_CLIENTES — Habilitar realtime sobre clientes
-- Cuando un miembro del equipo agrega o modifica un cliente, los demas
-- lo ven al instante sin recargar. Idempotente.
-- ====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'clientes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE clientes;
  END IF;
END $$;

-- Verificacion: la tabla deberia aparecer en la publicacion
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'clientes';
