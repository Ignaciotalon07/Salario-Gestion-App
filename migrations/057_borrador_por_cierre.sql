-- ====================================================================
-- 057_borrador_por_cierre.sql
-- Un borrador por CADA cierre de chat (antes: uno abierto por ticket y asesor).
-- Si el mismo cliente vuelve más tarde con otro problema, es otro borrador,
-- aunque el anterior siga sin registrar.
-- Garantía anti-duplicados: un mismo cierre (ticket + id de la nota "resuelto") nunca genera 2 borradores.
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================
DROP INDEX IF EXISTS uq_borrador_abierto_por_ticket_asesor;
DROP INDEX IF EXISTS uq_borrador_abierto_por_ticket;

CREATE UNIQUE INDEX IF NOT EXISTS uq_borrador_por_cierre
  ON consultas_borradores (ticket_id, ultimo_mensaje_id)
  WHERE ultimo_mensaje_id IS NOT NULL;

SELECT indexname FROM pg_indexes WHERE tablename = 'consultas_borradores' AND indexname LIKE 'uq_borrador%';
-- Esperado: uq_borrador_por_cierre
