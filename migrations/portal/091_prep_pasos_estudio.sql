-- 091_prep_pasos_estudio.sql
-- Un ESTUDIO CONTABLE no carga su propia empresa en Salario (carga las de sus clientes), así que no se le
-- piden los pasos 2 (información adicional), 4 (logo y firma) y 5 (liquidaciones y Excel de control):
-- prep_pasos() los devuelve como completos y sin revisión, y el portal y Gestión los ocultan.
-- Para los demás tipos, igual que la 090. Idempotente.
CREATE OR REPLACE FUNCTION prep_pasos(p_cliente uuid)
RETURNS TABLE (paso integer, completo boolean, revision text, comentario text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e   cliente_empresas%ROWTYPE;
  v_prep portal_prep%ROWTYPE;
  v_estudio boolean;
BEGIN
  IF p_cliente IS NULL OR NOT (is_team_member() OR p_cliente = portal_cliente_id()) THEN
    RETURN;
  END IF;

  SELECT * INTO e      FROM cliente_empresas WHERE cliente_id = p_cliente AND es_principal LIMIT 1;
  SELECT (tipo = 'estudio') INTO v_estudio FROM clientes WHERE id = p_cliente;
  v_estudio := coalesce(v_estudio, false);
  SELECT * INTO v_prep FROM portal_prep      WHERE cliente_id = p_cliente;

  RETURN QUERY
  WITH calc(paso, completo) AS (
    VALUES
      (1, e.id IS NOT NULL
          AND coalesce(btrim(e.razon_social),'') <> '' AND coalesce(btrim(e.cuit),'') <> ''),
      (2, e.id IS NOT NULL
          AND coalesce(btrim(e.domicilio),'') <> ''    AND coalesce(btrim(e.tipo_empleador),'') <> ''
          AND e.cant_legajos IS NOT NULL
          AND coalesce(btrim(e.obra_social),'') <> '' AND coalesce(btrim(e.art),'') <> ''
          AND coalesce(btrim(e.actividad_principal),'') <> '' AND coalesce(btrim(e.convenios),'') <> ''),
      (3, EXISTS (SELECT 1 FROM portal_usuarios_salario u WHERE u.cliente_id = p_cliente)),
      (4, e.id IS NOT NULL
          AND EXISTS (SELECT 1 FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'logo')
          AND EXISTS (SELECT 1 FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'firma')),
      (5, e.id IS NOT NULL
          AND (SELECT count(*) FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'liquidacion') >= 2),
      (6, v_prep.empresas_declaradas IS NOT NULL),
      (7, EXISTS (SELECT 1 FROM relevamiento_aprobacion a WHERE a.cliente_id = p_cliente)),
      (8, EXISTS (SELECT 1 FROM portal_reuniones m WHERE m.cliente_id = p_cliente AND m.tipo = 'inicio'
                  AND m.estado IN ('pendiente','confirmada','realizada')))
  )
  SELECT c.paso, (c.completo OR (v_estudio AND c.paso IN (2,4,5))),
         CASE WHEN r.estado IS NOT NULL THEN r.estado
              WHEN c.completo AND c.paso IN (1,2,4,5) AND NOT (v_estudio AND c.paso IN (2,4,5)) THEN 'en_revision'
              ELSE NULL END,
         r.comentario
  FROM calc c
  LEFT JOIN portal_prep_revision r ON r.cliente_id = p_cliente AND r.paso = c.paso
  ORDER BY c.paso;
END $$;
