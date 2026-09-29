-- 034_repositorio_editado_por.sql
-- Guarda quién fue la última persona en editar un item del Repositorio
-- (distinto de "subido_por", que siempre es quien lo creó originalmente).
-- Se usa para: no auto-notificarte tus propias ediciones, y para que el
-- mensaje del Panel general diga "Fulano editó..." en vez de mostrar
-- siempre al autor original.

ALTER TABLE repositorio_items ADD COLUMN IF NOT EXISTS editado_por text;
