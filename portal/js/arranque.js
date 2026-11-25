// ───────────── Arranque: se carga al final, cuando todos los módulos ya están listos ─────────────
RENDERS.push(renderAvisos);
sb.auth.getSession().then(({ data }) => {
  if (data.session) iniciarPortal(); else irAlLogin();
});
