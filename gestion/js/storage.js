// STORAGE
// Módulo legacy — las keys de localStorage ya no se usan para datos de la app.
// Todo (clientes, pendientes, consultas, soluciones) vive en Supabase.
//
// Las únicas cosas que siguen en localStorage son preferencias de UI:
//   - ui.js: salario.theme.<email>  (preferencia de tema oscuro por usuario)
//   - pendientes.js: salario.notif.asked  (flag de permiso de notificaciones)
//
// Este archivo se mantiene como referencia histórica pero sus funciones
// ya no son llamadas desde ningún módulo.
