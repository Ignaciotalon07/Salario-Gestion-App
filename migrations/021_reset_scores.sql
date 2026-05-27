-- ════════════════════════════════════════════════════════════════
-- 021_reset_scores.sql
-- Resetea el score de todos los clientes a 0.
-- A partir de ahora el score se calcula automáticamente desde las
-- consultas: adopción + autonomía + % no repetición.
-- ════════════════════════════════════════════════════════════════

UPDATE clientes SET score = 0;
