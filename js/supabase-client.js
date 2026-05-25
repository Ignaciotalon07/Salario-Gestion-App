// SUPABASE CLIENT
// Wrapper sobre supabase-js con helpers para auth y operaciones DB.
// Se inicializa la primera vez que se llama a alguna funcion.

let _sb = null;

function sb() {
  if (_sb) return _sb;
  if (!window.supabase || !window.supabase.createClient) {
    throw new Error('Supabase SDK no cargado. Verifica el <script src="..."> en index.html');
  }
  _sb = window.supabase.createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.publishableKey,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
  return _sb;
}

// ────────── Auth ──────────

async function signInWithGoogle() {
  const { error } = await sb().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    console.error('Sign in error', error);
    alert('No pudimos iniciar el login con Google: ' + error.message);
  }
}

async function signInWithEmail() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Completa email y contrasena.';
    errEl.style.display = 'block';
    return;
  }

  const { error } = await sb().auth.signInWithPassword({ email, password });
  if (error) {
    console.error('Email sign in error', error);
    errEl.textContent = error.message === 'Invalid login credentials'
      ? 'Email o contrasena incorrectos.'
      : 'No pudimos iniciar sesion: ' + error.message;
    errEl.style.display = 'block';
  }
}

async function signOut() {
  await sb().auth.signOut();
  window.location.reload();
}

async function getCurrentUser() {
  const { data: { user } } = await sb().auth.getUser();
  return user;
}

function onAuthStateChange(callback) {
  return sb().auth.onAuthStateChange((event, session) => {
    callback(session?.user || null, event);
  });
}

// Verifica que el usuario actual este en la tabla team_members.
// Si no esta, lo deslogueamos (la RLS lo bloquearia igual, pero asi
// le mostramos un mensaje claro en lugar de una app vacia).
async function isTeamMember(user) {
  if (!user) return false;
  const { data, error } = await sb()
    .from('team_members')
    .select('email')
    .eq('email', user.email)
    .eq('activo', true)
    .maybeSingle();
  if (error) {
    console.error('Error checking team_members', error);
    return false;
  }
  return !!data;
}

// ────────── DB helpers (para Fase B) ──────────

async function dbList(table, opts = {}) {
  let q = sb().from(table).select('*');
  if (opts.filter) {
    Object.entries(opts.filter).forEach(([k, v]) => { q = q.eq(k, v); });
  }
  if (opts.orderBy) {
    q = q.order(opts.orderBy, { ascending: opts.ascending !== false });
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function dbInsert(table, row) {
  const { data, error } = await sb().from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

async function dbUpdate(table, id, patch) {
  const { data, error } = await sb().from(table).update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function dbDelete(table, id) {
  const { error } = await sb().from(table).delete().eq('id', id);
  if (error) throw error;
}
