-- 093_relevamiento_porcentajes.sql
-- La pregunta "Personal mensual y quincenal" pasa a pedir DOS porcentajes (por mes / por quincena).
-- Usa el tipo 'dual_texto' (columnas mensuales = por mes, jornales = por quincena). Idempotente.
-- Si algún cliente ya la había respondido como texto libre, queda pendiente de responder de nuevo.
UPDATE relevamiento_preguntas
   SET tipo = 'dual_texto'
 WHERE clave = 's3_personal_mensual_y_quincenal';

-- Verificación: debe devolver 1 fila con tipo = dual_texto
SELECT clave, tipo FROM relevamiento_preguntas WHERE clave = 's3_personal_mensual_y_quincenal';
