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

- Métricas y dashboard
- Clientes (CRM ligero)
- Registro de consultas
- Pendientes con audit log
- Base de soluciones (knowledge base)
- **Implementación**: cronograma de 23 etapas por cliente nuevo, con
  Gantt visual, predecesoras, fechas calculadas, audit log, notas
- Configuración (tema oscuro, plantilla editable)

## Stack

- **Frontend**: HTML + CSS + JavaScript vanilla. Sin frameworks, sin build,
  sin npm. La app es 100% estática.
- **Backend**: Supabase (Postgres + Auth + Realtime + RLS). Sin servidor
  propio, sin Edge Functions todavía.
- **Auth**: Google OAuth + Email/Password, restringido por tabla
  `team_members` con función `is_team_member()` SECURITY DEFINER.
- **Persistencia**: todo va a Supabase via SDK `@supabase/supabase-js@2`
  (importado por CDN en `index.html`).
- **Realtime**: cada cambio (pendiente, tarea, nota) se propaga al instante
  a todos los miembros del equipo.

## Estructura

```
Salario Gestion/
├── index.html            ← Markup principal (single page, secciones con id)
├── README.md             ← Doc para usuarios
├── CLAUDE.md             ← Este archivo (contexto para Claude)
├── css/styles.css        ← Todos los estilos
├── js/
│   ├── config.js         ← URL + publishable key de Supabase (público OK)
│   ├── supabase-client.js ← Wrappers sb(), dbList, dbInsert, dbUpdate, dbDelete
│   ├── auth.js           ← Login, signin/out, isTeamMember
│   ├── data.js           ← Constantes (CATS, CLIENTES_LOOKUP, TIPO_LABELS)
│   ├── storage.js        ← Wrapper de localStorage (legacy, casi sin uso)
│   ├── ui.js             ← toast(), tema oscuro, navegación config
│   ├── nav.js            ← goTo() para cambiar de página
│   ├── clientes.js       ← CRUD + realtime de clientes
│   ├── pendientes.js     ← CRUD + realtime + notas + audit log + modal solución
│   ├── consultas.js      ← Form de registrar consulta (localStorage)
│   ├── kb.js             ← Base de soluciones (Supabase + realtime)
│   ├── implementacion.js ← 23 etapas, Gantt, propagación, plantilla, métricas
│   └── charts.js         ← Chart.js para el panel general
└── migrations/
    ├── 001_schema.sql        ← Tablas base (clientes, pendientes, soluciones, consultas)
    ├── 002_rls.sql           ← RLS policies
    ├── 003_seed.sql          ← Seed inicial (8 clientes, 3 pendientes, 8 soluciones)
    ├── 004_team_whitelist.sql ← Tabla team_members + is_team_member()
    ├── 005-013...            ← Iteraciones (notas, audit log, vencimientos, etc.)
    ├── 014_implementacion.sql ← Tablas implementacion_plantilla + implementacion_tareas
    ├── 015_implementacion_pendientes.sql ← Vinculación tarea ↔ pendiente
    ├── 016_implementacion_tarea_notas.sql ← Notas por tarea
    ├── 017_implementacion_audit.sql ← Audit log de tareas
    ├── 018_gantt.sql         ← duracion_dias, predecesoras, fecha_inicio
    └── 019_fecha_fin_objetivo.sql ← Objetivo de fin (deadline) por cliente
```

## Convenciones

### JavaScript

- Vanilla JS. Cero dependencias en `package.json` (no hay npm).
- Globals: cada módulo expone funciones que se llaman desde `onclick` en HTML.
- Patrón: cada sección tiene `init<Seccion>()` llamada por
  `window.addEventListener('app-ready', ...)` después del login.
- Variables globales tipo `clientes`, `pendientes`, `soluciones`,
  `implTareas` — todas se cargan al init y se mantienen sync via realtime.
- DB helpers: `dbList`, `dbInsert`, `dbUpdate`, `dbDelete` en
  `supabase-client.js`. Devuelven promises.
- Mapeo DB ↔ UI: cada módulo tiene `dbRowToX(row)` que convierte snake_case
  de la DB a camelCase para la UI.

### CSS

- Variables CSS para colores en `:root`. Tema oscuro via
  `[data-theme="dark"]` en `<html>`.
- BEM-ish para componentes complejos (ej: `.impl-cliente-card__icon`).
- Mobile-first no estricto, pero hay media queries `(max-width: 900px)` y
  `(max-width: 480px)`.
- No usar emojis dentro del CSS. Sí en JS (en strings de UI).

### Supabase

- Toda nueva tabla necesita: schema, RLS, realtime (si aplica), seed
  (si aplica), backfill (si afecta datos existentes).
- Las migrations son **idempotentes** (`IF NOT EXISTS`, `ON CONFLICT DO
  NOTHING`, `DROP POLICY IF EXISTS ...`).
- Función helper `is_team_member()` es SECURITY DEFINER y devuelve true si
  el usuario está en `team_members` con `activo = true`.
- Política estándar: `CREATE POLICY x ON tabla FOR ALL TO authenticated
  USING (is_team_member()) WITH CHECK (is_team_member());` o separar
  SELECT/INSERT/UPDATE/DELETE.

### Convenciones del usuario

- El usuario habla español rioplatense (Argentina). Sus instrucciones
  pueden ser informales — interpretá con sentido común.
- Le gusta el código comentado en español, no inglés.
- Le gusta ver el avance dividido en pasos chicos con confirmación entre
  cada uno.
- Si una funcionalidad requiere correr SQL en Supabase, **siempre avisarle
  explícitamente** qué migración corre y dónde. No asumir que ya lo hizo.

## Decisiones de diseño importantes

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
     (ej: 1 día arranca y termina el mismo día)
   - Se recalcula al cambiar: estado de tarea (a/desde completada),
     duración, predecesoras, fecha de inicio del proyecto.

4. **Vinculación tarea ↔ pendiente**: cuando asignás un asesor a una
   tarea de implementación, se crea automáticamente un pendiente para
   esa persona. Si reasignás, se cierra el pendiente viejo y se crea uno
   nuevo. Si marcás la tarea completa, el pendiente se cierra. Y vice
   versa.

5. **Modal "¿Qué solución usaste?"** aparece al cerrar pendiente de
   tipo soporte/bug/comercial — NO aparece para tipo "implementacion"
   (los pendientes de impl son sub-tareas, no consultas).

6. **Vista Lista vs Gantt en Implementación**: el toggle es **por cliente**
   (no global). Estado en memoria, no persiste a reload.

## Login y usuarios

Hay 6 cuentas en `team_members` (tabla en Supabase):
- ignaciotalon07@gmail.com (Google OAuth)
- matias@salario.local (password)
- daniel@salario.local (password)
- danielferro@salario.local (password)
- renzo@salario.local (password)
- alfred@salario.local (password)

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

- **U10**: Email digest diario (requiere Resend + Edge Function de cron)
- **Implementación + Soporte**: Botón "Mover a soporte" en cards de Impl
  (cambia `area='impl'` → `'soporte'`, conserva tareas como histórico)
- **Form adaptativo de cliente**: el form de "Nuevo cliente" sigue
  pidiendo autonomía y nota inicial aunque el área sea Implementación.
  Está en discusión si vale la pena hacerlo adaptativo.
- **Consultas no migradas a Supabase**: el form de "Registrar consulta"
  todavía persiste a localStorage (no se sincroniza entre equipo).

## Configuración local para correr

1. Clonar el repo
2. Abrir una terminal en la carpeta y correr:
   ```bash
   python -m http.server 8000
   ```
3. Abrir http://localhost:8000
4. Login con cualquier cuenta del equipo

No hay nada que instalar (sin `npm install`).
