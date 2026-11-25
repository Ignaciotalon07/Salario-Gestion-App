-- ====================================================================
-- 002_RLS — Politicas de seguridad a nivel de fila
-- Corre esto SEGUNDO. Sin esto, cualquiera con la URL+key publica
-- podria leer/escribir tus datos.
-- ====================================================================

-- Activar RLS en las 4 tablas
ALTER TABLE clientes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pendientes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE soluciones  ENABLE ROW LEVEL SECURITY;

-- Politica: cualquier usuario autenticado (logueado con Google) puede
-- hacer todo. Los usuarios anonimos no pueden ni leer.
--
-- Si mas adelante queres restringir a emails especificos del equipo,
-- reemplazar las policies por algo asi:
--   USING (auth.jwt() ->> 'email' = ANY (ARRAY[
--     'ignaciotalon07@gmail.com',
--     'matias@...',
--     'daniel@...',
--     'renzo@...'
--   ]))

-- ───── CLIENTES ─────
CREATE POLICY "team_full_clientes" ON clientes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ───── PENDIENTES ─────
CREATE POLICY "team_full_pendientes" ON pendientes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ───── CONSULTAS ─────
CREATE POLICY "team_full_consultas" ON consultas
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ───── SOLUCIONES ─────
CREATE POLICY "team_full_soluciones" ON soluciones
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Habilitar realtime para pendientes (asi todo el equipo ve cambios al instante)
ALTER PUBLICATION supabase_realtime ADD TABLE pendientes;
