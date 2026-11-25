-- 033_repositorio_visto.sql
-- Rastrea cuándo cada usuario vio el repositorio por última vez.
-- Items creados después de ese timestamp se muestran como "nuevos".

CREATE TABLE IF NOT EXISTS repositorio_visto (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ultimo_visto_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE repositorio_visto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repo_visto_own" ON repositorio_visto;
CREATE POLICY "repo_visto_own" ON repositorio_visto
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
