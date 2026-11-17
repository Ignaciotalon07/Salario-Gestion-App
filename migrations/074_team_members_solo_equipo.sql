-- 074_team_members_solo_equipo.sql
-- Cierra un hueco que encontró la prueba de seguridad del portal (073):
-- la policy de lectura de team_members tenía USING (true), o sea que CUALQUIER usuario
-- logueado (incluidos los clientes del portal) podía leer la lista del equipo.
-- Ahora solo la lee el equipo. is_team_member() es SECURITY DEFINER, así que el login
-- del equipo sigue funcionando igual. Idempotente.
--
-- Se borran TODAS las policies de la tabla por lo que haya en pg_policies (no por nombre
-- escrito a mano): la original no se podía borrar por nombre y quedaba activa.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'team_members'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.team_members', r.policyname);
  END LOOP;
END $$;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_read_member" ON public.team_members
  FOR SELECT TO authenticated
  USING (is_team_member());
