# API de Salario Gestión — Guía para el programador

Versión de la guía: **2026-11-04** (agrega año/mes, CUILes, versión y motor de datos).

Salario (VFP) le manda datos de cada cliente a Salario Gestión. Con esos datos Gestión muestra, en el detalle de cada cliente, los legajos, las personas, los convenios, las empresas, la versión de Salario y el motor de datos, y arma un **historial mes a mes**.

---

## 1. Endpoint

```
POST https://buxunfvdlqwoascvjdbj.supabase.co/functions/v1/salario-api
```

Headers:

| Header | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `x-api-key` | la clave compartida (te la pasa Ignacio; es la misma de siempre) |

`GET` al mismo endpoint devuelve `{"mensaje":"hola mundo...","version":"..."}` — sirve para probar que responde.

---

## 2. Qué se manda (un POST por cliente y por base)

```json
{
  "id_api":    1234,
  "base":      "DATOS1",
  "anio":      2026,
  "mes":       10,
  "legajos":   160,
  "cuiles":    100,
  "convenios": ["Comercio", "UOCRA"],
  "empresas":  [{ "nombre": "ACME SA", "cuit": "30-12345678-9" }],
  "version":   "5.2.1",
  "motor":     "mysql"
}
```

| Campo | Obligatorio | Descripción |
|---|---|---|
| `id_api` | **sí** | Número de cliente en Salario (entero positivo, 4 cifras). Es lo que identifica al cliente en Gestión. |
| `base` | no | Nombre de la base si el cliente tiene más de una (`DATOS1`, `DATOS2`, nombre de la empresa…). Sin este campo se usa `"principal"`. **Se manda un POST por base.** |
| `anio` | no | Año al que corresponde el dato (ej. `2026`). Si no viene, se usa el año actual. |
| `mes` | no | Mes al que corresponde el dato, **1 a 12**. Si no viene, se usa el mes actual. |
| `legajos` | no | **Cantidad total de legajos** (ver sección 3). |
| `cuiles` | no | **Cantidad de personas distintas**, o sea CUILes distintos (ver sección 3). |
| `convenios` | no | Lista de convenios del cliente: `["Comercio", "UOCRA"]` (también acepta `[{"nombre":"Comercio"}]`). |
| `empresas` | no | Lista de empresas cargadas (para estudios contables): `[{"nombre":"ACME SA","cuit":"30-1-2"}]`. |
| `version` | no | Versión de Salario que tiene instalada el cliente, como texto (ej. `"5.2.1"`). |
| `motor` | no | Motor de datos: **`"mysql"` o `"dbf"`** (nada más). |

- Hay que mandar **al menos uno** de: `legajos`, `cuiles`, `convenios`, `empresas`, `version`, `motor`.
- Solo se actualizan los campos que vengan; los demás quedan como estaban.
- No hace falta mandar todo en cada POST, pero **lo recomendado es mandar todo junto**, una vez por base.

---

## 3. IMPORTANTE: cómo contar legajos y CUILes

Hoy una persona con varios legajos se está contando como **1**. Tiene que cambiar:

- **`legajos`** = **todos los legajos**. Una persona con 5 legajos suma **5**.
- **`cuiles`** = **personas distintas**, o sea la cantidad de CUILes distintos (esa misma persona suma **1**).

Ejemplo (un colegio): 100 docentes que en total tienen 160 cargos/legajos →

```json
{ "legajos": 160, "cuiles": 100 }
```

No hay que mandar la lista de CUILes ni datos personales: **solo las cantidades**.

---

## 4. Cómo funcionan año y mes (historial)

- Cada POST queda guardado en el historial del **mes indicado** (`anio` + `mes`). Si volvés a mandar el mismo mes, se **reemplazan** los campos que mandes (el último envío del mes es el que queda).
- Si **no mandás** `anio`/`mes`, se toma el mes actual (hora de Argentina). Para el uso normal alcanza con mandar siempre `anio` y `mes` del mes que se está informando.
- Cuando el período enviado es igual o más nuevo que el último que había, ese dato pasa a ser también el **dato actual** del cliente.
- Se pueden mandar **meses anteriores** para cargar historia (ej. los últimos 12 meses). Quedan en el historial y **no pisan** el dato actual.
- No se aceptan **meses futuros** (devuelve error 400).

### Frecuencia recomendada

- Un envío **por día** (o al abrir Salario) con el mes en curso, así Gestión siempre muestra datos frescos.
- Al terminar de cerrar un mes, el último envío de ese mes queda como el dato de ese mes en el historial.
- Gestión avisa si un cliente pasa varios días sin enviar datos.

---

## 5. Clientes con más de una base

Se manda **un POST por base**, con el nombre de la base en `base`. Gestión suma los `legajos` y los `cuiles` de todas las bases y junta los convenios y las empresas (sin repetir).

> Ojo: si la misma persona está en dos bases, en `cuiles` cuenta una vez por base (no se puede deduplicar entre bases).

**Bases de prueba:** las que se llamen `PRUEBA`, `PRUEBAS`, `TEST`, `TESTING`, `DEMO` o `EJEMPLO` (con o sin número) **no hay que enviarlas**. Si llegan, Gestión las ignora y responde `200` con `"ignorada": true`.

---

## 6. Respuestas

**Éxito (200):**

```json
{
  "ok": true,
  "cliente": "Colegio San Martín",
  "id_api": 1234,
  "base": "DATOS1",
  "periodo": "2026-10",
  "actual": true,
  "guardado": ["legajos", "cuiles", "convenios", "empresas", "version", "motor"]
}
```

`"actual": false` significa que se guardó en el historial pero había datos más nuevos, así que no se tocó el dato actual (es lo esperado al cargar meses viejos).

**Errores:**

| Código | Cuándo | Qué hacer |
|---|---|---|
| 401 | Falta o está mal `x-api-key` | Revisar la clave |
| 400 | JSON inválido, falta `id_api`, `id_api` ≤ 0 o no numérico, `legajos`/`cuiles` negativos, `mes` fuera de 1–12, período futuro, `motor` distinto de `mysql`/`dbf`, ninguno de los campos de datos | Corregir el envío (el texto del error lo explica) |
| 404 | El `id_api` no existe en Gestión | Avisar a Ignacio: hay que cargar ese cliente en Gestión |
| 409 | Hay más de un cliente con ese `id_api` | Avisar a Ignacio |
| 500 | Error del servidor | Reintentar más tarde |

Los envíos rechazados (400/404/409 por `id_api`) **quedan registrados** y le aparecen a Ignacio y a Alfredo en la sección Alertas de Gestión.

---

## 7. Ejemplos

**curl (un cliente, una base, mes actual):**

```bash
curl -X POST "https://buxunfvdlqwoascvjdbj.supabase.co/functions/v1/salario-api" \
  -H "Content-Type: application/json" \
  -H "x-api-key: LA_CLAVE" \
  -d '{
    "id_api": 1234,
    "base": "DATOS1",
    "anio": 2026, "mes": 10,
    "legajos": 160, "cuiles": 100,
    "convenios": ["Comercio", "UOCRA"],
    "empresas": [{"nombre": "ACME SA", "cuit": "30-12345678-9"}],
    "version": "5.2.1",
    "motor": "mysql"
  }'
```

**Cargar un mes anterior (historia):**

```bash
curl -X POST "https://buxunfvdlqwoascvjdbj.supabase.co/functions/v1/salario-api" \
  -H "Content-Type: application/json" -H "x-api-key: LA_CLAVE" \
  -d '{"id_api": 1234, "base": "DATOS1", "anio": 2026, "mes": 9, "legajos": 156, "cuiles": 98}'
```

**Solo la versión y el motor (sin tocar lo demás):**

```bash
curl -X POST "https://buxunfvdlqwoascvjdbj.supabase.co/functions/v1/salario-api" \
  -H "Content-Type: application/json" -H "x-api-key: LA_CLAVE" \
  -d '{"id_api": 1234, "version": "5.2.1", "motor": "dbf"}'
```

---

## 8. Cambios respecto de la versión anterior

1. **Nuevos campos:** `anio`, `mes`, `cuiles`, `version`, `motor`.
2. **`legajos` cambia de significado:** ahora cuenta **todos los legajos**, no personas. Las personas van en `cuiles`.
3. **Historial:** cada envío queda guardado por mes en Gestión (ver sección 4).
4. Todo lo anterior (`id_api`, `base`, `convenios`, `empresas`, bases de prueba, clave `x-api-key`) **sigue igual**.

---

## 9. Checklist para empezar a probar

1. Probar el `GET` y ver que responde con `"version": "2026-11-04 ..."`.
2. Mandar un POST con **un cliente de prueba** (que Ignacio te indique) con todos los campos nuevos.
3. Verificar que la respuesta sea `ok: true` y que en Gestión, en el detalle del cliente, aparezcan: legajos, personas, versión, motor y la tarjeta **Historial**.
4. Mandar el mismo cliente con `mes` anterior y comprobar que aparece en el historial sin cambiar el dato actual.
5. Probar un colegio: verificar que `legajos` ≥ `cuiles` y que la diferencia tiene sentido.
6. Recién ahí, activar el envío para todos los clientes.
