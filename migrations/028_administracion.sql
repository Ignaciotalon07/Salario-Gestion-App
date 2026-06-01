-- 028_administracion.sql
-- Tabla facturas para el panel de administración de Daniel Ferro.
-- Cada fila representa la factura de un cliente en un mes/año dado.
-- Al subir un PDF, el estado pasa a 'pagada'.

CREATE TABLE IF NOT EXISTS facturas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  mes              INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio             INT NOT NULL,
  fecha_facturacion DATE,
  fecha_proxima     DATE,
  monto            NUMERIC(10,2),
  estado           TEXT NOT NULL DEFAULT 'pendiente',
  pdf_url          TEXT,
  pdf_path         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cliente_id, mes, anio)
);

ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY facturas_all ON facturas FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());

-- Storage bucket para los PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas', 'facturas', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "facturas_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'facturas' AND is_team_member());

CREATE POLICY "facturas_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'facturas' AND is_team_member());

CREATE POLICY "facturas_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'facturas' AND is_team_member());
