-- 049_impl_estructuracion_detalle.sql
-- Campo "detalle" (opcional) en las tareas de Estructuración interna, para
-- explayarse sobre qué implica cada tarea.

ALTER TABLE impl_estructuracion
  ADD COLUMN IF NOT EXISTS detalle text;
