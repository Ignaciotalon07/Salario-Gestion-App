# Salario — Gestión de Clientes

Sistema interno de métricas y seguimiento para el equipo de implementación y soporte del software de liquidación de sueldos **Salario**.

Equipo: Ignacio, Matías, Daniel y Renzo. Más de 200 clientes atendidos por WhatsApp.

## Qué resuelve

- Registrar consultas de manera estructurada (no quedan solo en el chat).
- Identificar qué clientes saturan soporte con preguntas repetidas.
- Visibilizar pendientes del día anterior para todo el equipo al arrancar la jornada.
- Centralizar las soluciones aplicadas en una base de conocimiento compartida.

## Cómo correrlo

Es un sitio estático. No hay backend, build ni dependencias de npm.

**Opción 1 — abrir el archivo directo**

Doble clic en `index.html`. Funciona, pero algunos navegadores bloquean cosas con `file://`.

**Opción 2 — servidor local (recomendado)**

```bash
# Con Python (ya viene instalado en macOS / Linux y se baja fácil en Windows)
python -m http.server 8000

# O con Node
npx serve .
```

Después abrí `http://localhost:8000` en el navegador.

**Opción 3 — GitHub Pages**

Subir el repo a GitHub, activar Pages desde la rama `main` (carpeta raíz). El link público queda accesible desde cualquier dispositivo.

## Estructura

```
.
├── index.html          Estructura principal: sidebar + 8 secciones
├── css/
│   └── styles.css      Variables, layout, componentes, responsive
└── js/
    ├── data.js         Categorías y soluciones (datos hardcodeados)
    ├── ui.js           Helpers compartidos (toast)
    ├── nav.js          Navegación entre secciones
    ├── clientes.js     Filtros y ordenamiento de fichas
    ├── pendientes.js   Crear/cerrar pendientes + contador del sidebar
    ├── consultas.js    Formulario de registrar consulta
    ├── kb.js           Base de soluciones: render, búsqueda, filtros, detalle
    └── charts.js       Inicialización de Chart.js + render inicial de KB
```

## Secciones

- **Panel general** — métricas globales del mes, distribución de autonomía, tendencia mensual y score de riesgo.
- **Clientes** — fichas individuales con métricas, filtros por área/tipo/autonomía y ordenamiento.
- **Pendientes** — visible para todo el equipo al arrancar el día.
- **Registrar consulta** — formulario que se completa después de cada atención por WhatsApp.
- **Implementación** — cronograma y checklist de adopción para clientes en proceso.
- **Equipo** — carga y rendimiento por asesor.
- **Base de soluciones** — biblioteca de conocimiento compartido del equipo.
- **Alertas** — semáforo automático de situaciones críticas.

## Stack

- HTML + CSS + JavaScript vanilla, sin dependencias de npm ni build.
- [Chart.js 4.x](https://www.chartjs.org/) vía CDN para gráficos.
- [DM Sans](https://fonts.google.com/specimen/DM+Sans) y DM Mono vía Google Fonts.

## Próximos pasos

- [ ] Conectar a Google Sheets como fuente de datos real (reemplaza `js/data.js`).
- [ ] Persistir pendientes y consultas (LocalStorage primero, luego Sheets).
- [ ] Score de riesgo calculado dinámicamente desde los datos en lugar de hardcodeado.
- [ ] Exportar reportes mensuales en PDF.
