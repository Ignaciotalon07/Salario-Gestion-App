-- 046_cliente_documentos_links.sql
-- Los documentos del cliente ahora pueden ser un LINK (ej: una carpeta de
-- Google Drive) en vez de un archivo subido a Storage.
--   · Archivo → storage_path con valor, url NULL
--   · Link    → url con valor, storage_path NULL

ALTER TABLE cliente_documentos
  ADD COLUMN IF NOT EXISTS url text;

ALTER TABLE cliente_documentos
  ALTER COLUMN storage_path DROP NOT NULL;
