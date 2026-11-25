-- ====================================================================
-- 064_PRIORIDADES_PENDIENTES — Nuevas prioridades de pendientes
--   muy_urgente (24 hs) · prioritario (72 hs) · semana (10 días)
--   mes (30 días) · cuando_se_pueda (60 días) · sin_tiempo (90 días)
-- Convierte las viejas: alta→muy_urgente, media→semana, baja→cuando_se_pueda.
-- Idempotente.
-- ====================================================================

-- 1) Sacar el CHECK viejo (alta/media/baja), sea cual sea su nombre
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'pendientes'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%prioridad%'
  LOOP
    EXECUTE format('ALTER TABLE pendientes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 2) Convertir los datos existentes
UPDATE pendientes SET prioridad = 'muy_urgente'     WHERE prioridad = 'alta';
UPDATE pendientes SET prioridad = 'semana'          WHERE prioridad = 'media';
UPDATE pendientes SET prioridad = 'cuando_se_pueda' WHERE prioridad = 'baja';

-- 3) CHECK nuevo
ALTER TABLE pendientes ADD CONSTRAINT pendientes_prioridad_check
  CHECK (prioridad IN ('muy_urgente','prioritario','semana','mes','cuando_se_pueda','sin_tiempo'));

-- Verificación
SELECT prioridad, COUNT(*) FROM pendientes GROUP BY prioridad ORDER BY 2 DESC;
