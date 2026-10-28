# Contexto para Claude

Este archivo te da contexto sobre el proyecto, las decisiones tomadas, y las
convenciones para que puedas seguir desarrollando sin que el usuario tenga
que re-explicarte todo desde cero.

---

## El proyecto

**Salario — Gestión de Clientes** es una herramienta web interna para el
equipo que da implementación + soporte del software de liquidación de
sueldos "Salario" (Argentina). El equipo son 6 personas: Ignacio (impl +
soporte), Matías (impl + soporte), Daniel (soporte), Daniel Ferro
(comercial), Renzo (soporte), Alfred (programación).

Atienden 200+ clientes vía WhatsApp / Whaticket. La app centraliza:

- Métricas y dashboard (Panel general)
- Clientes (CRM ligero con detalle por cliente)
- Registro de consultas + métricas avanzadas de consultas
- Pendientes con audit log
- Base de soluciones (knowledge base)
- **Implementación**: cronograma de 23 etapas por cliente nuevo, con
  Gantt visual, predecesoras, fechas calculadas, audit log, notas y archivos adjuntos.
  Tiene 3 pantallas: lista de clientes (cards), detalle de un cliente
  (pestañas Tareas / Documentos) y **Disponibilidad** (Gantt general con
  carga por mes, capacidad máxima y simulador de cliente nuevo)
- **Repositorio**: archivos y recursos compartidos por el programador,
  organizados por categoría, con asignación de pendientes al equipo
- Alertas dinámicas (vencimientos, clientes sin actividad, etc.)
- **Avisos llamativos** (sonido, parpadeo de pestaña, popup de viernes) y
  avisos en el Panel general ("X te ha generado un pendiente", novedades del
  Repositorio con "hace X min")
- Configuración (tema oscuro, plantilla editable)

## Stack

- **Frontend**: HTML + CSS + JavaScript vanilla. Sin frameworks, sin build,
  sin npm. La app es 100% estática.
- **Backend**: Supabase (Postgres + Auth + Realtime + RLS + Storage). Sin
  servidor propio, sin Edge Functions todavía.
- **Auth**: Google OAuth + Email/Password, restringido por tabla
  `team_members` con función `is_team_member()` SECURITY DEFINER.
- **Persistencia**: todo va a Supabase via SDK `@supabase/supabase-js@2`
  (importado por CDN en `index.html`).
- **Realtime**: cada cambio (pendiente, tarea, nota, repositorio) se propaga
  al instante a todos los miembros del equipo.
- **Storage**: Supabase Storage para archivos adjuntos. Límite de 50 MB por
  archivo (plan free). Buckets: `implementacion-archivos`, `soluciones-archivos`,
  `repositorio-archivos`, `cliente-documentos`.

## Estructura

```
Salario Gestion/
├── index.html               ← Markup principal (single page, secciones con id)
├── README.md                ← Doc para usuarios
├── CLAUDE.md                ← Este archivo (contexto para Claude)
├── css/styles.css           ← Todos los estilos
├── js/
│   ├── config.js            ← URL + publishable key de Supabase (público OK)
│   ├── supabase-client.js   ← Wrappers sb(), dbList, dbInsert, dbUpdate, dbDelete
│   ├── auth.js              ← Login, signin/out, isTeamMember
│   ├── data.js              ← Constantes (CATS, CLIENTES_LOOKUP, TIPO_LABELS)
│   ├── storage.js           ← Wrapper de localStorage (legacy, casi sin uso)
│   ├── ui.js                ← toast(), tema oscuro, navegación config
│   ├── nav.js               ← goTo() para cambiar de página + marcarRepositorioVisto()
│   ├── clientes.js          ← CRUD + realtime de clientes
│   ├── cliente-detalle.js   ← Vista de historial, stats y mini chart por cliente
│   ├── pendientes.js        ← CRUD + realtime + notas + audit log + modal solución
│   ├── pendiente-archivos.js ← Archivos adjuntos en pendientes (form + tarjeta; bucket `pendientes-archivos`, migración 065)
│   ├── consultas.js         ← Form de registrar consulta (Supabase + realtime)
│   ├── consultas-page.js    ← Métricas avanzadas de consultas (rankings, historial, gráficos)
│   ├── kb.js                ← Base de soluciones (Supabase + realtime + archivos adjuntos)
│   ├── implementacion.js    ← 23 etapas, Gantt, propagación, plantilla, métricas, archivos,
│   │                           pantallas lista/detalle, accesos (barra segmentada), botón + panel
│   │                           lateral "Mi día"
│   ├── implementacion-disponibilidad.js ← Gantt general: carga por mes, capacidad máx., zoom,
│   │                           simulador, barras grises "por arrancar", pan con arrastre
│   ├── disponibilidad-reporte.js ← Botón "📄 Reporte PDF" de Disponibilidad: dónde entra un cliente nuevo, dónde no y por qué (usa los mismos cálculos del Gantt)
│   ├── cliente-documentos.js ← Pestaña Documentos por cliente (archivos + links de Drive,
│   │                           tipo de documento, buscador, leyenda)
│   ├── proyectos.js         ← Implementación → Proyectos: lista, alta, detalle con tareas, % avance (cambios puntuales para clientes de soporte)
│   ├── proyecto-documentos.js ← Vista "Documentos" del detalle de un proyecto (archivos + links de Drive)
│   ├── conexiones.js        ← Conexiones del cliente (tarjeta + modal)
│   ├── reporte-implementacion.js ← Reporte semanal de implementación
│   ├── asesor-detalle.js    ← Detalle de cada asesor (sección Equipo)
│   ├── equipo-ausencias.js  ← Calendario de ausencias + formulario (sección Equipo)
│   ├── hitos.js             ← Celebraciones por hitos de registros
│   ├── reportes.js          ← Sección Reportes (período: mes / mes específico / trimestre / año; comparación con el período anterior)
│   ├── consultas-reporte.js ← Botón "📄 Reporte PDF" de la sección Consultas: informe con resumen, evolución, quiénes más consultan, qué consultan, quiénes consumen más tiempo, material y conexión remota (gráficos de barras dibujados en el PDF)
│   ├── saludo.js            ← Saludo + cartelito + "Tu día" + tiles/campanita del Panel general
│   ├── avisos.js            ← Sonido (Web Audio), parpadeo de título, popup de viernes,
│   │                           avisos de pendientes asignados por otros
│   ├── borradores.js        ← "Por registrar": borradores de Whaticket (lista, chat, registrar, descartar)
│   ├── repositorio.js       ← Repositorio de archivos del programador + badge por usuario
│   ├── alertas.js           ← Alertas dinámicas (vencimientos, inactividad, etc.)
│   └── charts.js            ← Chart.js para el panel general
└── migrations/
    ├── 001_schema.sql              ← Tablas base (clientes, pendientes, soluciones, consultas)
    ├── 002_rls.sql                 ← RLS policies
    ├── 003_seed.sql                ← Seed inicial
    ├── 004_team_whitelist.sql      ← Tabla team_members + is_team_member()
    ├── 005_notas.sql               ← Notas en pendientes
    ├── 006_tipo_pendiente.sql      ← Tipo de pendiente (soporte, impl, etc.)
    ├── 007_vencimientos.sql        ← Fecha de vencimiento en pendientes
    ├── 008_audit_log.sql           ← Audit log de cambios en pendientes
    ├── 009_telefono.sql            ← Teléfono en clientes
    ├── 010_realtime_clientes.sql   ← Habilitar realtime para clientes
    ├── 011_telefono_clientes.sql   ← Migración telefono
    ├── 012_whaticket_clientes.sql  ← URL de Whaticket por cliente
    ├── 013_soluciones.sql          ← Tabla soluciones KB
    ├── 014_implementacion.sql      ← Tablas implementacion_plantilla + implementacion_tareas
    ├── 015_implementacion_pendientes.sql ← Vinculación tarea ↔ pendiente
    ├── 016_implementacion_tarea_notas.sql ← Notas por tarea
    ├── 017_implementacion_audit.sql ← Audit log de tareas
    ├── 018_gantt.sql               ← duracion_dias, predecesoras, fecha_inicio
    ├── 019_fecha_fin_objetivo.sql  ← Objetivo de fin (deadline) por cliente
    ├── 020_consultas.sql           ← FK solucion_id en consultas
    ├── 021_reset_scores.sql        ← Reset score de clientes (ahora se calcula automático)
    ├── 022_pendiente_interno.sql   ← Columna "interno" en pendientes (no genera consulta)
    ├── 023_consultas_tiempo.sql    ← Columna tiempo_resolucion en consultas (horas)
    ├── 024_rls_plantilla_write.sql ← RLS write en implementacion_plantilla
    ├── 025_plantillas_por_tipo.sql ← Columna "tipo" en plantilla (empresa/estudio/colegio/municipalidad)
    ├── 026_consultas_material_remota.sql ← Columnas material y conexion_remota en consultas
    ├── 027_seed_clientes_reales.sql ← 89 clientes reales (reemplaza seed de prueba)
    ├── 028_administracion.sql      ← Tabla facturas (módulo eliminado, tabla legacy)
    ├── 029_consultas_tipo.sql      ← Columna tipo_consulta en consultas (soporte/programacion/comercial)
    ├── 030_implementacion_archivos.sql ← Archivos adjuntos a tareas de implementación
    ├── 031_soluciones_archivos.sql ← Archivos adjuntos a soluciones KB
    ├── 032_repositorio.sql         ← Tablas repositorio_items + repositorio_archivos
    ├── 033_repositorio_visto.sql   ← Último acceso por usuario al repositorio (badge "nuevo")
    ├── 034_*  035_*  036_*         ← Hay varios archivos con el mismo número (recalculo_masivo,
    │                                 tipo_pendiente_internos, limpiar_pendientes_aivel_bloqueados,
    │                                 repositorio_editado_por, programacion_interna,
    │                                 repositorio_categorias, implementacion_consulta,
    │                                 consultas_tipo_implementacion, repositorio_extras).
    │                                 Todos son idempotentes; no renumerar.
    ├── 037_clientes_id_api.sql     ← id_api de Salario en clientes
    ├── 038_soluciones_votos.sql    ← Votos en la KB
    ├── 040_normalizar_categorias_consultas.sql
    ├── 041_hitos_consultas.sql
    ├── 042_repositorio_categoria_launcher.sql
    ├── 043_impl_sin_predecesoras.sql
    ├── 044_cliente_conexiones.sql
    ├── 045_cliente_documentos.sql  ← Tabla + bucket `cliente-documentos` (crear a mano, privado)
    ├── 046_cliente_documentos_links.sql ← Links de Google Drive en documentos
    ├── 047_cliente_documentos_categorias.sql ← Tipo de documento (logo, firma, pdf, etc.)
    ├── 048_impl_estructuracion.sql ← Tabla impl_estructuracion (tareas internas del equipo, sección 8d)
    ├── 049_impl_estructuracion_detalle.sql ← Campo opcional "detalle" en esas tareas
    ├── 050_equipo_ausencias.sql    ← Tabla equipo_ausencias (vacaciones/licencias; todos ven, cada uno edita las suyas)
    ├── 051_whaticket_borradores.sql ← Integración Whaticket: borradores "Por registrar" (ver docs/integracion-whaticket.md)
    ├── 052_whaticket_cron.sql      ← Programa whaticket-sync cada 2 min (NO guardar la key en el repo)
    ├── 053_consultas_contacto.sql  ← Columna contacto en consultas (quién del cliente consultó)
    ├── 054_borradores_ia.sql       ← solucion_sugerida + ia_generado en borradores (resumen con IA; secreto ANTHROPIC_API_KEY)
    ├── 055_borradores_por_asesor.sql ← Un borrador abierto por ticket y por asesor (el que cierra el chat es el dueño)
    ├── 056_borradores_categoria.sql ← categoria_sugerida + subtema_sugerido en borradores (los elige la IA)
    ├── 057_borrador_por_cierre.sql ← Un borrador por cada cierre de chat (reemplaza el índice de 055)
    ├── 058_borradores_material.sql ← material_sugerido en borradores (video/pdf/varios/ninguno, según adjuntos del asesor)
    ├── 059_salario_sync.sql        ← Tabla salario_sync: legajos/convenios/empresas por cliente que manda Salario (VFP) vía Edge Function `salario-api`
    ├── 060_proyectos.sql           ← Tablas proyectos + proyecto_tareas (Implementación → Proyectos; RLS y realtime)
    ├── 061_proyecto_documentos.sql ← Tabla proyecto_documentos (archivos + links de Drive por proyecto; usa el bucket cliente-documentos)
    ├── 062_salario_sync_bases.sql  ← Columna `base` en salario_sync: un cliente puede tener varias bases en Salario (ej. DATOS1/DATOS2 o el nombre de la empresa); clave única (cliente_id, base)
    ├── 063_salario_envios_rechazados.sql ← Tabla salario_envios_rechazados: envíos de Salario sin id_api válido (ej. id_api 0); la función los registra y Alertas los muestra con "Marcar resuelto"
    ├── 064_prioridades_pendientes.sql ← Prioridades nuevas: muy_urgente (24h) / prioritario (72h) / semana (10d) / mes (30d) / cuando_se_pueda (60d) / sin_tiempo (90d). Convierte alta→muy_urgente, media→semana, baja→cuando_se_pueda. Vencimiento = plazo de la prioridad (`PRIORIDADES` y `vencimientoInfo(p)` en pendientes.js); "por vencer" al 75%
    ├── 065_pendiente_archivos.sql  ← Tabla pendiente_archivos + policies del bucket `pendientes-archivos` (crear a mano, privado)
    ├── 066_pendiente_archivos_consulta.sql ← Columna consulta_id en pendiente_archivos: al cerrar el pendiente, sus archivos se vinculan a la consulta y se ven en el detalle de consulta del cliente
    ├── 067_normalizar_nombres_cliente.sql ← Iguala cliente_nombre de consultas/pendientes al nombre real del cliente (había nombres con espacio doble que option.text colapsaba)
    └── schema_completo.sql         ← Todo junto para levantar desde cero (sección 8c = documentos)
```

## Convenciones

### JavaScript

- Vanilla JS. Cero dependencias en `package.json` (no hay npm).
- Globals: cada módulo expone funciones que se llaman desde `onclick` en HTML.
- Patrón: cada sección tiene `init<Seccion>()` llamada por
  `window.addEventListener('app-ready', ...)` después del login.
- Variables globales tipo `clientes`, `pendientes`, `soluciones`,
  `implTareas`, `repoItems` — todas se cargan al init y se mantienen sync
  via realtime.
- DB helpers: `dbList`, `dbInsert`, `dbUpdate`, `dbDelete` en
  `supabase-client.js`. Devuelven promises.
- Mapeo DB ↔ UI: cada módulo tiene `dbRowToX(row)` que convierte snake_case
  de la DB a camelCase para la UI.
- Sanitización de filenames para Storage: normalizar NFD, quitar diacríticos,
  reemplazar caracteres no ASCII por `_`. Siempre hacer esto antes de subir.

### CSS

- Variables CSS para colores en `:root`. Tema oscuro via
  `[data-theme="dark"]` en `<html>`.
- BEM-ish para componentes complejos (ej: `.impl-cliente-card__icon`).
- Mobile-first no estricto, pero hay media queries `(max-width: 900px)` y
  `(max-width: 480px)`.
- No usar emojis dentro del CSS. Sí en JS (en strings de UI).
- Modales: patrón `.kb-modal--open` sobre un overlay con clase `.kb-modal-overlay`
  (usado en KB, Repositorio y Registrar Consulta).

### Supabase

- Toda nueva tabla necesita: schema, RLS, realtime (si aplica), seed
  (si aplica), backfill (si afecta datos existentes).
- Las migrations son **idempotentes** (`IF NOT EXISTS`, `ON CONFLICT DO
  NOTHING`, `DROP POLICY IF EXISTS ...`).
- Función helper `is_team_member()` es SECURITY DEFINER y devuelve true si
  el usuario está en `team_members` con `activo = true`.
- Política estándar: `CREATE POLICY x ON tabla FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());`
- Storage: límite de 50 MB por archivo en plan free. Validar client-side
  antes de subir y sugerir WinRAR si supera el límite.

### Convenciones del usuario

- El usuario habla español rioplatense (Argentina). Sus instrucciones
  pueden ser informales — interpretá con sentido común.
- Le gusta el código comentado en español, no inglés.
- Le gusta ver el avance dividido en pasos chicos con confirmación entre
  cada uno.
- Si una funcionalidad requiere correr SQL en Supabase, **siempre avisarle
  explícitamente** qué migración corre y dónde. No asumir que ya lo hizo.

## Decisiones de diseño importantes

0. **Implementación → Soporte es AUTOMÁTICO**: cuando se completan todas las
   tareas de implementación, el cliente pasa solo de `impl` a `soporte` y queda
   en la sección "Implementaciones finalizadas". No hace falta (ni se va a
   hacer) un botón manual "Mover a soporte".

0b. **Formulario "Nuevo cliente" (resuelto)**: pide nombre, CUIT, razón social,
   tipo, área, link de WhatsApp (Whaticket) y una nota/detalle opcional. Ya no
   pide autonomía (se guarda 'media' por defecto).

1. **Permisos**: solo el asesor asignado a un pendiente/tarea puede
   modificar su estado o reasignarlo. Los demás pueden ver y agregar notas.
   Si no hay asesor asignado, cualquiera puede tomarlo.

2. **Predecesoras**: "X es predecesora de Y" significa "X termina antes
   que arranque Y". El modal de predecesoras dice claramente: "Tildá las
   tareas que tienen que terminar antes de que arranque esta."

3. **Propagación del Gantt (forward pass)**:
   - `fecha_inicio` de tarea = `max(fecha_completada || fecha_estimada de
     predecesoras) + 1 día`. Si no hay predecesoras, usa
     `cliente.fecha_inicio_implementacion`.
   - `fecha_estimada` (fin) = `fecha_inicio + duracion_dias - 1 día`
     (ej: 1 día arranca y termina el mismo día).
   - Se recalcula al cambiar: estado de tarea (a/desde completada),
     duración, predecesoras, fecha de inicio del proyecto.

4. **Vinculación tarea ↔ pendiente**: cuando asignás un asesor a una
   tarea de implementación, se crea automáticamente un pendiente para
   esa persona. Si reasignás, se cierra el pendiente viejo y se crea uno
   nuevo. Si marcás la tarea completa, el pendiente se cierra. Y vice versa.

5. **Modal "¿Qué solución usaste?"** aparece al cerrar pendiente de
   tipo soporte/bug/comercial — NO aparece para tipo `implementacion` ni
   `repositorio` (se cierran directo).

6. **Vista Lista vs Gantt en Implementación**: el toggle es **por cliente**
   (no global). Estado en memoria, no persiste a reload.

7. **Indicador visual en tareas de implementación**: si una tarea tiene
   notas o archivos adjuntos, muestra un ícono 📝 con un punto amarillo.
   Un solo ícono para ambos tipos de contenido.

8. **Modal de registrar consulta**: se cierra **solo** con el botón X.
   Click fuera del modal no lo cierra.

9. **Nueva solución (KB)**: formulario en modal centrado (overlay), no
   inline. Se abre con `showKbForm()` y se cierra con `cerrarKbForm()`.
   El campo "Quién la carga" fue eliminado — se toma automáticamente del
   usuario logueado. El "Revisar en" tiene opción "Sin revisión".

10. **Repositorio — badge por usuario**: cada miembro del equipo ve un
    contador naranja en el nav con los items nuevos desde su último acceso.
    Al entrar a la sección, el contador se resetea. Estado guardado en tabla
    `repositorio_visto`. Los items nuevos muestran etiqueta "Nuevo" en la card.
    No hay botón "Marcar revisado" — el acceso a la sección marca automáticamente.

11. **Repositorio — buscador**: campo de texto en la misma fila que los
    filtros de categoría, a la izquierda. Filtra por título y descripción
    en tiempo real. Se combina con el filtro de categoría activo.

12. **Sección Facturación eliminada**: el módulo de administración/facturación
    de Daniel Ferro fue eliminado completamente (nav, página, script). La
    tabla `facturas` en Supabase existe como legacy pero no se usa.

13. **Implementación — 3 pantallas** dentro de `#implementacion`:
    `#impl-lista-view` (cards de clientes), `#impl-disp-view` (Disponibilidad)
    y `#impl-detalle-view` (un cliente, a pantalla completa). Estado en
    `window._implClienteAbierto`, `_implDispAbierta`, `_implVolverADisp`,
    `_implTab` ('tareas' | 'documentos'). `renderImplementacion()` alterna
    vistas y llama a `renderImplNav()`. Los filtros de tareas viven en un nodo
    que se mueve entre `#impl-filtros-holder` y el slot del detalle en cada render.
    Navegación entre secciones: **barra segmentada a todo el ancho** arriba
    (Clientes / Disponibilidad / Documentos / Feedback). Las dos últimas están
    deshabilitadas ("Pronto").

14. **Disponibilidad**: capacidad máxima de implementaciones simultáneas = **4**
    (`DISP_CAPACIDAD_DEFAULT`, editable y guardada en `localStorage`). El Gantt
    muestra solo clientes en curso (los finalizados no) y los "por arrancar" como
    barras grises. La barra no es clickeable, el nombre del cliente sí. Hay
    zoom (trimestre/semestre/año), simulador de cliente nuevo y arrastre para
    desplazar. "Cómo se usa" es un `<details>` colapsado.

14b. **Estructuración interna** (en Disponibilidad): trabajo del equipo que no
    es implementar un cliente (tipos: soporte, proyecto, mejora, capacitación).
    Tabla `impl_estructuracion` (nombre, tipo, fecha_inicio, fecha_fin, estado
    pendiente/en_curso/hecha). Se dibuja como la ÚLTIMA fila del Gantt (separada por una línea más marcada), en
    UNA sola barra de tonos apagados partida en tramos: cada tarea con su color, y
    donde coinciden fechas un tramo a rayas con "A + B" ("hecha" se ve atenuada). **Mientras haya al menos una tarea
    no hecha en un día, ocupa 1 lugar de la capacidad** (`_dispCargaDia`), así
    la carga del mes, "próximo mes con lugar" y el simulador reflejan la
    disponibilidad real. Se cargan/editan en la sección debajo del Gantt
    (`_estructSeccionHtml`, `estructAbrirForm`). Realtime en la tabla.

15. **Mi día**: botón arriba a la derecha del header de Implementación (donde
    estaba "Plantillas") que abre un **panel lateral derecho** con animación.
    Muestra SOLO tareas de implementación asignadas al usuario, separadas por
    cliente (abiertas, en progreso, vencidas, esperan cliente). Para que una
    tarea aparezca hay que asignarla al asesor desde la pestaña Tareas.

16. **Sección Consultas = solo soporte**: `_cpTodas()` en `consultas-page.js`
    excluye `tipo_consulta` `programacion_interna` e `implementacion`. Las horas
    de implementación se guardan en `consultas` al cerrar un pendiente de
    implementación y SÍ cuentan en las métricas de **Equipo** (no tocar), pero
    no en la sección Consultas.

17. **`dbList` pagina de a 1000** (`supabase-client.js`): Supabase corta a 1000
    filas por pedido. Antes "Registros este año" se trababa en 1000. Usa
    `.order('id')` como desempate; toda tabla leída con `dbList` necesita `id`.

18. **Avisos llamativos** (`js/avisos.js`):
    - Sonido con Web Audio (sin archivos): `avisoSonido('mensaje' | 'alerta')`.
      Se silencia con `localStorage.avisos_silencio = '1'`. Si la pestaña no
      tuvo ningún clic, el navegador bloquea el audio: aparece un botón
      "Tocá acá para activar los sonidos".
    - Parpadeo del título de la pestaña: `avisoParpadearTitulo(texto, debeParar)`.
    - Repositorio: cuando OTRA persona sube/edita, suena y parpadea hasta
      entrar a la sección (hook en el realtime de `repositorio.js`).
    - Pendiente asignado/reasignado a mí: suena (+ parpadeo si la pestaña
      está oculta). Hook en `handlePendienteChange` de `pendientes.js`.
    - **Viernes 16:00+, solo Ignacio Talon y Matias Ferro**: popup grande con
      campana ("actualizá las tareas de Implementación y mandá los Gantt"),
      alarma que se repite cada 3,5 s mientras estés en otra pestaña, botones
      Ir / Ya lo hice / Recordarme en 30 min. Probar: `avisoViernesMostrar()`.

19. **Avisos en el Panel general**: tiles "novedades activas" (`prio: true` en
    `saludo.js`) van SIEMPRE primero. Son: item nuevo del Repositorio y
    "X te ha generado/reasignó un pendiente" (sale de `pendiente_eventos`
    tipos `creado`/`reasignado` de los últimos 3 días, ver
    `refrescarPendAsignados()` en `avisos.js`; no cuenta lo que creaste vos ni
    las tareas de impl auto-generadas, que no loguean evento). Muestran
    "hace X min/h/días" y parpadean 5 s al aparecer. Desaparecen al entrar a
    Repositorio / Pendientes (o con el botón "Ver pendiente →").

20. **Probar con 2 usuarios**: dos cuentas en el MISMO navegador comparten la
    sesión de Supabase y ambas pestañas pasan a ser el último usuario logueado
    (los avisos "de otro" se filtran como propios). Usar ventana de incógnito
    o dos perfiles de Chrome.

21. **Gotchas de CSS ya sufridos**: reglas del tema oscuro con `#app-root` o
    `[data-theme]` pisan estilos → usar `!important` o prefijo `#id`. Las clases
    del detalle de cliente y del detalle de asesor se comparten → el banner está
    scopeado con `#cliente-detalle`. Siempre subir el `?v=` de CSS/JS en
    `index.html` al cambiarlos (cache).

22. **Proyectos** (pestaña entre Clientes y Disponibilidad de Implementación; `js/proyectos.js`,
    migración 060): trabajos puntuales para clientes que YA son de soporte (cambios que pidieron).
    Tablas `proyectos` + `proyecto_tareas`. Un cliente tiene UN proyecto `en_curso` a la vez (índice
    único parcial); si pide más cosas, se le suman tareas a ese. Tareas SIN predecesoras: cada una tiene
    duración (días), fecha de inicio y fin (= inicio + duración − 1), responsable y estado
    (pendiente/en curso/completa). Avance % = tareas completas / total. Fin del proyecto = última fecha
    de sus tareas (si no hay tareas, la fecha objetivo). El estado se calcula solo: con todas las tareas completas pasa a `finalizado` (deja de ocupar lugar); si se agrega o se destilda una tarea, vuelve a `en_curso` (`_proySincronizar`). No hay botón manual de finalizar. **Disponibilidad**:
    `_dispProyectoItems()` suma cada proyecto como un item más (ocupa 1 lugar de la capacidad entre
    su inicio y su fin, y es una fila 🧩 del Gantt). Estructuración interna queda aparte.
    Detalle con vistas Lista / Gantt (`_proyGanttHtml`, escala día/mes/año) / Documentos (`js/proyecto-documentos.js`, migración 061). Alertas en el Panel general (`proyAvisosPanel`): atrasado, estancado, terminado y mes sin capacidad; se marcan vistos con `ausAvisoMarcarVisto`.

## Login y usuarios

Hay 6 cuentas en `team_members` (tabla en Supabase):
- ignaciotalon07@gmail.com (Google OAuth)
- matias@salario.local (password)
- daniel@salario.local (password)
- danielferro@salario.local (password)
- renzo@salario.local (password)
- Alfredo.Cesar@consultoraferro.com.ar (password)

Password por defecto para los 5 emails con dominio salario.local: `123456`
(cambiar en producción).

## Workflow con Claude

Cuando el usuario te pida cambios:

1. Si necesitás contexto sobre el estado actual, leé los archivos antes
   de proponer cambios.
2. Si la tarea es chica (un fix, un estilo), implementala directo.
3. Si es grande (nueva feature), proponé el plan en 3-5 pasos antes de
   codear.
4. Si requiere migración SQL, escribila idempotente y avisale al usuario
   que tiene que correrla en Supabase SQL Editor.
5. Si hay decisiones de UX, mostrale opciones (no decidas por él).
6. Al final, decile qué probar y qué resultado esperar.

## Cosas que NO están terminadas

- **Integración Whaticket "Por registrar"** (EN CURSO, probar con el equipo): plan en
  `docs/integracion-whaticket.md`. HECHO: migraciones 051 (borradores), 052 (cron, plantilla sin key),
  053 (columna `consultas.contacto`); Edge Function `supabase/functions/whaticket-sync` (corre cada 2 min;
  `{"accion":"vincular_clientes"}` vincula clientes↔contactos por `clientes.whaticket_url`);
  UI `js/borradores.js` (ítem de menú "Por registrar" con badge, lista, panel de chat al costado del
  modal "Registrar consulta", Descartar, tile en Panel general; hook en `guardarConsulta()` →
  `borradorMarcarRegistrado`). Campo "¿Quién consultó?" (`contacto`) en el form e historial del cliente.
  PENDIENTE: piloto con 2 asesores; Dividir/Reasignar; rol `coordinador`; ítem en menú mobile;
  Etapa 2 IA y Etapa 3 audios; repo público (pasar a privado, ver doc §9).
  PENDIENTE: **revisar el tiempo sugerido de consultas** (`tiempoActivoHoras` en
  `whaticket-sync/index.ts`). Hoy solo suma pausas < 15 min (+ tramo AnyDesk), así que cuando el
  asesor trabaja un rato largo sin escribir (ej. "debo revisarlo" → vuelve 68 min después) el tiempo
  sale corto (caso Fernanda–Sudossilo: 10 min). Idea: si el asesor promete ("debo revisarlo", "apenas
  tenga", "te lo paso", "ya te aviso") y después responde él, contar ese hueco con tope (30–45 min).

- **Dominio propio** (PENDIENTE, decidido posponer): pasar de
  `https://ignaciotalon07.github.io/Salario-Gestion-App/` a
  `https://www.salariogestion.com.ar`. En el código no hay que cambiar nada
  (no hay URLs hardcodeadas; el login usa `window.location.origin`). Pasos, en
  orden: 0) backup (commit + tag `respaldo-antes-dominio`); 1) comprar el
  dominio en nic.ar; 2) DNS: CNAME `www` → `ignaciotalon07.github.io`;
  3) ANTES de activar en GitHub, sumar el dominio nuevo en Supabase (Auth → URL
  Configuration → Redirect URLs) y en Google Cloud (OAuth → Authorized
  JavaScript origins), sin quitar los viejos; 4) GitHub → Settings → Pages →
  Custom domain + Enforce HTTPS; 5) recién ahí cambiar el Site URL de Supabase;
  6) probar login en incógnito. Si falla: borrar el Custom domain en GitHub.
- **Ausencias del equipo / cobertura** (HECHO, queda mantenimiento). Migración 050 +
  `js/equipo-ausencias.js`. Sección Equipo con 3 pestañas (`eqTab()`): Asesores / Ausencias /
  Áreas. Ausencias = calendario de 12 meses, un color por asesor, feriados AR en `AUS_FERIADOS`
  (2026 y 2027; **sumar los puentes turísticos 2027 cuando salga el decreto**), formulario con
  fecha de inicio + cantidad de días (sin medio día). Áreas = tarjeta por mes con estado
  Normal/Regular/Crítico por área (Soporte 2, Implementación 2, Programación Salario 1 = Alfredo,
  Comercial 1 = Daniel Ferro; estas dos quedan en rojo si falta su persona y NO generan alerta de
  "atender"). Reglas: si falta alguien de Soporte baja UN implementador a cubrir; de Soporte NO
  suben a Implementación; Alfredo (Impl) y Daniel Ferro (Soporte) son refuerzos sugeridos, no se
  cuentan solos. `ausCoberturaDia(iso)` es la fuente de verdad. Alertas: badge naranja en la
  pestaña Áreas + puntitos (sin límite de cercanía, solo Soporte/Impl); Panel general: salidas
  14 días antes (a los demás: desaparece al abrir, vuelve al día siguiente; al que la cargó:
  cartel motivacional distinto por día, persiste) y "En N días hay que atender X" a 15 días
  (desaparece al abrir). **Disponibilidad**: la capacidad máxima (4) se escala por implementador
  disponible (`_dispCapDia`, `_dispMesInfo`); los meses con capacidad reducida muestran 🏖️ y hay un
  aviso arriba del Gantt; el simulador y "próximo mes con lugar" también la usan.
- **Portal de clientes** (IDEA, sin empezar; el usuario quiere pensarla): darle acceso a los
  clientes. Prioridad 1 = que los clientes en implementación entren y suban ellos mismos sus
  archivos (logos, firmas, documentos) en vez de cargarlos el equipo. Prioridad 2 (después) = que
  vean sus métricas. Notas: hoy `is_team_member()` da acceso total, así que haría falta un rol
  "cliente" aparte (tabla que vincule usuario ↔ cliente + RLS por cliente + Storage por cliente);
  conviene una página separada (`portal.html`) y no abrir la plataforma del equipo; reutilizaría
  la pestaña Documentos por cliente. A decidir antes: dominio propio (no dar URL de github.io a
  clientes), si el cliente solo sube o también ve/borra, cuántos usuarios por empresa, y el límite de
  almacenamiento del plan gratuito (50 MB por archivo). Es lo más delicado en seguridad: probar
  que un cliente nunca vea datos de otro.
- **U10**: Email digest diario (requiere Resend + Edge Function de cron).
- **Repositorio — links externos**: opción para agregar URL en lugar de
  archivo (útil para recursos que superan 50 MB). Discutido pero no
  implementado.
- **Implementación → Documentos**: la tarjeta de acceso está deshabilitada
  ("Pronto"). Ahí van a vivir las **Plantillas** de implementación. Mientras
  tanto el panel de plantillas existe en el HTML (`#plantillas-panel`,
  `togglePlantillasPanel()`) pero **no tiene botón que lo abra** (se sacó el
  botón del header). Habilitar Documentos o devolver el botón.
- **Implementación → Feedback**: tarjeta de acceso deshabilitada ("Pronto").
  Idea: encuesta post-implementación por cliente. Sin definir.
- **API de Salario** (Legajos, Convenios, Empresas en vivo): EN CURSO. Edge Function
  `supabase/functions/salario-api` (POST por cliente, auth con header `x-api-key` = secreto
  `SALARIO_API_KEY`, Verify JWT desactivado) → tabla `salario_sync` (migración 059; 062 agrega `base`: el programador manda un POST por base y la plataforma suma legajos y junta convenios/empresas, con desglose por base; bases de PRUEBA/TEST/DEMO se ignoran). El cliente se identifica por `id_api` (número de 4 cifras de Salario, único en `clientes`) o, alternativamente, `cliente_id` (uuid). Front: `js/salario-sync.js`
  carga + realtime; `_datosSalarioCliente()` en `js/cliente-detalle.js` lee de ahí. PENDIENTE: confirmar
  que se corrió 059, pegar la función, crear el secreto y que el programador de VFP mande el header y
  los campos `legajos`, `convenios`, `empresas`.
- Backlog viejo: búsqueda semántica en KB, PWA.

## Levantar la base de datos desde cero

1. En el dashboard de Supabase, crear los 5 buckets manualmente:
   Storage → New bucket → Private (no public)
   - `implementacion-archivos`
   - `soluciones-archivos`
   - `repositorio-archivos`
   - `cliente-documentos`
   - `pendientes-archivos`

2. En el SQL Editor de Supabase, correr en orden:
   - `migrations/schema_completo.sql` — toda la estructura + equipo + plantilla de impl
   - `migrations/027_seed_clientes_reales.sql` — los 89 clientes reales

Eso es todo. No hay más pasos.

## Configuración local para correr

1. Clonar el repo
2. Abrir una terminal en la carpeta y correr:
   ```bash
   python -m http.server 8000
   ```
3. Abrir http://localhost:8000
4. Login con cualquier cuenta del equipo

No hay nada que instalar (sin `npm install`).
