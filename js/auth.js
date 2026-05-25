// AUTH
// Maneja el flow de login (Google o email+password) y el overlay.
// Despues del login, verifica que el email este en la whitelist de
// team_members y guarda la fila en currentMember para que los demas
// modulos (pendientes...) sepan quien soy.

let currentMember = null;
let _appReadyDispatched = false;

async function bootAuth() {
  const overlay = document.getElementById('login-overlay');
  const app     = document.getElementById('app-root');

  async function applyAuthState(user) {
    if (!user) {
      currentMember = null;
      _appReadyDispatched = false;
      overlay.style.display = 'flex';
      app.style.display = 'none';
      return;
    }

    // Buscar en team_members y guardar la fila
    const member = await fetchTeamMember(user.email);
    if (!member) {
      await sb().auth.signOut();
      const errEl = document.getElementById('login-error');
      if (errEl) {
        errEl.textContent = `Tu cuenta (${user.email}) no esta autorizada. Pedi al admin que te agregue al equipo.`;
        errEl.style.display = 'block';
      } else {
        alert(`Tu cuenta (${user.email}) no esta autorizada para acceder.`);
      }
      overlay.style.display = 'flex';
      app.style.display = 'none';
      return;
    }

    currentMember = member;
    overlay.style.display = 'none';
    app.style.display = '';
    renderUserChip(user, member);

    if (window.location.hash.startsWith('#access_token')) {
      history.replaceState(null, '', window.location.pathname);
    }

    if (!_appReadyDispatched) {
      _appReadyDispatched = true;
      window.dispatchEvent(new CustomEvent('app-ready', { detail: { user, member } }));
    }
  }

  onAuthStateChange((user, event) => {
    applyAuthState(user);
  });

  const user = await getCurrentUser();
  await applyAuthState(user);
}

async function fetchTeamMember(email) {
  const { data, error } = await sb()
    .from('team_members')
    .select('email, nombre, rol, activo')
    .eq('email', email)
    .eq('activo', true)
    .maybeSingle();
  if (error) {
    console.error('Error checking team_members', error);
    return null;
  }
  return data;
}

// Helper que usan otros modulos para saber el nombre del asesor logueado
function getCurrentUserName() {
  return currentMember ? currentMember.nombre : null;
}

function renderUserChip(user, member) {
  const el = document.getElementById('user-chip');
  if (!el) return;
  const name   = (member && member.nombre) || user.user_metadata?.full_name || user.user_metadata?.name || user.email;
  const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  el.innerHTML = `
    ${avatar
      ? `<img src="${avatar}" alt="" class="user-chip__avatar" referrerpolicy="no-referrer">`
      : `<div class="user-chip__avatar user-chip__avatar--text">${initial}</div>`}
    <div class="user-chip__info">
      <div class="user-chip__name">${name}</div>
      <button class="user-chip__logout" onclick="signOut()">Cerrar sesion</button>
    </div>`;
}

window.addEventListener('DOMContentLoaded', bootAuth);
