-- ====================================================================
-- 086_PORTAL_MARCAR_AVISO_LEIDO — El cliente marca UN aviso como leído al tocarlo
-- (baja el contador de la campanita). Solo puede tocar avisos de su propio cliente.
-- Idempotente. Correr en Supabase → SQL Editor. Requiere la 081.
-- ====================================================================
CREATE OR REPLACE FUNCTION portal_marcar_aviso_leido(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_cli uuid := portal_cliente_id();
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;
  UPDATE portal_avisos SET leido_at = now() WHERE id = p_id AND cliente_id = v_cli AND leido_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION portal_marcar_aviso_leido(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_marcar_aviso_leido(uuid) TO authenticated;
SELECT 'ok' AS resultado;
