-- 076_portal_empresas.sql
-- PORTAL DE CLIENTES — "Información requerida", paso 1: fichas de empresa.
--
-- Un cliente tiene SU empresa (es_principal = true, una sola) y, si es un estudio contable,
-- puede sumar OTRAS empresas (es_principal = false). Cada empresa tiene los datos de la
-- sección 1 del Word "Información requerida para implementación" y sus propios archivos
-- (logo, firma, sello, PDF de liquidaciones, Excel de control: se guardan en
-- cliente_documentos, que ahora se vincula a la empresa con empresa_id).
--
-- Permisos:
--   · Equipo: todo.
--   · Cliente (usuario del portal): ve, carga y edita las empresas de SU cliente; puede borrar
--     las que no son la principal. Nunca toca las de otro cliente (portal_cliente_id()).
-- Idempotente.

-- ── 1. Tabla ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cliente_empresas (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  es_principal        boolean     NOT NULL DEFAULT false,
  razon_social        text        NOT NULL,
  cuit                text,
  domicilio           text,       -- para el encabezado de los recibos
  tipo_empleador      text,
  obra_social         text,       -- obra social general (código y nombre)
  art                 text,       -- nombre de la ART
  actividad_principal text,       -- código AFIP y descripción
  convenios           text,       -- convenios, separados por coma
  cant_legajos        integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  actualizado_por     text
);

CREATE INDEX IF NOT EXISTS idx_cliente_empresas_cliente ON cliente_empresas (cliente_id);
-- Una sola empresa principal por cliente
CREATE UNIQUE INDEX IF NOT EXISTS uq_cliente_empresa_principal
  ON cliente_empresas (cliente_id) WHERE es_principal;

CREATE OR REPLACE FUNCTION cliente_empresas_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  -- Quién la tocó por última vez: el cliente (portal) o el integrante del equipo
  NEW.actualizado_por := CASE WHEN is_team_member()
                              THEN coalesce(auth.jwt() ->> 'email', 'equipo')
                              ELSE 'Cliente (portal)' END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cliente_empresas_touch ON cliente_empresas;
CREATE TRIGGER trg_cliente_empresas_touch
  BEFORE INSERT OR UPDATE ON cliente_empresas
  FOR EACH ROW EXECUTE FUNCTION cliente_empresas_touch();

-- ── 2. RLS ───────────────────────────────────────────────────────────
ALTER TABLE cliente_empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipo gestiona cliente_empresas" ON cliente_empresas;
CREATE POLICY "equipo gestiona cliente_empresas" ON cliente_empresas
  FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

DROP POLICY IF EXISTS "cliente ve sus empresas" ON cliente_empresas;
CREATE POLICY "cliente ve sus empresas" ON cliente_empresas
  FOR SELECT TO authenticated
  USING (cliente_id = portal_cliente_id());

DROP POLICY IF EXISTS "cliente carga sus empresas" ON cliente_empresas;
CREATE POLICY "cliente carga sus empresas" ON cliente_empresas
  FOR INSERT TO authenticated
  WITH CHECK (cliente_id = portal_cliente_id());

DROP POLICY IF EXISTS "cliente edita sus empresas" ON cliente_empresas;
CREATE POLICY "cliente edita sus empresas" ON cliente_empresas
  FOR UPDATE TO authenticated
  USING (cliente_id = portal_cliente_id())
  WITH CHECK (cliente_id = portal_cliente_id());

-- Puede borrar las empresas que sumó, nunca la principal
DROP POLICY IF EXISTS "cliente borra sus empresas" ON cliente_empresas;
CREATE POLICY "cliente borra sus empresas" ON cliente_empresas
  FOR DELETE TO authenticated
  USING (cliente_id = portal_cliente_id() AND es_principal = false);

-- Realtime para que el equipo vea los cambios al instante
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cliente_empresas;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Documentos vinculados a la empresa ────────────────────────────
-- Si se borra la empresa, los archivos quedan (sin empresa) para no perderlos.
ALTER TABLE cliente_documentos
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES cliente_empresas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cliente_documentos_empresa_id ON cliente_documentos (empresa_id);

-- El cliente solo puede vincular un archivo a una empresa de SU cliente
DROP POLICY IF EXISTS "cliente sube documentos" ON cliente_documentos;
CREATE POLICY "cliente sube documentos" ON cliente_documentos
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id = portal_cliente_id() AND origen = 'cliente' AND subido_por_user = auth.uid()
    AND (empresa_id IS NULL OR EXISTS (
          SELECT 1 FROM cliente_empresas e
          WHERE e.id = empresa_id AND e.cliente_id = portal_cliente_id()))
  );
