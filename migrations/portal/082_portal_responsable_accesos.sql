-- ====================================================================
-- 082_PORTAL_RESPONSABLE_ACCESOS — El pendiente "Crear accesos de Salario" que se genera
-- cuando el cliente carga sus usuarios en el portal ahora va a IGNACIO TALON (antes Alfredo Cesar).
--
--   * portal_responsable_accesos() → devuelve el nombre de quien recibe ese pendiente.
--     Para cambiarlo más adelante (ej. volver a Alfredo) alcanza con editar el ILIKE de esta función.
--   * portal_guardar_usuarios()    → pasa a usar esa función (el resto queda igual).
--   * Reasigna a Ignacio los pendientes de accesos que ya se hubieran creado para Alfredo y sigan abiertos.
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================

CREATE OR REPLACE FUNCTION portal_responsable_accesos()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nombre FROM team_members
   WHERE activo = true AND nombre ILIKE 'Ignacio%'
   ORDER BY created_at LIMIT 1;
$$;
REVOKE ALL ON FUNCTION portal_responsable_accesos() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION portal_guardar_usuarios(p_nombres text[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cli      uuid := portal_cliente_id();
  v_nombre   text;
  v_nombres  text[];
  v_creados  text[];
  v_prog    text;
  v_pend_id  uuid;
  v_resuelto boolean;
  v_desc     text;
  n          integer;
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;

  -- Limpiar: sin vacíos, sin espacios sobrantes, máx. 30
  SELECT coalesce(array_agg(btrim(x) ORDER BY ord), '{}') INTO v_nombres
  FROM unnest(coalesce(p_nombres, '{}')) WITH ORDINALITY AS t(x, ord)
  WHERE length(btrim(x)) >= 2;
  n := coalesce(array_length(v_nombres, 1), 0);
  IF n < 1  THEN RAISE EXCEPTION 'Indicá al menos una persona'; END IF;
  IF n > 30 THEN RAISE EXCEPTION 'Máximo 30 personas'; END IF;

  -- Conservar el estado "creado" de los que ya estaban (mismo nombre)
  v_creados := ARRAY(SELECT lower(nombre) FROM portal_usuarios_salario WHERE cliente_id = v_cli AND creado);

  DELETE FROM portal_usuarios_salario WHERE cliente_id = v_cli;
  INSERT INTO portal_usuarios_salario (cliente_id, nombre, orden, creado)
  SELECT v_cli, x, ord::int, lower(x) = ANY (v_creados)
  FROM unnest(v_nombres) WITH ORDINALITY AS t(x, ord);

  INSERT INTO portal_prep (cliente_id) VALUES (v_cli) ON CONFLICT (cliente_id) DO NOTHING;

  -- Pendiente para el responsable de crear los accesos, prioridad "en la semana"
  v_prog := portal_responsable_accesos();
  SELECT coalesce(nombre, razon_social) INTO v_nombre FROM clientes WHERE id = v_cli;

  v_desc := 'Crear accesos de Salario para ' || v_nombre || ' (' || n || ' ' ||
            CASE WHEN n = 1 THEN 'persona' ELSE 'personas' END || '): ' || array_to_string(v_nombres, ', ') || '.';

  IF v_prog IS NOT NULL THEN
    SELECT pendiente_accesos_id INTO v_pend_id FROM portal_prep WHERE cliente_id = v_cli;
    IF v_pend_id IS NOT NULL THEN
      SELECT resuelto INTO v_resuelto FROM pendientes WHERE id = v_pend_id;
      IF NOT FOUND THEN v_pend_id := NULL; END IF;
    END IF;

    IF v_pend_id IS NOT NULL AND coalesce(v_resuelto, true) = false THEN
      -- Sigue abierto: solo se actualiza el detalle con la lista nueva
      UPDATE pendientes SET descripcion = v_desc WHERE id = v_pend_id;
    ELSE
      INSERT INTO pendientes (cliente_id, cliente_nombre, asesor, prioridad, descripcion,
                              tipo_pendiente, fecha_vencimiento, interno)
      VALUES (v_cli, v_nombre, v_prog, 'semana', v_desc, 'implementacion', current_date + 10, true)
      RETURNING id INTO v_pend_id;

      INSERT INTO pendiente_eventos (pendiente_id, tipo, autor_email, autor_nombre, detalle)
      VALUES (v_pend_id, 'creado', 'portal@salariogestion', 'Portal · ' || v_nombre,
              'El cliente cargó sus usuarios de Salario en el portal');

      UPDATE portal_prep SET pendiente_accesos_id = v_pend_id, updated_at = now() WHERE cliente_id = v_cli;
    END IF;
  END IF;

  RETURN n;
END $$;

-- Pendientes de accesos ya creados para Alfredo y todavía abiertos: pasan a Ignacio
UPDATE pendientes p
   SET asesor = portal_responsable_accesos()
  FROM portal_prep pp
 WHERE pp.pendiente_accesos_id = p.id
   AND p.resuelto = false
   AND p.asesor ILIKE 'Alfredo%'
   AND portal_responsable_accesos() IS NOT NULL;

-- Verificación: debe mostrar el nombre de Ignacio tal como está en team_members
SELECT portal_responsable_accesos() AS recibe_el_pendiente;
