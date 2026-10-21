-- ====================================================================
-- 055_borradores_por_asesor.sql
-- Un borrador ABIERTO por ticket Y POR ASESOR (antes: uno por ticket).
-- Regla: el borrador es de quien cierra el chat. Si otro asesor atiende
-- después al mismo cliente y cierra, se crea OTRO borrador para él y el
-- primero queda como está.
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================
DROP INDEX IF EXISTS uq_borrador_abierto_por_ticket;

CREATE UNIQUE INDEX IF NOT EXISTS uq_borrador_abierto_por_ticket_asesor
  ON consultas_borradores (ticket_id, COALESCE(whaticket_user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE estado = 'borrador';

SELECT indexname FROM pg_indexes WHERE tablename = 'consultas_borradores' AND indexname LIKE 'uq_borrador%';
-- Esperado: uq_borrador_abierto_por_ticket_asesor
