# Integración Whaticket → Salario Gestión ("Por registrar")

Documento de traspaso. Resume todo lo decidido para seguir trabajando sobre el código.
Guardar en el repo como `docs/integracion-whaticket.md` y sumar una línea en `CLAUDE.md`.

---

## 1. Objetivo

Hoy, después de cada chat, el asesor va a Gestión y llena a mano "Registrar consulta"
(cliente, tipo, categoría, subtema, tiempo, repetida, conexión, detalle, solución).

**Nueva forma de trabajo:** el asesor atiende en Whaticket igual que siempre y cierra el
chat. En 1–2 minutos aparece un **borrador** en la sección nueva **"Por registrar"** de
Gestión, con datos precargados y la conversación al lado. El asesor completa
categoría, subtema y solución, y guarda. Nada queda sin registrar.

Maqueta navegable (aprobada por el equipo): https://claude.ai/artifact/5HL2aC1skyT2Fo5rSkTAJ5

---

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Qué genera un borrador | Cada vez que un chat se **resuelve** en Whaticket |
| Grupos de WhatsApp | **Excluidos** (son internos). Filtrar `isGroup = true` |
| Chat cerrado sin terminar | **Opción B**: si el cliente vuelve a escribir y el borrador anterior sigue sin registrar, los mensajes nuevos **se suman al mismo borrador** |
| Quién ve el borrador | Solo el asesor que **resolvió** el chat. Rol opcional `coordinador` ve todos (incluidos sin asignar) |
| Formulario | Se **reutiliza** el modal actual "Registrar consulta" (`abrirModalConsulta`), precargado. No se duplica lógica |
| Desde cuándo | Desde que se activa la sincronización; no se procesan chats viejos |
| IA (resumen, categoría) | Etapa 2, más adelante |
| Transcripción de audios | Etapa 3, más adelante |

---

## 3. Lo que sabemos de la API de Whaticket (probado con datos reales)

- Base: `https://api.whaticket.com/api/v1` · Auth: `Authorization: Bearer <token>`.
- Spec: `GET /openapi.json` (pública).
- Token creado con perfil **"Integración (solo lectura)"**: Chats → solo "Ver todos";
  Contactos → acceso (ver); Equipo → acceso (ver). El token va como secreto
  `WHATICKET_TOKEN` en Supabase (Edge Functions → Secrets). **Nunca en el repo ni en el frontend.**

### Tickets — `GET /tickets?status=closed`
- 100 por página, ordenados por `updatedAt` desc. Paginación con `cursorUpdatedAt` + `cursorId`
  (los dos juntos, tomados del último ticket de la página). Respuesta: `{ tickets, hasMore }`.
- Campos: `id, status, channel, isGroup, queueId, userId, lastReceivedMessageAt,
  snoozedUntil, createdAt, updatedAt, contact{id,name,number,email,treatmentName,profilePicUrl,tags}`.
- **El ticket es uno por contacto y dura años** (hay tickets creados en 2024 todavía en uso).
  Por eso un borrador NO es "un ticket", es **un tramo de conversación** (ver §4).
- `userId` del ticket = asesor asignado (el que lo resolvió).
- Un ticket cerrado con `snoozedUntil` es un chat pospuesto: **ignorarlo** hasta que se resuelva de verdad.
- En la muestra: 100 cerrados, 4 asesores distintos, 13 grupos.

### Mensajes — `GET /tickets/{id}/messages`
- 20 por página, orden **ascendente** (viejo → nuevo). Respuesta:
  `{ messages, hasMoreBefore, hasMoreAfter }`. Para ir hacia atrás: `cursor` + `cursorId`
  con `direction=before`. **Ojo:** en la doc de Swagger el campo `cursor` viene precargado
  con un valor de ejemplo; mandarlo vacío para obtener los últimos.
- Campos: `id, body, fromMe, isNote, isDeleted, mediaType, mediaUrl, ack, userId, createdAt`.
- Clasificación de cada mensaje:
  - `fromMe=false` → **cliente**. `mediaType`: `chat`, `audio`, etc. Audio viene con `body` vacío y `mediaUrl`.
  - `fromMe=true` y `userId` con valor → **asesor**. El `body` empieza con la firma
    `*Nombre Apellido:*\n` → **quitarla**.
  - `fromMe=true`, `userId=null`, `isNote=false` → **bot** (saludo automático
    "Hola! Contanos en que te podemos ayudar…"). No cuenta para tiempo ni detalle.
  - `isNote=true` → nota interna. Whaticket genera notas automáticas:
    - `"<Nombre> *aceptado* la conversación"` → alguien tomó el chat.
    - `"<Nombre> *resuelto* la conversación"` → **CIERRE. Es el corte entre tramos.**

### Usuarios — `GET /users`
- Campos: `id, name, email, status, isActive, awayPeriod, queues`.
- Usuarios actuales: Dani COLOMER, Daniel Ferro, Ignacio Talon, Matias Ferro, Renzo Moretti.
- Se vinculan a `team_members` por email. Los emails de `team_members` (salvo Ignacio) son
  placeholders `@salario.local` → probablemente haya que completar `whaticket_usuarios.team_email` a mano.

### Sin webhooks
La API no avisa cambios: hay que **consultar cada 1–2 minutos**. Rate limit: 600 req/min.

---

## 4. Lógica de la sincronización (Edge Function `whaticket-sync`)

Corre cada 2 minutos con `pg_cron` + `pg_net` (o Supabase Scheduled Functions).
Usa service role (saltea RLS). Lee/escribe el cursor en `whaticket_sync`.

```
1. desde = whaticket_sync['tickets_cerrados'].desde
2. Traer GET /tickets?status=closed paginando hasta que updatedAt < desde
3. Para cada ticket:
   a. Si isGroup → saltear
   b. Si snoozedUntil → saltear
   c. Traer mensajes hacia atrás hasta encontrar el "resuelto" ANTERIOR al último
      (o hasta ultimo_mensaje_id del borrador abierto de ese ticket, si existe)
   d. Tramo = mensajes entre el "resuelto" anterior y el último "resuelto"
   e. Si el tramo no tiene ningún mensaje del cliente → saltear (no hubo consulta)
   f. Calcular sugeridos (§5)
   g. Si hay borrador ABIERTO (estado='borrador') para ese ticket → OPCIÓN B:
        append de mensajes, tramos += 1, cierre_at = nuevo, recalcular tiempo y flags,
        asesor = quien resolvió el último tramo
      Si no → INSERT nuevo borrador
   h. Asesor: whaticket_usuarios(userId del ticket).team_email (si no hay → null = sin asignar)
   i. Cliente: whaticket_contactos(contact.id).cliente_id (si no hay → null = "Sin cliente")
4. Upsert whaticket_usuarios con GET /users (1 vez por hora alcanza)
5. Guardar nuevo "desde" = max(updatedAt procesado)
```

Idempotencia: guardar `ultimo_mensaje_id`; si un ticket se reprocesa y no hay mensajes
nuevos después de ese id, no hacer nada.

---

## 5. Cómo se precarga cada campo del formulario

| Campo del form (id en `index.html`) | Columna en `consultas` | Origen en el borrador |
|---|---|---|
| Cliente (`r-cliente`) | `cliente_id`, `cliente_nombre` | `whaticket_contactos` → `cliente_id`. Si es null, el asesor lo elige y se guarda el vínculo |
| Tiempo (`r-tiempo`) | `tiempo_resolucion` (**horas**, ej 0.42) | **Tiempo activo** (ver abajo) convertido a horas |
| Conexión remota (`r-remota`) | `conexion_remota` | `true` si algún mensaje contiene "conexion/conexión/anydesk/te conecto/me conecto" o un número tipo ID de AnyDesk (9–10 dígitos) |
| Repetida (`r-rep`) | `repetida` | Por ahora: el cliente tiene otra consulta en los últimos 30 días (sugerencia; se afina cuando haya categoría). Guardar `repetida_consulta_id` para mostrar "similar a…" |
| Detalle (`r-desc`) | `descripcion` | Primer mensaje del cliente con contenido real: saltear saludos ("hola", "buenas", "buen día", etc.), mensajes de < 15 caracteres y audios. Si no hay → vacío |
| Solución (`r-sol`) | `solucion_id` / KB | Vacío (etapa 2: IA o nota interna) |
| Tipo, categoría, subtema | `tipo_consulta`, `categoria`, `subtema` | Los elige el asesor |

**Tiempo activo:** recorrer los mensajes del tramo (sin bot ni notas) y sumar los
intervalos entre mensajes consecutivos **menores a 15 min**. Un hueco mayor solo se
cuenta si va de un mensaje del asesor que pide conexión ("pasame conexión") a un mensaje
del asesor que cierra ("listo", "solucionado", "probalo"): eso es trabajo por AnyDesk.
Mínimo 5 min. Es una **sugerencia**: el asesor la corrige.

---

## 6. Base de datos — migración `051_whaticket_borradores.sql`

Archivo adjunto (ya escrito, **todavía no corrido**). Crea:

- `is_coordinador()` — helper SECURITY DEFINER (rol `coordinador` en `team_members`).
- `whaticket_usuarios` — `whaticket_user_id` (PK) → `team_email`.
- `whaticket_contactos` — `whaticket_contact_id` (PK) → `cliente_id`, `ticket_id`, `numero`.
- `consultas_borradores` — ticket, contacto, asesor, cliente, `inicio_at`, `cierre_at`,
  `ultimo_mensaje_id`, sugeridos (`tiempo_sugerido`, `conexion_sugerida`,
  `repetida_sugerida`, `repetida_consulta_id`, `detalle_sugerido`, `tiene_audio`),
  `mensajes` (jsonb), `cant_mensajes`, `tramos`, `estado`
  (`borrador|registrado|descartado`), `consulta_id`, `resuelto_at`, `resuelto_por`.
  - **Índice único parcial** `(ticket_id) WHERE estado='borrador'` → garantiza opción B.
- `whaticket_sync` — clave/valor (cursor). Seed `tickets_cerrados.desde = now()`.
- RLS: borradores → SELECT/UPDATE solo propios (`asesor_email = jwt.email`) o coordinador;
  sin INSERT/DELETE desde la app. Contactos → todo el equipo. Usuarios → lectura.
  Sync → sin políticas (solo service role).
- Realtime en `consultas_borradores`.

Formato de cada item de `mensajes`:
`{ id, at, de: 'cliente'|'asesor'|'bot'|'nota', texto, tipo, media_url, user_id }`
(texto ya sin la firma `*Nombre:*`).

---

## 7. Cambios en el frontend (vanilla JS, convenciones del CLAUDE.md)

1. **`js/borradores.js`** (nuevo): `initBorradores()` en `app-ready`, carga
   `consultas_borradores` con `estado='borrador'`, suscripción realtime, render de la
   lista, badge del menú, `dbRowToBorrador(row)`.
2. **`index.html`**: ítem de menú "Por registrar" con badge + sección `#page-por-registrar`
   (lista de tarjetas como en la maqueta: cliente/persona, preview, chips Conexión /
   Repetida / Audio / N mensajes, "Más de 24 h", tiempo sugerido, botón Registrar).
3. **Registrar desde un borrador**: `abrirBorrador(id)` →
   `abrirModalConsulta(clienteNombre)` + setear `r-desc`, `r-tiempo`, `r-remota`, `r-rep`
   + mostrar panel lateral con la conversación dentro del modal + guardar
   `window._borradorActivoId = id`.
4. **Hook en `guardarConsulta()`** (`js/consultas.js`): después del `dbInsert('consultas')`
   exitoso, si `_borradorActivoId` → `dbUpdate('consultas_borradores', id, {estado:'registrado',
   consulta_id, resuelto_at, resuelto_por})` y limpiar la variable. Necesita que el insert
   devuelva el id (hoy no se guarda el retorno).
5. **Cliente "Sin cliente"**: al guardar, upsert en `whaticket_contactos` con el `cliente_id` elegido.
6. Botones extra: **Descartar** (estado `descartado`), **Dividir** (crea un 2º borrador
   desde la app → requiere política INSERT o una función RPC; definir), **Reasignar** (opcional).
7. Aviso en Panel general: "Tenés N consultas por registrar" (en `saludo.js`).

---

## 8. Plan de trabajo (pasos chicos, con confirmación entre cada uno)

- [x] Paso 0 — Perfil + token de solo lectura en Whaticket
- [x] Paso 1 — Validar la API con datos reales
- [ ] Paso 2 — Agregar `migrations/051_whaticket_borradores.sql` al repo y **correrla en
      Supabase → SQL Editor** (avisar explícitamente cuando se corra)
- [ ] Paso 3 — Cargar secreto `WHATICKET_TOKEN` en Supabase y crear Edge Function
      `whaticket-sync` (primera Edge Function del proyecto: hay que instalar Supabase CLI
      o crearla desde el dashboard) + programarla cada 2 min
- [ ] Paso 4 — Vinculación inicial: `whaticket_usuarios` (por email / a mano) y
      `whaticket_contactos` (desde `clientes.whaticket_url`, que ya guarda el ticket UUID
      de cada cliente → ticket → contacto; el resto cruzando nombre de agenda
      "Persona – Empresa" con `clientes.nombre`, revisando dudosos)
- [ ] Paso 5 — Pantalla "Por registrar" + integración con el modal (§7)
- [ ] Paso 6 — Piloto 1 semana con 2 asesores, ajustar, abrir a todo el equipo
- [ ] Etapa 2 — IA: resumen de detalle/solución, sugerencia de categoría/subtema
- [ ] Etapa 3 — Transcripción de audios

---

## 9. Pendientes / a definir

- Emails reales del equipo en `team_members` vs Whaticket (para vincular asesores).
- Quién tiene rol `coordinador` (o nadie).
- "Dividir" un borrador: ¿INSERT desde la app (política) o RPC?
- Lista de palabras para detectar conexión y saludos: afinar con el uso real.
- **Seguridad:** el repo de GitHub es **público** y contiene `027_seed_clientes_reales.sql`
  con nombres de clientes reales. Recomendado pasarlo a privado.
- Al terminar de usar la doc de Swagger, hacer **Logout** en "Authorize" (el token queda
  visible en el ejemplo de curl).
