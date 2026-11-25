-- 089_portal_empresa_a_ficha.sql
-- Cuando el cliente completa (o edita) los datos de su empresa PRINCIPAL en el portal,
-- se copian solos a su ficha en Gestión (clientes.razon_social y clientes.cuit).
-- Así el equipo no carga nada dos veces. Idempotente.

CREATE OR REPLACE FUNCTION cliente_empresa_principal_a_ficha()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.es_principal THEN
    UPDATE clientes
       SET razon_social = coalesce(nullif(btrim(NEW.razon_social), ''), razon_social),
           cuit         = coalesce(nullif(regexp_replace(coalesce(NEW.cuit, ''), '[^0-9]', '', 'g'), ''), cuit)
     WHERE id = NEW.cliente_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_empresa_principal_a_ficha ON cliente_empresas;
CREATE TRIGGER trg_empresa_principal_a_ficha
  AFTER INSERT OR UPDATE ON cliente_empresas
  FOR EACH ROW EXECUTE FUNCTION cliente_empresa_principal_a_ficha();
