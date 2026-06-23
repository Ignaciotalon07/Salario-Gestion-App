-- ====================================================================
-- SCHEMA COMPLETO — Salario Gestión de Clientes
-- Generado: 2026-06-22
-- ====================================================================
-- Este archivo consolida las 33 migraciones del proyecto en un solo
-- script idempotente. Se puede correr en un Supabase vacío para
-- levantar toda la base de datos desde cero.
--
-- Orden de ejecución:
--   1. Funciones auxiliares
--   2. Tablas (en orden de dependencias)
--   3. Índices
--   4. Triggers
--   5. RLS (Row Level Security)
--   6. Realtime
--   7. Storage policies
--   8. Seed (plantilla de implementación + equipo)
-- ====================================================================


-- ════════════════════════════════════════════════════════════════════
-- 1. FUNCIONES AUXILIARES
-- ════════════════════════════════════════════════════════════════════

-- Trigger genérico para mantener updated_at actualizado
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verifica si el usuario logueado es miembro activo del equipo.
-- SECURITY DEFINER: se ejecuta con los permisos del dueño de la función,
-- lo que permite leer team_members sin exponer la tabla directamente.
CREATE OR REPLACE FUNCTION is_team_member()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE email = (auth.jwt() ->> 'email')
      AND activo = TRUE
  );
$$;

-- Trigger para implementacion_tareas: mantiene updated_at y
-- registra/limpia fecha_completada al cambiar de estado.
CREATE OR REPLACE FUNCTION impl_tareas_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.estado = 'completada' AND OLD.estado <> 'completada' THEN
    NEW.fecha_completada = NOW();
  END IF;
  IF NEW.estado <> 'completada' AND OLD.estado = 'completada' THEN
    NEW.fecha_completada = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ════════════════════════════════════════════════════════════════════
-- 2. TABLAS
-- ════════════════════════════════════════════════════════════════════

-- ── team_members ─────────────────────────────────────────────────────
-- Lista blanca de los 6 miembros del equipo autorizados a usar la app.
-- Solo se modifica desde el SQL Editor de Supabase, no desde el frontend.
CREATE TABLE IF NOT EXISTS team_members (
  email      TEXT PRIMARY KEY,
  nombre     TEXT,
  rol        TEXT DEFAULT 'asesor',
  activo     BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ── clientes ─────────────────────────────────────────────────────────
-- Los 200+ clientes que el equipo atiende vía WhatsApp / Whaticket.
CREATE TABLE IF NOT EXISTS clientes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                      TEXT NOT NULL UNIQUE,
  iniciales                   TEXT NOT NULL,
  razon_social                TEXT,
  cuit                        TEXT,
  tipo                        TEXT NOT NULL CHECK (tipo IN ('empresa','estudio','colegio','municipalidad')),
  area                        TEXT NOT NULL CHECK (area IN ('soporte','impl')),
  asesor                      TEXT,
  autonomia                   TEXT NOT NULL CHECK (autonomia IN ('baja','media','alta')),
  adopcion                    INTEGER DEFAULT 50 CHECK (adopcion BETWEEN 0 AND 100),
  score                       INTEGER DEFAULT 0 CHECK (score BETWEEN 0 AND 10),
  nota                        TEXT,
  telefono                    TEXT,
  whaticket_url               TEXT,
  fecha_inicio_implementacion DATE,
  fecha_fin_objetivo          DATE,
  created_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at                  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);


-- ── pendientes ───────────────────────────────────────────────────────
-- Lo que quedó sin cerrar: tareas abiertas asignadas a un asesor.
CREATE TABLE IF NOT EXISTS pendientes (
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
  tipo_pendiente  TEXT NOT NULL DEFAULT 'soporte'
                  CHECK (tipo_pendiente IN ('soporte','implementacion','bug','comercial','repositorio')),
  fecha_vencimiento DATE,
  telefono        TEXT,
  interno         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);


-- ── pendiente_notas ──────────────────────────────────────────────────
-- Comentarios del equipo sobre un pendiente (contexto, actualizaciones).
CREATE TABLE IF NOT EXISTS pendiente_notas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendiente_id  UUID NOT NULL REFERENCES pendientes(id) ON DELETE CASCADE,
  autor_email   TEXT NOT NULL,
  autor_nombre  TEXT NOT NULL,
  texto         TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ── pendiente_eventos ────────────────────────────────────────────────
-- Audit log de cambios sobre cada pendiente (creado, reasignado, cerrado, etc.)
CREATE TABLE IF NOT EXISTS pendiente_eventos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendiente_id  UUID NOT NULL REFERENCES pendientes(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('creado','reasignado','cerrado','reabierto','editado','nota','venc_actualizado')),
  autor_email   TEXT NOT NULL,
  autor_nombre  TEXT NOT NULL,
  detalle       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ── soluciones ───────────────────────────────────────────────────────
-- Base de conocimiento del equipo: soluciones documentadas a problemas frecuentes.
CREATE TABLE IF NOT EXISTS soluciones (
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


-- ── soluciones_archivos ──────────────────────────────────────────────
-- Archivos adjuntos a soluciones KB (Storage bucket: soluciones-archivos).
CREATE TABLE IF NOT EXISTS soluciones_archivos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  solucion_id  UUID        NOT NULL REFERENCES soluciones(id) ON DELETE CASCADE,
  nombre       TEXT        NOT NULL,
  storage_path TEXT        NOT NULL,
  tipo_mime    TEXT,
  tamano_bytes BIGINT,
  subido_por   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ── consultas ────────────────────────────────────────────────────────
-- Registro de cada atención por WhatsApp. Alimenta métricas de adopción y autonomía.
CREATE TABLE IF NOT EXISTS consultas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          UUID REFERENCES clientes(id) ON DELETE CASCADE,
  cliente_nombre      TEXT NOT NULL,
  asesor              TEXT NOT NULL,
  categoria           TEXT NOT NULL,
  subtema             TEXT,
  repetida            BOOLEAN DEFAULT FALSE,
  resuelto            TEXT CHECK (resuelto IN ('si','parcial','no')),
  tiempo_resolucion   NUMERIC(6,2),
  material            TEXT,
  conexion_remota     TEXT,
  material_enviado    TEXT,
  autonomia_percibida TEXT CHECK (autonomia_percibida IN ('baja','media','alta')),
  descripcion         TEXT,
  solucion            TEXT,
  solucion_id         UUID REFERENCES soluciones(id) ON DELETE SET NULL,
  tipo_consulta       TEXT NOT NULL DEFAULT 'soporte',
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL
);


-- ── implementacion_plantilla ─────────────────────────────────────────
-- Las 23 etapas estándar del proceso de implementación, por tipo de cliente.
-- Se clona para cada cliente nuevo con área='impl'.
CREATE TABLE IF NOT EXISTS implementacion_plantilla (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden              INTEGER NOT NULL,
  tipo               TEXT NOT NULL DEFAULT 'empresa',
  tarea              TEXT NOT NULL,
  responsable_tipo   TEXT NOT NULL CHECK (responsable_tipo IN ('cliente','equipo','ambos')),
  descripcion        TEXT,
  duracion_dias      INTEGER NOT NULL DEFAULT 3,
  predecesoras_orden INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT implementacion_plantilla_orden_tipo_key UNIQUE (orden, tipo)
);


-- ── implementacion_tareas ────────────────────────────────────────────
-- Instancia de las 23 etapas por cliente. Una fila = una etapa de un cliente.
CREATE TABLE IF NOT EXISTS implementacion_tareas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  orden             INTEGER NOT NULL,
  tarea             TEXT NOT NULL,
  responsable_tipo  TEXT NOT NULL CHECK (responsable_tipo IN ('cliente','equipo','ambos')),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','en_progreso','completada','demorada')),
  asesor            TEXT,
  fecha_completada  TIMESTAMPTZ,
  notas             TEXT,
  fecha_estimada    DATE,
  pendiente_id      UUID REFERENCES pendientes(id) ON DELETE SET NULL,
  duracion_dias     INTEGER NOT NULL DEFAULT 3,
  predecesoras_ids  UUID[] DEFAULT ARRAY[]::UUID[],
  fecha_inicio_calc DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id, orden)
);


-- ── implementacion_tarea_notas ────────────────────────────────────────
-- Notas/comentarios por tarea de implementación.
CREATE TABLE IF NOT EXISTS implementacion_tarea_notas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id     UUID NOT NULL REFERENCES implementacion_tareas(id) ON DELETE CASCADE,
  autor_email  TEXT,
  autor_nombre TEXT,
  texto        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── implementacion_tarea_eventos ──────────────────────────────────────
-- Audit log de cambios en tareas de implementación.
CREATE TABLE IF NOT EXISTS implementacion_tarea_eventos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id     UUID NOT NULL REFERENCES implementacion_tareas(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL,
  autor_email  TEXT,
  autor_nombre TEXT,
  detalle      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── implementacion_tarea_archivos ────────────────────────────────────
-- Archivos adjuntos a tareas de implementación (Storage bucket: implementacion-archivos).
CREATE TABLE IF NOT EXISTS implementacion_tarea_archivos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id     UUID        NOT NULL REFERENCES implementacion_tareas(id) ON DELETE CASCADE,
  nombre       TEXT        NOT NULL,
  storage_path TEXT        NOT NULL,
  tipo_mime    TEXT,
  tamano_bytes BIGINT,
  subido_por   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ── repositorio_items ────────────────────────────────────────────────
-- Items del repositorio: recursos compartidos por el programador.
CREATE TABLE IF NOT EXISTS repositorio_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo      TEXT        NOT NULL,
  categoria   TEXT        NOT NULL CHECK (categoria IN ('actualizacion','modulo','bug','manual','clientes')),
  descripcion TEXT,
  subido_por  TEXT,
  revisado    BOOLEAN     DEFAULT FALSE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ── repositorio_archivos ─────────────────────────────────────────────
-- Archivos adjuntos a items del repositorio (Storage bucket: repositorio-archivos).
CREATE TABLE IF NOT EXISTS repositorio_archivos (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      UUID        NOT NULL REFERENCES repositorio_items(id) ON DELETE CASCADE,
  nombre       TEXT        NOT NULL,
  storage_path TEXT        NOT NULL,
  tipo_mime    TEXT,
  tamano_bytes BIGINT,
  subido_por   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ── repositorio_visto ────────────────────────────────────────────────
-- Rastrea cuándo cada usuario visitó el repositorio por última vez.
-- Permite mostrar badge "Nuevo" por usuario.
CREATE TABLE IF NOT EXISTS repositorio_visto (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ultimo_visto_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── facturas ─────────────────────────────────────────────────────────
-- Tabla legacy del módulo de facturación (eliminado de la UI).
-- Se conserva para no perder datos históricos.
CREATE TABLE IF NOT EXISTS facturas (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  mes               INT         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio              INT         NOT NULL,
  fecha_facturacion DATE,
  fecha_proxima     DATE,
  monto             NUMERIC(10,2),
  estado            TEXT        NOT NULL DEFAULT 'pendiente',
  pdf_url           TEXT,
  pdf_path          TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cliente_id, mes, anio)
);


-- ════════════════════════════════════════════════════════════════════
-- 3. ÍNDICES
-- ════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_clientes_area_aut      ON clientes(area, autonomia);
CREATE INDEX IF NOT EXISTS idx_clientes_score         ON clientes(score DESC);
CREATE INDEX IF NOT EXISTS idx_pendientes_resuelto    ON pendientes(resuelto, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pendientes_cliente     ON pendientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pendientes_tipo        ON pendientes(tipo_pendiente);
CREATE INDEX IF NOT EXISTS idx_pendientes_vencimiento ON pendientes(fecha_vencimiento)
  WHERE fecha_vencimiento IS NOT NULL AND resuelto = FALSE;
CREATE INDEX IF NOT EXISTS idx_notas_pendiente        ON pendiente_notas(pendiente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eventos_pendiente      ON pendiente_eventos(pendiente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultas_cliente_fecha ON consultas(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultas_categoria    ON consultas(categoria);
CREATE INDEX IF NOT EXISTS idx_consultas_asesor_fecha ON consultas(asesor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_soluciones_cat         ON soluciones(cat);
CREATE INDEX IF NOT EXISTS idx_soluciones_usos        ON soluciones(usos DESC);
CREATE INDEX IF NOT EXISTS impl_tareas_cliente_idx    ON implementacion_tareas(cliente_id, orden);
CREATE INDEX IF NOT EXISTS impl_tareas_pendiente_idx  ON implementacion_tareas(pendiente_id)
  WHERE pendiente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS impl_tarea_notas_tarea_idx ON implementacion_tarea_notas(tarea_id, created_at);
CREATE INDEX IF NOT EXISTS impl_eventos_tarea_idx     ON implementacion_tarea_eventos(tarea_id, created_at DESC);


-- ════════════════════════════════════════════════════════════════════
-- 4. TRIGGERS
-- ════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_clientes_updated  ON clientes;
CREATE TRIGGER trg_clientes_updated
  BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_soluciones_updated ON soluciones;
CREATE TRIGGER trg_soluciones_updated
  BEFORE UPDATE ON soluciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS impl_tareas_updated_at_trg ON implementacion_tareas;
CREATE TRIGGER impl_tareas_updated_at_trg
  BEFORE UPDATE ON implementacion_tareas
  FOR EACH ROW EXECUTE FUNCTION impl_tareas_set_updated_at();


-- ════════════════════════════════════════════════════════════════════
-- 5. RLS (ROW LEVEL SECURITY)
-- ════════════════════════════════════════════════════════════════════
-- Patrón estándar: solo miembros activos del equipo pueden leer y escribir.

ALTER TABLE clientes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pendientes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pendiente_notas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pendiente_eventos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultas                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE soluciones                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE soluciones_archivos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members                ENABLE ROW LEVEL SECURITY;
ALTER TABLE implementacion_plantilla    ENABLE ROW LEVEL SECURITY;
ALTER TABLE implementacion_tareas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE implementacion_tarea_notas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE implementacion_tarea_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE implementacion_tarea_archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositorio_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositorio_archivos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositorio_visto           ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas                    ENABLE ROW LEVEL SECURITY;

-- team_members: cualquier autenticado puede leer (la app lo necesita),
-- pero nadie puede escribir desde el frontend.
DROP POLICY IF EXISTS "team_read_members" ON team_members;
CREATE POLICY "team_read_members" ON team_members
  FOR SELECT TO authenticated USING (true);

-- clientes
DROP POLICY IF EXISTS "team_only_clientes" ON clientes;
CREATE POLICY "team_only_clientes" ON clientes
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- pendientes
DROP POLICY IF EXISTS "team_only_pendientes" ON pendientes;
CREATE POLICY "team_only_pendientes" ON pendientes
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- pendiente_notas
DROP POLICY IF EXISTS "team_only_notas" ON pendiente_notas;
CREATE POLICY "team_only_notas" ON pendiente_notas
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- pendiente_eventos
DROP POLICY IF EXISTS "team_only_eventos" ON pendiente_eventos;
CREATE POLICY "team_only_eventos" ON pendiente_eventos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- consultas
DROP POLICY IF EXISTS "team_only_consultas" ON consultas;
CREATE POLICY "team_only_consultas" ON consultas
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- soluciones
DROP POLICY IF EXISTS "team_only_soluciones" ON soluciones;
CREATE POLICY "team_only_soluciones" ON soluciones
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- soluciones_archivos
DROP POLICY IF EXISTS "team_sol_archivos_all" ON soluciones_archivos;
CREATE POLICY "team_sol_archivos_all" ON soluciones_archivos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- implementacion_plantilla
DROP POLICY IF EXISTS "impl_plantilla_select" ON implementacion_plantilla;
DROP POLICY IF EXISTS "impl_plantilla_insert" ON implementacion_plantilla;
DROP POLICY IF EXISTS "impl_plantilla_update" ON implementacion_plantilla;
DROP POLICY IF EXISTS "impl_plantilla_delete" ON implementacion_plantilla;
CREATE POLICY "impl_plantilla_select" ON implementacion_plantilla FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "impl_plantilla_insert" ON implementacion_plantilla FOR INSERT TO authenticated WITH CHECK (is_team_member());
CREATE POLICY "impl_plantilla_update" ON implementacion_plantilla FOR UPDATE TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
CREATE POLICY "impl_plantilla_delete" ON implementacion_plantilla FOR DELETE TO authenticated USING (is_team_member());

-- implementacion_tareas
DROP POLICY IF EXISTS "impl_tareas_select" ON implementacion_tareas;
DROP POLICY IF EXISTS "impl_tareas_insert" ON implementacion_tareas;
DROP POLICY IF EXISTS "impl_tareas_update" ON implementacion_tareas;
DROP POLICY IF EXISTS "impl_tareas_delete" ON implementacion_tareas;
CREATE POLICY "impl_tareas_select" ON implementacion_tareas FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "impl_tareas_insert" ON implementacion_tareas FOR INSERT TO authenticated WITH CHECK (is_team_member());
CREATE POLICY "impl_tareas_update" ON implementacion_tareas FOR UPDATE TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
CREATE POLICY "impl_tareas_delete" ON implementacion_tareas FOR DELETE TO authenticated USING (is_team_member());

-- implementacion_tarea_notas
DROP POLICY IF EXISTS "impl_tarea_notas_select" ON implementacion_tarea_notas;
DROP POLICY IF EXISTS "impl_tarea_notas_insert" ON implementacion_tarea_notas;
DROP POLICY IF EXISTS "impl_tarea_notas_delete" ON implementacion_tarea_notas;
CREATE POLICY "impl_tarea_notas_select" ON implementacion_tarea_notas FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "impl_tarea_notas_insert" ON implementacion_tarea_notas FOR INSERT TO authenticated WITH CHECK (is_team_member());
CREATE POLICY "impl_tarea_notas_delete" ON implementacion_tarea_notas FOR DELETE TO authenticated USING (is_team_member());

-- implementacion_tarea_eventos
DROP POLICY IF EXISTS "impl_eventos_select" ON implementacion_tarea_eventos;
DROP POLICY IF EXISTS "impl_eventos_insert" ON implementacion_tarea_eventos;
CREATE POLICY "impl_eventos_select" ON implementacion_tarea_eventos FOR SELECT TO authenticated USING (is_team_member());
CREATE POLICY "impl_eventos_insert" ON implementacion_tarea_eventos FOR INSERT TO authenticated WITH CHECK (is_team_member());

-- implementacion_tarea_archivos
DROP POLICY IF EXISTS "team_archivos_all" ON implementacion_tarea_archivos;
CREATE POLICY "team_archivos_all" ON implementacion_tarea_archivos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- repositorio_items
DROP POLICY IF EXISTS "team_repo_items_all" ON repositorio_items;
CREATE POLICY "team_repo_items_all" ON repositorio_items
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- repositorio_archivos
DROP POLICY IF EXISTS "team_repo_archivos_all" ON repositorio_archivos;
CREATE POLICY "team_repo_archivos_all" ON repositorio_archivos
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

-- repositorio_visto: cada usuario solo ve y edita su propio registro
DROP POLICY IF EXISTS "repo_visto_own" ON repositorio_visto;
CREATE POLICY "repo_visto_own" ON repositorio_visto
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- facturas (legacy)
DROP POLICY IF EXISTS "facturas_all" ON facturas;
CREATE POLICY "facturas_all" ON facturas
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());


-- ════════════════════════════════════════════════════════════════════
-- 6. REALTIME
-- ════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  tablas TEXT[] := ARRAY[
    'clientes', 'pendientes', 'pendiente_notas', 'consultas', 'soluciones',
    'implementacion_tareas', 'implementacion_tarea_notas', 'implementacion_tarea_eventos',
    'implementacion_tarea_archivos', 'soluciones_archivos',
    'repositorio_items', 'repositorio_archivos'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- 7. STORAGE POLICIES
-- ════════════════════════════════════════════════════════════════════
-- IMPORTANTE: los buckets deben crearse manualmente en el dashboard de
-- Supabase antes de correr estas policies:
--   Storage → New bucket → Private (no public)
--   Buckets necesarios:
--     - implementacion-archivos
--     - soluciones-archivos
--     - repositorio-archivos

-- implementacion-archivos
DROP POLICY IF EXISTS "impl_archivos_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "impl_archivos_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "impl_archivos_storage_delete" ON storage.objects;
CREATE POLICY "impl_archivos_storage_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'implementacion-archivos' AND is_team_member());
CREATE POLICY "impl_archivos_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'implementacion-archivos' AND is_team_member());
CREATE POLICY "impl_archivos_storage_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'implementacion-archivos' AND is_team_member());

-- soluciones-archivos
DROP POLICY IF EXISTS "sol_archivos_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "sol_archivos_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "sol_archivos_storage_delete" ON storage.objects;
CREATE POLICY "sol_archivos_storage_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'soluciones-archivos' AND is_team_member());
CREATE POLICY "sol_archivos_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'soluciones-archivos' AND is_team_member());
CREATE POLICY "sol_archivos_storage_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'soluciones-archivos' AND is_team_member());

-- repositorio-archivos
DROP POLICY IF EXISTS "repo_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "repo_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "repo_storage_delete" ON storage.objects;
CREATE POLICY "repo_storage_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'repositorio-archivos' AND is_team_member());
CREATE POLICY "repo_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'repositorio-archivos' AND is_team_member());
CREATE POLICY "repo_storage_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'repositorio-archivos' AND is_team_member());


-- ════════════════════════════════════════════════════════════════════
-- 8. FUNCIÓN RPC — crear_implementacion_para_cliente
-- ════════════════════════════════════════════════════════════════════
-- Crea las 23 tareas para un cliente nuevo copiando la plantilla del
-- tipo correspondiente (empresa / estudio / colegio / municipalidad).
-- Llamada desde JS al dar de alta un cliente con area='impl'.

CREATE OR REPLACE FUNCTION crear_implementacion_para_cliente(
  p_cliente_id UUID,
  p_tipo       TEXT DEFAULT 'empresa'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  insertadas INTEGER;
BEGIN
  -- Paso 1: insertar las tareas con duracion
  INSERT INTO implementacion_tareas (cliente_id, orden, tarea, responsable_tipo, duracion_dias)
  SELECT p_cliente_id, p.orden, p.tarea, p.responsable_tipo, COALESCE(p.duracion_dias, 3)
  FROM implementacion_plantilla p
  WHERE p.tipo = p_tipo
    AND NOT EXISTS (
      SELECT 1 FROM implementacion_tareas t
      WHERE t.cliente_id = p_cliente_id AND t.orden = p.orden
    )
  ORDER BY p.orden;

  GET DIAGNOSTICS insertadas = ROW_COUNT;

  -- Paso 2: mapear predecesoras_orden → predecesoras_ids (UUIDs reales del cliente)
  UPDATE implementacion_tareas t
  SET predecesoras_ids = (
    SELECT COALESCE(array_agg(t2.id ORDER BY t2.orden), ARRAY[]::UUID[])
    FROM implementacion_plantilla p
    JOIN unnest(p.predecesoras_orden) AS pred_orden ON TRUE
    JOIN implementacion_tareas t2 ON t2.cliente_id = p_cliente_id AND t2.orden = pred_orden
    WHERE p.orden = t.orden AND p.tipo = p_tipo
  )
  WHERE t.cliente_id = p_cliente_id
    AND (t.predecesoras_ids IS NULL OR cardinality(t.predecesoras_ids) = 0)
    AND EXISTS (
      SELECT 1 FROM implementacion_plantilla p
      WHERE p.orden = t.orden AND p.tipo = p_tipo
        AND cardinality(p.predecesoras_orden) > 0
    );

  RETURN insertadas;
END;
$$;

GRANT EXECUTE ON FUNCTION crear_implementacion_para_cliente(UUID, TEXT) TO authenticated;


-- ════════════════════════════════════════════════════════════════════
-- 9. SEED — Equipo
-- ════════════════════════════════════════════════════════════════════

INSERT INTO team_members (email, nombre, rol) VALUES
  ('ignaciotalon07@gmail.com',           'Ignacio',      'asesor'),
  ('matias@salario.local',               'Matias',       'asesor'),
  ('daniel@salario.local',               'Daniel',       'asesor'),
  ('danielferro@salario.local',          'Daniel Ferro', 'asesor'),
  ('renzo@salario.local',                'Renzo',        'asesor'),
  ('Alfredo.Cesar@consultoraferro.com.ar','Alfred',      'asesor')
ON CONFLICT (email) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════
-- 10. SEED — Plantilla de implementación (23 etapas × 4 tipos)
-- ════════════════════════════════════════════════════════════════════

-- Insertar plantilla base (tipo 'empresa')
INSERT INTO implementacion_plantilla (orden, tipo, tarea, responsable_tipo, duracion_dias, predecesoras_orden)
SELECT v.orden, 'empresa', v.tarea, v.resp, v.dias, v.pred
FROM (VALUES
  ( 1, 'Entrevista de relevamiento',                                'ambos',  2, ARRAY[]::INTEGER[]),
  ( 2, 'Armado de empresa',                                         'equipo', 3, ARRAY[1]),
  ( 3, 'Armado de nomina',                                          'equipo', 3, ARRAY[2]),
  ( 4, 'Recibir PDF de ultimas liquidaciones',                      'cliente',2, ARRAY[1]),
  ( 5, 'Recibir LSD y libro Ministerio de ultimas liquidaciones',   'cliente',2, ARRAY[1]),
  ( 6, 'Logos y firmas + diseño recibo',                            'ambos',  3, ARRAY[2]),
  ( 7, 'Recibir ejemplos de informes especiales solicitados',       'cliente',2, ARRAY[1]),
  ( 8, 'Excel de acumulados de ganancias',                          'cliente',2, ARRAY[1]),
  ( 9, 'Plan de cuenta para asientos contables',                    'cliente',2, ARRAY[1]),
  (10, 'Recibir solicitud de centros de costos',                    'cliente',2, ARRAY[1]),
  (11, 'Analisis de liquidaciones',                                 'equipo', 5, ARRAY[3,4,5]),
  (12, 'Armado de modelo de calculo',                               'equipo', 5, ARRAY[11]),
  (13, 'Analisis de carga de novedades',                            'equipo', 3, ARRAY[11]),
  (14, 'Primer paralelo de liquidacion',                            'equipo', 5, ARRAY[12,13]),
  (15, 'Segundo paralelo de liquidacion',                           'equipo', 5, ARRAY[14]),
  (16, 'Pruebas bancarias',                                         'equipo', 2, ARRAY[15]),
  (17, 'Prueba 931',                                                'equipo', 2, ARRAY[15]),
  (18, 'Pruebas otras exportaciones (Sindicato + SICORE + SIJCOR)', 'equipo', 2, ARRAY[15]),
  (19, 'Instalacion de Salario',                                    'equipo', 1, ARRAY[16,17,18]),
  (20, 'Capacitacion a usuarios',                                   'equipo', 3, ARRAY[19]),
  (21, 'Primer mes de acompañamiento - adopcion cliente',           'equipo',30, ARRAY[20]),
  (22, 'Segundo mes de acompañamiento - adopcion cliente',          'equipo',30, ARRAY[21]),
  (23, 'Devolucion de mediciones de adopcion cliente',              'equipo', 2, ARRAY[22])
) AS v(orden, tarea, resp, dias, pred)
ON CONFLICT (orden, tipo) DO NOTHING;

-- Clonar plantilla para los otros 3 tipos de cliente
INSERT INTO implementacion_plantilla (orden, tipo, tarea, responsable_tipo, duracion_dias, predecesoras_orden)
SELECT orden, tipos.tipo, tarea, responsable_tipo, duracion_dias, predecesoras_orden
FROM implementacion_plantilla
CROSS JOIN (VALUES ('estudio'), ('colegio'), ('municipalidad')) AS tipos(tipo)
WHERE implementacion_plantilla.tipo = 'empresa'
ON CONFLICT (orden, tipo) DO NOTHING;


-- ════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL
-- ════════════════════════════════════════════════════════════════════

SELECT
  (SELECT COUNT(*) FROM team_members)                AS team_members,
  (SELECT COUNT(*) FROM implementacion_plantilla)    AS plantilla_etapas,
  (SELECT COUNT(*) FROM clientes)                    AS clientes,
  (SELECT COUNT(*) FROM pendientes)                  AS pendientes,
  (SELECT COUNT(*) FROM consultas)                   AS consultas,
  (SELECT COUNT(*) FROM soluciones)                  AS soluciones,
  (SELECT COUNT(*) FROM repositorio_items)           AS repo_items;
