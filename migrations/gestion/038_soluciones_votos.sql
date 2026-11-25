-- 038_soluciones_votos.sql
-- Votos 👍/👎 en soluciones de la Base de Soluciones (KB).
-- Un voto por usuario por solución (se puede cambiar o sacar, no acumular).

CREATE TABLE IF NOT EXISTS soluciones_votos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  solucion_id  uuid        NOT NULL REFERENCES soluciones(id) ON DELETE CASCADE,
  usuario      text        NOT NULL,
  voto         text        NOT NULL CHECK (voto IN ('util','no_util')),
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (solucion_id, usuario)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE soluciones_votos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_soluciones_votos_all" ON soluciones_votos;

CREATE POLICY "team_soluciones_votos_all" ON soluciones_votos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Si ya corriste esta migración antes, esta línea va a tirar error de
-- "ya es miembro de la publicación" — es esperable, ignorala.
ALTER PUBLICATION supabase_realtime ADD TABLE soluciones_votos;
