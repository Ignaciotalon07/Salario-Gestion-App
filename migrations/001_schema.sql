-- ====================================================================
-- 001_SCHEMA — Tablas base de Salario Gestion
-- Corre esto PRIMERO en el SQL Editor de Supabase.
-- ====================================================================

-- Trigger reusable para mantener updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- CLIENTES — los 200+ clientes que el equipo atiende
-- ====================================================================
CREATE TABLE clientes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('empresa','estudio','colegio','municipalidad')),
  area        TEXT NOT NULL CHECK (area IN ('soporte','impl')),
  asesor      TEXT NOT NULL,
  autonomia   TEXT NOT NULL CHECK (autonomia IN ('baja','media','alta')),
  iniciales   TEXT NOT NULL,
  adopcion    INTEGER DEFAULT 0 CHECK (adopcion BETWEEN 0 AND 100),
  score       INTEGER DEFAULT 0 CHECK (score BETWEEN 0 AND 10),
  nota        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_clientes_area_aut ON clientes(area, autonomia);
CREATE INDEX idx_clientes_score ON clientes(score DESC);

CREATE TRIGGER trg_clientes_updated
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ====================================================================
-- PENDIENTES — lo que quedo sin cerrar del dia anterior
-- ====================================================================
CREATE TABLE pendientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID REFERENCES clientes(id) ON DELETE CASCADE,
  cliente_nombre  TEXT NOT NULL,
  asesor          TEXT NOT NULL,
  prioridad       TEXT NOT NULL CHECK (prioridad IN ('alta','media','baja')),
  categoria       TEXT,
  descripcion     TEXT NOT NULL,
  intento         TEXT,
  prox_paso       TEXT,
  resuelto        BOOLEAN DEFAULT FALSE NOT NULL,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_pendientes_resuelto ON pendientes(resuelto, created_at DESC);
CREATE INDEX idx_pendientes_cliente ON pendientes(cliente_id);


-- ====================================================================
-- CONSULTAS — registro de cada atencion por WhatsApp
-- ====================================================================
CREATE TABLE consultas (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id           UUID REFERENCES clientes(id) ON DELETE CASCADE,
  cliente_nombre       TEXT NOT NULL,
  asesor               TEXT NOT NULL,
  categoria            TEXT NOT NULL,
  subtema              TEXT,
  repetida             BOOLEAN DEFAULT FALSE,
  resuelto             TEXT CHECK (resuelto IN ('si','parcial','no')),
  tiempo_resolucion    NUMERIC(4,2),
  material_enviado     TEXT,
  autonomia_percibida  TEXT CHECK (autonomia_percibida IN ('baja','media','alta')),
  conexion_remota      TEXT,
  descripcion          TEXT,
  solucion             TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_consultas_cliente_fecha ON consultas(cliente_id, created_at DESC);
CREATE INDEX idx_consultas_categoria ON consultas(categoria);
CREATE INDEX idx_consultas_asesor_fecha ON consultas(asesor, created_at DESC);


-- ====================================================================
-- SOLUCIONES — base de conocimiento del equipo
-- ====================================================================
CREATE TABLE soluciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo          TEXT NOT NULL,
  cat             TEXT NOT NULL CHECK (cat IN ('liquidacion','errores','configuracion','actualizaciones','fuera')),
  sub             TEXT,
  pasos           JSONB NOT NULL DEFAULT '[]'::jsonb,
  material        TEXT,
  aplica          TEXT,
  autor           TEXT,
  usos            INTEGER DEFAULT 0,
  fecha_revision  DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_soluciones_cat ON soluciones(cat);
CREATE INDEX idx_soluciones_usos ON soluciones(usos DESC);

CREATE TRIGGER trg_soluciones_updated
  BEFORE UPDATE ON soluciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
