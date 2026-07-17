-- ══════════════════════════════════════════════════════════════════
-- 034 · Limpiar pendientes bloqueados de implementación AIVEL
-- Elimina los pendientes que se crearon automáticamente al asignar
-- asesores a tareas que todavía no estaban desbloqueadas
-- (tenían predecesoras sin completar).
-- También limpia pendiente_id en esas tareas para que se recreen
-- correctamente cuando corresponda.
-- ══════════════════════════════════════════════════════════════════

-- ── PASO 1: Vista previa (corré esto primero para verificar) ──────
-- SELECT
--   t.id          AS tarea_id,
--   t.tarea       AS nombre_tarea,
--   t.asesor,
--   t.estado,
--   t.pendiente_id,
--   c.nombre      AS cliente
-- FROM implementacion_tareas t
-- JOIN clientes c ON c.id = t.cliente_id
-- WHERE c.nombre ILIKE '%AIVEL%'
--   AND t.pendiente_id IS NOT NULL
--   AND t.estado != 'completada'
--   AND array_length(t.predecesoras_ids, 1) > 0
--   AND EXISTS (
--     SELECT 1 FROM implementacion_tareas pred
--     WHERE pred.id = ANY(t.predecesoras_ids)
--       AND pred.estado != 'completada'
--   );

-- ── PASO 2: Eliminar los pendientes bloqueados ────────────────────
DELETE FROM pendientes
WHERE id IN (
  SELECT t.pendiente_id
  FROM implementacion_tareas t
  JOIN clientes c ON c.id = t.cliente_id
  WHERE c.nombre ILIKE '%AIVEL%'
    AND t.pendiente_id IS NOT NULL
    AND t.estado != 'completada'
    AND array_length(t.predecesoras_ids, 1) > 0
    AND EXISTS (
      SELECT 1 FROM implementacion_tareas pred
      WHERE pred.id = ANY(t.predecesoras_ids)
        AND pred.estado != 'completada'
    )
);

-- ── PASO 3: Limpiar pendiente_id en esas tareas ───────────────────
-- (para que el sistema cree el pendiente correctamente al desbloquearse)
UPDATE implementacion_tareas t
SET pendiente_id = NULL
FROM clientes c
WHERE c.id = t.cliente_id
  AND c.nombre ILIKE '%AIVEL%'
  AND t.pendiente_id IS NOT NULL
  AND t.estado != 'completada'
  AND array_length(t.predecesoras_ids, 1) > 0
  AND EXISTS (
    SELECT 1 FROM implementacion_tareas pred
    WHERE pred.id = ANY(t.predecesoras_ids)
      AND pred.estado != 'completada'
  );
