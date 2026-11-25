-- ====================================================================
-- 034_recalculo_masivo.sql
-- Recalcula adopción, autonomía y score para todos los clientes
-- usando las mismas fórmulas que el JS.
-- Correr UNA SOLA VEZ en el SQL Editor de Supabase.
-- ====================================================================

DO $$
DECLARE
  c           RECORD;
  -- adopción
  total_hist    INT;
  total_rec     INT;
  con_remota_r  INT;
  con_mat_r     INT;
  frec_pts      INT;
  remota_pts    INT;
  mat_pts       INT;
  nueva_adopcion INT;
  -- autonomía
  total_3m      INT;
  con_remota_3m INT;
  con_mat_3m    INT;
  rep_hist      INT;
  frec_auto_pts INT;
  rep_pts       INT;
  pen_mat       INT;
  pen_rem       INT;
  total_auto    INT;
  nueva_autonomia TEXT;
  -- score
  adopcion_pts  NUMERIC;
  autonomia_pts NUMERIC;
  rep_score_pts NUMERIC;
  nuevo_score   INT;
BEGIN

  FOR c IN SELECT * FROM clientes WHERE area = 'soporte' LOOP

    -- ── Consultas históricas del cliente ──
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE repetida = true)
    INTO total_hist, rep_hist
    FROM consultas WHERE cliente_id = c.id;

    -- ── Consultas del último mes ──
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE conexion_remota IS NOT NULL AND conexion_remota != ''),
      COUNT(*) FILTER (WHERE material IS NOT NULL AND material NOT IN ('ninguno', ''))
    INTO total_rec, con_remota_r, con_mat_r
    FROM consultas
    WHERE cliente_id = c.id
      AND created_at >= NOW() - INTERVAL '1 month';

    -- ── Consultas de los últimos 3 meses (para autonomía) ──
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE conexion_remota IS NOT NULL AND conexion_remota != ''),
      COUNT(*) FILTER (WHERE material IS NOT NULL AND material NOT IN ('ninguno', ''))
    INTO total_3m, con_remota_3m, con_mat_3m
    FROM consultas
    WHERE cliente_id = c.id
      AND created_at >= NOW() - INTERVAL '3 months';

    -- ════════════════════════════════
    -- ADOPCIÓN (solo si hay ≥3 históricas y actividad reciente)
    -- ════════════════════════════════
    IF total_hist >= 3 AND total_rec > 0 THEN

      -- Frecuencia (40 pts)
      frec_pts := CASE
        WHEN total_rec <= 1 THEN 40
        WHEN total_rec <= 2 THEN 30
        WHEN total_rec <= 4 THEN 20
        WHEN total_rec <= 7 THEN 10
        ELSE 0
      END;

      -- Conexión remota (30 pts)
      remota_pts := CASE
        WHEN (con_remota_r::float / total_rec) <= 0.10 THEN 30
        WHEN (con_remota_r::float / total_rec) <= 0.25 THEN 20
        WHEN (con_remota_r::float / total_rec) <= 0.50 THEN 10
        ELSE 0
      END;

      -- Material enviado (30 pts)
      mat_pts := CASE
        WHEN (con_mat_r::float / total_rec) <= 0.15 THEN 30
        WHEN (con_mat_r::float / total_rec) <= 0.35 THEN 20
        WHEN (con_mat_r::float / total_rec) <= 0.60 THEN 10
        ELSE 0
      END;

      nueva_adopcion := LEAST(100, GREATEST(0, frec_pts + remota_pts + mat_pts));
      UPDATE clientes SET adopcion = nueva_adopcion WHERE id = c.id;
      c.adopcion := nueva_adopcion;

    END IF;

    -- ════════════════════════════════
    -- AUTONOMÍA (solo si hay ≥3 históricas y actividad en 3 meses)
    -- ════════════════════════════════
    IF total_hist >= 3 AND total_3m > 0 THEN

      -- Frecuencia mensual promedio (0-3 pts)
      frec_auto_pts := CASE
        WHEN (total_3m / 3.0) <= 2 THEN 3
        WHEN (total_3m / 3.0) <= 5 THEN 2
        WHEN (total_3m / 3.0) <= 8 THEN 1
        ELSE 0
      END;

      -- % repetidas históricas (0-3 pts)
      rep_pts := CASE
        WHEN total_hist = 0                                      THEN 0
        WHEN (rep_hist::float / total_hist) <= 0.15             THEN 3
        WHEN (rep_hist::float / total_hist) <= 0.35             THEN 2
        WHEN (rep_hist::float / total_hist) <= 0.55             THEN 1
        ELSE 0
      END;

      -- Penalidades
      pen_mat := CASE WHEN (con_mat_3m::float / total_3m) > 0.50 THEN -1 ELSE 0 END;
      pen_rem := CASE WHEN (con_remota_3m::float / total_3m) > 0.40 THEN -1 ELSE 0 END;

      total_auto := frec_auto_pts + rep_pts + pen_mat + pen_rem;

      nueva_autonomia := CASE
        WHEN total_auto >= 5 THEN 'alta'
        WHEN total_auto >= 3 THEN 'media'
        ELSE 'baja'
      END;

      UPDATE clientes SET autonomia = nueva_autonomia WHERE id = c.id;
      c.autonomia := nueva_autonomia;

    END IF;

    -- ════════════════════════════════
    -- SCORE (siempre se recalcula)
    -- ════════════════════════════════

    -- Adopción (0-4 pts)
    adopcion_pts := (COALESCE(c.adopcion, 0)::float / 100.0) * 4;

    -- Autonomía (0-3 pts)
    autonomia_pts := CASE c.autonomia
      WHEN 'alta'  THEN 3
      WHEN 'media' THEN 1.5
      ELSE 0
    END;

    -- No repetición (0-3 pts)
    IF total_hist = 0 THEN
      rep_score_pts := 1.5;  -- neutral si no hay datos
    ELSE
      rep_score_pts := (1.0 - (rep_hist::float / total_hist)) * 3;
    END IF;

    nuevo_score := LEAST(10, GREATEST(0, ROUND(adopcion_pts + autonomia_pts + rep_score_pts)));
    UPDATE clientes SET score = nuevo_score WHERE id = c.id;

  END LOOP;

  RAISE NOTICE 'Recálculo masivo completado.';
END $$;

-- Verificación
SELECT
  nombre,
  adopcion,
  autonomia,
  score,
  (SELECT COUNT(*) FROM consultas WHERE cliente_id = c.id) AS total_consultas
FROM clientes c
WHERE area = 'soporte'
ORDER BY score DESC;
