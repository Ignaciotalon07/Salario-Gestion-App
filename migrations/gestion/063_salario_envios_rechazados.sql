-- 063: Envíos de Salario que la API rechazó por no poder identificar al cliente
-- (id_api 0, vacío, inexistente, repetido, o cliente_id inválido). La función `salario-api` los registra
-- acá para que el equipo se entere desde Gestión (botón Alertas) y cargue el id_api en esa instalación de Salario.
--   · `instalacion` = lo que mandó Salario en cliente_id (ej. "WIN-ABC123 # Administrador"): identifica la PC/instalación.
--   · `detalle` = resumen de lo que mandaba (legajos, convenios, empresas) para ayudar a reconocer de qué cliente es.
--   · Los repetidos se agrupan (cantidad) en vez de crear una fila por intento.
-- El equipo puede LEER y BORRAR (marcar como resuelto); escribe la función con service_role. Idempotente.

CREATE TABLE IF NOT EXISTS salario_envios_rechazados (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  id_api_enviado text NOT NULL DEFAULT '',
  instalacion    text NOT NULL DEFAULT '',
  base           text NOT NULL DEFAULT '',
  motivo         text NOT NULL,
  detalle        jsonb,
  cantidad       integer NOT NULL DEFAULT 1,
  primero_at     timestamptz NOT NULL DEFAULT now(),
  ultimo_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_api_enviado, instalacion, base, motivo)
);

ALTER TABLE salario_envios_rechazados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipo lee salario_envios_rechazados" ON salario_envios_rechazados;
CREATE POLICY "equipo lee salario_envios_rechazados" ON salario_envios_rechazados
  FOR SELECT TO authenticated USING (is_team_member());

DROP POLICY IF EXISTS "equipo borra salario_envios_rechazados" ON salario_envios_rechazados;
CREATE POLICY "equipo borra salario_envios_rechazados" ON salario_envios_rechazados
  FOR DELETE TO authenticated USING (is_team_member());

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'salario_envios_rechazados') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE salario_envios_rechazados;
  END IF;
END $$;
