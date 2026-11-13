-- 072: solución de la Base de soluciones sugerida en los borradores "Por registrar" (Whaticket)
-- La Edge Function `whaticket-sync` compara el chat con las soluciones existentes y, si alguna
-- resuelve la consulta, guarda acá cuál es y qué tan segura es la coincidencia.
-- El asesor siempre confirma: nunca se vincula sola.
--   solucion_id_sugerida  → solución existente que propone la IA (NULL si no hay coincidencia)
--   solucion_coincidencia → 'alta' | 'media' (NULL si no hay)
-- Si la solución se borra de la base, la sugerencia se limpia sola (ON DELETE SET NULL).
-- Idempotente.
ALTER TABLE consultas_borradores
  ADD COLUMN IF NOT EXISTS solucion_id_sugerida uuid REFERENCES soluciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS solucion_coincidencia text;

ALTER TABLE consultas_borradores DROP CONSTRAINT IF EXISTS consultas_borradores_solucion_coincidencia_chk;
ALTER TABLE consultas_borradores
  ADD CONSTRAINT consultas_borradores_solucion_coincidencia_chk
  CHECK (solucion_coincidencia IS NULL OR solucion_coincidencia IN ('alta', 'media'));
