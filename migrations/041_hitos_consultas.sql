-- 041_hitos_consultas.sql
-- Rastrea, por persona, cuál fue el último "hito" de consultas del año que
-- ya vio festejado (cada 500: 500, 1000, 1500, ...). Así el cartel de
-- festejo se muestra una sola vez por persona por hito, sin importar desde
-- qué dispositivo entre.

CREATE TABLE IF NOT EXISTS hitos_consultas_vistos (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ultimo_hito  integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE hitos_consultas_vistos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hitos_consultas_own" ON hitos_consultas_vistos;
CREATE POLICY "hitos_consultas_own" ON hitos_consultas_vistos
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
