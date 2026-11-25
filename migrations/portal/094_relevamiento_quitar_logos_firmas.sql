-- 094_relevamiento_quitar_logos_firmas.sql
-- Se quita del relevamiento la pregunta "Logos y firmas": el cliente ya los sube en el paso 4 de Preparación
-- (y los puede subir después desde Documentos). Se desactiva (activa = false) en lugar de borrarla: no se pierde
-- nada, deja de mostrarse, de contarse como pendiente y de bloquear la aprobación. Idempotente.
UPDATE relevamiento_preguntas
   SET activa = false
 WHERE clave = 's3_logos_y_firmas';

-- Verificación: debe devolver 1 fila con activa = false
SELECT clave, activa FROM relevamiento_preguntas WHERE clave = 's3_logos_y_firmas';
