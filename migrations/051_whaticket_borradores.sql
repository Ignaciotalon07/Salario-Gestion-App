-- ====================================================================
-- 051_whaticket_borradores.sql
-- Integración con Whaticket: borradores de consultas ("Por registrar").
--
-- Cuando un asesor cierra un chat en Whaticket, un proceso automático
-- (Edge Function `whaticket-sync`, se agrega en el próximo paso) arma un
-- borrador con los datos precargados. El asesor lo abre en "Por registrar",
-- completa lo que falta y lo guarda como una consulta normal.
--
-- Crea:
--   1. whaticket_usuarios    → usuario de Whaticket ↔ miembro del equipo
--   2. whaticket_contactos   → contacto de Whaticket ↔ cliente de Gestión
--   3. consultas_borradores  → los borradores (uno abierto por ticket)
--   4. whaticket_sync        → estado interno de la sincronización
--   5. RLS, triggers y realtime
--
-- Reglas acordadas:
--   - Los grupos de WhatsApp NO generan borradores (son internos).
--   - Si un chat se cierra sin terminar y el cliente vuelve a escribir, los
--     mensajes nuevos se SUMAN al borrador abierto de ese ticket (opción B).
--     Por eso hay un índice único: un solo borrador abierto por ticket.
--   - Cada asesor ve solo sus borradores. Un rol 'coordinador' (opcional)
--     ve todos, incluidos los que quedaron sin asignar.
--
-- Correr en: Supabase → SQL Editor → New query → pegar todo → Run.
-- Idempotente: se puede correr más de una vez sin error.
-- ====================================================================


-- ── Helper: el usuario logueado es coordinador? ─────────────────────
-- Hoy nadie tiene ese rol; se asigna con:
--   UPDATE team_members SET rol = 'coordinador' WHERE email = '...';
CREATE OR REPLACE FUNCTION is_coordinador()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE email = (auth.jwt() ->> 'email')
      AND activo = TRUE
      AND rol = 'coordinador'
  );
$$;


-- ====================================================================
-- 1. WHATICKET_USUARIOS — quién es quién en Whaticket
-- La Edge Function la llena sola con GET /users. Si el email de Whaticket
-- coincide con el de team_members, se vincula automático; si no, se
-- completa team_email a mano (ver verificación al final).
-- ====================================================================
CREATE TABLE IF NOT EXISTS whaticket_usuarios (
  whaticket_user_id  uuid        PRIMARY KEY,
  nombre_whaticket   text        NOT NULL,
  email_whaticket    text,
  team_email         text        REFERENCES team_members(email) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_whaticket_usuarios_updated ON whaticket_usuarios;
CREATE TRIGGER trg_whaticket_usuarios_updated
  BEFORE UPDATE ON whaticket_usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ====================================================================
-- 2. WHATICKET_CONTACTOS — a qué cliente pertenece cada contacto
-- Se llena: (a) con la vinculación inicial (whaticket_url de clientes),
-- (b) cuando un asesor elige el cliente en un borrador "Sin cliente".
-- ====================================================================
CREATE TABLE IF NOT EXISTS whaticket_contactos (
  whaticket_contact_id  uuid        PRIMARY KEY,
  nombre                text,
  numero                text,
  ticket_id             uuid,
  cliente_id            uuid        REFERENCES clientes(id) ON DELETE SET NULL,
  vinculado_por         text,        -- 'auto' | nombre del asesor que lo vinculó
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whaticket_contactos_cliente ON whaticket_contactos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_whaticket_contactos_ticket  ON whaticket_contactos(ticket_id);

DROP TRIGGER IF EXISTS trg_whaticket_contactos_updated ON whaticket_contactos;
CREATE TRIGGER trg_whaticket_contactos_updated
  BEFORE UPDATE ON whaticket_contactos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ====================================================================
-- 3. CONSULTAS_BORRADORES — lo que aparece en "Por registrar"
-- ====================================================================
CREATE TABLE IF NOT EXISTS consultas_borradores (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Origen en Whaticket
  ticket_id               uuid        NOT NULL,
  whaticket_contact_id    uuid,
  contacto_nombre         text,
  contacto_numero         text,
  whaticket_user_id       uuid,        -- quien resolvió el chat

  -- Dueño del borrador (null = sin asignar, lo ve el coordinador)
  asesor_email            text        REFERENCES team_members(email) ON DELETE SET NULL,

  -- Cliente detectado (null = "Sin cliente", el asesor lo elige)
  cliente_id              uuid        REFERENCES clientes(id) ON DELETE SET NULL,

  -- Rango de la conversación que cubre este borrador
  inicio_at               timestamptz,  -- primer mensaje del tramo
  cierre_at               timestamptz,  -- último "resuelto" (se actualiza al sumar tramos)
  ultimo_mensaje_id       text,         -- para no procesar dos veces lo mismo

  -- Datos sugeridos (el asesor los revisa y corrige en el form)
  tiempo_sugerido         numeric(6,2), -- en HORAS, igual que consultas.tiempo_resolucion
  conexion_sugerida       boolean     NOT NULL DEFAULT false,
  repetida_sugerida       boolean     NOT NULL DEFAULT false,
  repetida_consulta_id    uuid        REFERENCES consultas(id) ON DELETE SET NULL,
  detalle_sugerido        text,
  tiene_audio             boolean     NOT NULL DEFAULT false,

  -- Conversación (ya limpia: sin firma "*Nombre:*", con bot y notas marcados)
  -- Formato de cada item: { id, at, de: 'cliente'|'asesor'|'bot'|'nota',
  --                         texto, tipo, media_url, user_id }
  mensajes                jsonb       NOT NULL DEFAULT '[]'::jsonb,
  cant_mensajes           integer     NOT NULL DEFAULT 0,
  tramos                  integer     NOT NULL DEFAULT 1, -- >1 si se sumaron chats (opción B)

  -- Estado
  estado                  text        NOT NULL DEFAULT 'borrador'
                          CHECK (estado IN ('borrador', 'registrado', 'descartado')),
  consulta_id             uuid        REFERENCES consultas(id) ON DELETE SET NULL,
  resuelto_at             timestamptz,  -- cuándo se registró o descartó
  resuelto_por            text,         -- nombre del asesor

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Opción B: un solo borrador ABIERTO por ticket. Si el cliente vuelve a
-- escribir, la Edge Function actualiza este en vez de crear otro.
CREATE UNIQUE INDEX IF NOT EXISTS uq_borrador_abierto_por_ticket
  ON consultas_borradores(ticket_id) WHERE estado = 'borrador';

CREATE INDEX IF NOT EXISTS idx_borradores_asesor_estado
  ON consultas_borradores(asesor_email, estado, cierre_at);
CREATE INDEX IF NOT EXISTS idx_borradores_cliente
  ON consultas_borradores(cliente_id);

DROP TRIGGER IF EXISTS trg_consultas_borradores_updated ON consultas_borradores;
CREATE TRIGGER trg_consultas_borradores_updated
  BEFORE UPDATE ON consultas_borradores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ====================================================================
-- 4. WHATICKET_SYNC — estado interno (hasta dónde se procesó)
-- Solo la usa la Edge Function (con service role, que saltea RLS).
-- ====================================================================
CREATE TABLE IF NOT EXISTS whaticket_sync (
  clave       text        PRIMARY KEY,   -- ej: 'tickets_cerrados'
  valor       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO whaticket_sync (clave, valor)
VALUES ('tickets_cerrados', jsonb_build_object('desde', now()))
ON CONFLICT (clave) DO NOTHING;
-- Arranca desde "ahora": no genera borradores de chats viejos.


-- ====================================================================
-- 5. RLS
-- ====================================================================
ALTER TABLE whaticket_usuarios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE whaticket_contactos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultas_borradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE whaticket_sync       ENABLE ROW LEVEL SECURITY;

-- Usuarios: todo el equipo lee; se editan desde el SQL Editor.
DROP POLICY IF EXISTS "team_read_whaticket_usuarios" ON whaticket_usuarios;
CREATE POLICY "team_read_whaticket_usuarios" ON whaticket_usuarios
  FOR SELECT TO authenticated USING (is_team_member());

-- Contactos: el equipo lee y vincula (al elegir cliente en un borrador).
DROP POLICY IF EXISTS "team_all_whaticket_contactos" ON whaticket_contactos;
CREATE POLICY "team_all_whaticket_contactos" ON whaticket_contactos
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

-- Borradores: cada asesor ve y actualiza SOLO los suyos.
-- El coordinador ve y actualiza todos (incluidos los sin asignar).
-- Nadie inserta ni borra desde la app: eso lo hace la Edge Function.
DROP POLICY IF EXISTS "borradores_select_propios" ON consultas_borradores;
CREATE POLICY "borradores_select_propios" ON consultas_borradores
  FOR SELECT TO authenticated
  USING (
    is_team_member()
    AND (asesor_email = (auth.jwt() ->> 'email') OR is_coordinador())
  );

DROP POLICY IF EXISTS "borradores_update_propios" ON consultas_borradores;
CREATE POLICY "borradores_update_propios" ON consultas_borradores
  FOR UPDATE TO authenticated
  USING (
    is_team_member()
    AND (asesor_email = (auth.jwt() ->> 'email') OR is_coordinador())
  )
  WITH CHECK (is_team_member());
  -- El WITH CHECK permite "Reasignar" a otro asesor.

-- whaticket_sync: sin políticas → la app no la ve. Solo service role.


-- ====================================================================
-- 6. Realtime (el contador "Por registrar" se actualiza solo)
-- ====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'consultas_borradores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE consultas_borradores;
  END IF;
END $$;


-- ====================================================================
-- Verificación
-- ====================================================================
SELECT 'whaticket_usuarios'   AS tabla, COUNT(*) FROM whaticket_usuarios
UNION ALL
SELECT 'whaticket_contactos',  COUNT(*) FROM whaticket_contactos
UNION ALL
SELECT 'consultas_borradores', COUNT(*) FROM consultas_borradores
UNION ALL
SELECT 'whaticket_sync',       COUNT(*) FROM whaticket_sync;
-- Esperado: 0, 0, 0, 1
