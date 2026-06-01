-- 024_rls_plantilla_write.sql
-- Agrega permisos de escritura sobre implementacion_plantilla para miembros del equipo.
-- Sin estas políticas, el INSERT/UPDATE/DELETE era bloqueado por RLS.

DROP POLICY IF EXISTS impl_plantilla_insert ON implementacion_plantilla;
CREATE POLICY impl_plantilla_insert ON implementacion_plantilla
  FOR INSERT TO authenticated WITH CHECK (is_team_member());

DROP POLICY IF EXISTS impl_plantilla_update ON implementacion_plantilla;
CREATE POLICY impl_plantilla_update ON implementacion_plantilla
  FOR UPDATE TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

DROP POLICY IF EXISTS impl_plantilla_delete ON implementacion_plantilla;
CREATE POLICY impl_plantilla_delete ON implementacion_plantilla
  FOR DELETE TO authenticated USING (is_team_member());
