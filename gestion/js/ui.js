// ════════════════════════════════════
// UI HELPERS
// Utilidades compartidas entre módulos.
// ════════════════════════════════════

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('toast--error');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// Toast de error: mismo toast pero con estilo rojo y más duración.
function toastError(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show', 'toast--error');
  setTimeout(() => {
    t.classList.remove('show', 'toast--error');
  }, 4000);
}

// ────────── Error handler global ──────────
// Traduce errores técnicos de Supabase / JS a mensajes entendibles.
// Evita que los errores fallen silenciosamente sin que nadie se entere.

function _clasificarError(err) {
  if (!err) return 'Ocurrió un error inesperado.';
  const msg = (err.message || err.toString()).toLowerCase();

  // Errores de red / Supabase caído
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return 'Sin conexión. Verificá tu internet o si Supabase está disponible.';
  }
  // RLS: el usuario no tiene permisos
  if (msg.includes('row-level security') || msg.includes('rls') || msg.includes('permission denied')) {
    return 'No tenés permisos para realizar esa acción.';
  }
  // JWT vencido / sesión expirada
  if (msg.includes('jwt expired') || msg.includes('token expired') || msg.includes('invalid jwt')) {
    return 'Tu sesión expiró. Recargá la página para volver a ingresar.';
  }
  // Límite de storage
  if (msg.includes('exceeded the maximum allowed size') || msg.includes('payload too large')) {
    return 'El archivo supera el límite de 50 MB permitido.';
  }
  // Violación de constraint (unique, FK, etc.)
  if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return 'Ya existe un registro con esos datos.';
  }
  if (msg.includes('foreign key') || msg.includes('violates')) {
    return 'No se puede realizar la operación: hay datos relacionados que lo impiden.';
  }
  // Error genérico con código HTTP de Supabase
  if (err.status && err.status >= 500) {
    return `Error del servidor (${err.status}). Intentá de nuevo en unos segundos.`;
  }
  // Fallback: mostrar el mensaje original acortado
  const raw = err.message || err.toString();
  return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
}

// Promesas rechazadas sin .catch() — la mayoría de los errores de dbList/dbInsert/etc.
window.addEventListener('unhandledrejection', (e) => {
  // Ignorar rechazos intencionales (ej: AbortController) o de libs externas
  if (!e.reason) return;
  const msg = _clasificarError(e.reason);
  console.error('[Error no capturado]', e.reason);
  toastError(msg);
  e.preventDefault(); // evita que aparezca en la consola como "Uncaught"
});

// Errores JS síncronos (referencias nulas, typos en funciones, etc.)
window.addEventListener('error', (e) => {
  // Ignorar errores de carga de recursos (imágenes rotas, etc.)
  if (e.target && e.target !== window) return;
  console.error('[Error de script]', e.error || e.message);
  toastError('Error inesperado en la app. Revisá la consola para más detalles.');
});

// ────────── Navegación interna de Configuración ──────────
// La página de Configuración funciona como un menú: muestra una lista de
// categorías y al hacer click se entra a la sub-sección correspondiente.
// abrirConfigSeccion(null)         → vuelve al menú
// abrirConfigSeccion('apariencia') → muestra solo esa sub-sección
const CONFIG_TITULOS = {
  apariencia:     { title: 'Apariencia',     sub: 'Tema oscuro y preferencias visuales' },
  implementacion: { title: 'Implementación', sub: 'Plantilla de etapas del proceso de onboarding' }
};

function abrirConfigSeccion(seccion) {
  const menu = document.getElementById('config-menu');
  const title = document.getElementById('config-page-title');
  const sub = document.getElementById('config-page-sub');
  if (menu) menu.style.display = seccion ? 'none' : '';
  document.querySelectorAll('.config-section').forEach(s => {
    s.style.display = 'none';
  });
  if (seccion) {
    const el = document.getElementById(`config-section-${seccion}`);
    if (el) el.style.display = '';
    const meta = CONFIG_TITULOS[seccion];
    if (title && meta) title.textContent = meta.title;
    if (sub && meta)   sub.textContent   = meta.sub;
  } else {
    if (title) title.textContent = 'Configuración';
    if (sub)   sub.textContent   = 'Preferencias personales de tu sesión';
  }
  // Scroll al tope para mejor UX
  const main = document.querySelector('.main');
  if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
}

// Cuando se entra a la página Configuración desde la nav lateral, asegurarse
// de mostrar el menú principal (no la última sub-sección abierta).
window.addEventListener('app-ready', () => {
  // Hook al nav-item de configuracion para resetear el menú al entrar
  const navConfig = document.querySelector('.nav-item[onclick*=configuracion]');
  if (navConfig) {
    const originalOnclick = navConfig.getAttribute('onclick');
    navConfig.addEventListener('click', () => {
      // Pequeño delay para que se renderice la página primero
      setTimeout(() => abrirConfigSeccion(null), 0);
    });
  }
});

// ────────── Tema oscuro ──────────
// El tema se aplica via atributo [data-theme="dark"] en <html>. La preferencia
// persiste por usuario en localStorage (key 'salario.theme.<email>') asi cada
// miembro del equipo tiene su propia configuracion sin afectar a los demas.
//
// Tambien guardamos un 'salario.theme' generico que se usa solamente para
// aplicar el tema antes del render (evitar flash) — coincide con la ultima
// configuracion aplicada en este navegador.

const THEME_KEY_GLOBAL = 'salario.theme';
function THEME_KEY_USER(email) {
  return 'salario.theme.' + (email || '_anon').toLowerCase();
}

function aplicarTema(modo) {
  if (modo === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleDarkMode(checked) {
  const modo = checked ? 'dark' : 'light';
  aplicarTema(modo);
  // Guardar en la clave generica (para evitar flash en el proximo reload)
  localStorage.setItem(THEME_KEY_GLOBAL, modo);
  // Guardar en la clave del usuario actual (asi cada miembro tiene su pref)
  const email = (typeof currentMember !== 'undefined' && currentMember && currentMember.email) ? currentMember.email : null;
  if (email) {
    localStorage.setItem(THEME_KEY_USER(email), modo);
  }
}

// Cuando la app esta lista (auth confirmado), cargamos la preferencia del
// usuario. Si difiere de lo aplicado por el script inline, se ajusta.
window.addEventListener('app-ready', () => {
  const email = (typeof currentMember !== 'undefined' && currentMember && currentMember.email) ? currentMember.email : null;
  if (email) {
    const userPref = localStorage.getItem(THEME_KEY_USER(email));
    if (userPref) {
      // El usuario ya tenia una preferencia guardada: aplicarla
      aplicarTema(userPref);
      // Sincronizar la global para que la proxima vez que abra el navegador
      // arranque sin flash
      localStorage.setItem(THEME_KEY_GLOBAL, userPref);
    } else {
      // Primera vez del usuario: guardamos lo que esta aplicado actualmente
      // como su preferencia (light por default si no hay nada)
      const actual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      localStorage.setItem(THEME_KEY_USER(email), actual);
    }
  }
  // Sincronizar el switch del form
  const toggle = document.getElementById('cfg-dark-toggle');
  if (toggle) {
    toggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';
  }
});
