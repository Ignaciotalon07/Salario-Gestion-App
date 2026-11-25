-- 092_relevamiento_texto_netos.sql
-- Corrige el texto de la pregunta "Importes netos" del relevamiento. Idempotente.
UPDATE relevamiento_preguntas
   SET consulta = 'Además del PDF, necesitamos el neto de cada empleado de ese mes. ¿Tenés un Excel con los netos o preferís que los tomemos del PDF?'
 WHERE clave = 's2_importes_netos';

-- Verificación: debe devolver 1 fila con el texto nuevo
SELECT clave, consulta FROM relevamiento_preguntas WHERE clave = 's2_importes_netos';
