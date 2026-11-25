-- ====================================================================
-- 088_PORTAL_MIS_CONSULTAS — "Mis consultas" del cliente: vista segura con SUS consultas de soporte.
-- Muestra solo lo que le sirve al cliente (fecha, categoría, tema, qué consultó, cómo se resolvió,
-- estado y quién lo atendió, solo el nombre de pila). NO expone métricas internas del equipo
-- (autonomía percibida, repetida, tiempos, material interno). Solo consultas de soporte.
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================
CREATE OR REPLACE VIEW portal_mis_consultas AS
  SELECT c.id, c.cliente_id, c.created_at, c.categoria, c.subtema, c.contacto, c.descripcion, c.solucion,
         c.resuelto, c.conexion_remota, c.material,
         split_part(coalesce(c.asesor, ''), ' ', 1) AS asesor
  FROM consultas c
  WHERE c.cliente_id = portal_cliente_id()
    AND c.tipo_consulta = 'soporte';
REVOKE ALL ON portal_mis_consultas FROM PUBLIC, anon;
GRANT SELECT ON portal_mis_consultas TO authenticated;
SELECT 'ok' AS resultado;
