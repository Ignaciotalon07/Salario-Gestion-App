// salario-historial.js — Historial mensual de los datos de Salario por cliente (migración 071)
// Helpers del historial mensual de Salario (los usa la pestaña Histórico, js/salario-historico.js):
// períodos por cliente, agregado por mes (suma las bases), parseo de empresas "NOMBRE-N Empleados" y diferencias entre meses.
// Los datos salen de window.salarioHist (js/salario-sync.js).

const SAL_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
window._salHist = null;        // { clienteId, tab: 'resumen'|'empresas'|'convenios', q: '' }
const SAL_MAX_MESES = 12;

const _salPer = r => `${r.anio}-${String(r.mes).padStart(2, '0')}`;
function _salPerTxt(per) { const [a, m] = per.split('-'); return `${SAL_MESES[Number(m) - 1]} ${a}`; }
function _salPerCorto(per) { const [a, m] = per.split('-'); return `${SAL_MESES[Number(m) - 1].slice(0, 3)} ${String(a).slice(2)}`; }
const _salNom = x => (typeof x === 'string' ? x : (x && (x.nombre || x.razon_social)) || '').toString().trim();
const _salMotorTxt = m => m === 'mysql' ? 'MySQL' : m === 'dbf' ? 'DBF' : (m || '');

// "ACME SA-12 Empleados" → { nombre: "ACME SA", n: 12 } (si no trae la cantidad, n = null)
function _salEmpresa(txt) {
  const m = String(txt).match(/^(.*?)\s*-\s*(\d+)\s*empleados?\s*$/i);
  return m ? { nombre: m[1].trim(), n: Number(m[2]) } : { nombre: String(txt).trim(), n: null };
}
const _salKey = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

// Períodos con datos de un cliente, del más nuevo al más viejo
function salarioPeriodosCliente(clienteId) {
  const s = new Set();
  ((window.salarioHist || {})[clienteId] || []).forEach(r => s.add(_salPer(r)));
  return [...s].sort().reverse();
}

// Junta todas las bases de un período en un solo resumen
function salarioAgregadoPeriodo(clienteId, per) {
  const filas = ((window.salarioHist || {})[clienteId] || []).filter(r => _salPer(r) === per);
  if (!filas.length) return null;
  const suma = k => { const c = filas.filter(f => f[k] != null); return c.length ? c.reduce((t, f) => t + f[k], 0) : null; };
  const junta = k => {
    if (!filas.some(f => Array.isArray(f[k]))) return null;
    const vistos = new Set(), out = [];
    filas.forEach(f => (f[k] || []).forEach(x => { const n = _salNom(x); const key = n.toLowerCase(); if (n && !vistos.has(key)) { vistos.add(key); out.push(n); } }));
    return out;
  };
  const uniq = k => [...new Set(filas.map(f => f[k]).filter(Boolean))];
  return { legajos: suma('legajos'), cuiles: suma('cuiles'), convenios: junta('convenios'), empresas: junta('empresas'),
           versiones: uniq('version'), motores: uniq('motor'), bases: filas.length };
}

// Qué cambió entre dos meses (a = más nuevo, b = anterior). Devuelve datos para frases y detalle.
function _salDiff(a, b) {
  const dif = { legajos: null, cuiles: null, empNuevas: [], empIdas: [], empCambio: [], convNuevos: [], convIdos: [], version: null, motor: null };
  if (!b) return dif;
  if (a.legajos != null && b.legajos != null && a.legajos !== b.legajos) dif.legajos = a.legajos - b.legajos;
  if (a.cuiles != null && b.cuiles != null && a.cuiles !== b.cuiles) dif.cuiles = a.cuiles - b.cuiles;
  const mapa = l => { const m = new Map(); (l || []).forEach(t => { const e = _salEmpresa(t); m.set(_salKey(e.nombre), e); }); return m; };
  const ea = mapa(a.empresas), eb = mapa(b.empresas);
  ea.forEach((e, k) => { if (!eb.has(k)) dif.empNuevas.push(e); else { const o = eb.get(k); if (e.n != null && o.n != null && e.n !== o.n) dif.empCambio.push({ nombre: e.nombre, de: o.n, a: e.n }); } });
  eb.forEach((e, k) => { if (!ea.has(k)) dif.empIdas.push(e); });
  const ca = new Map((a.convenios || []).map(x => [_salKey(x), x])), cb = new Map((b.convenios || []).map(x => [_salKey(x), x]));
  ca.forEach((v, k) => { if (!cb.has(k)) dif.convNuevos.push(v); });
  cb.forEach((v, k) => { if (!ca.has(k)) dif.convIdos.push(v); });
  if (a.versiones.length && a.versiones.join() !== b.versiones.join()) dif.version = [b.versiones.join(', ') || '—', a.versiones.join(', ')];
  if (a.motores.length && a.motores.join() !== b.motores.join()) dif.motor = [b.motores.map(_salMotorTxt).join(', ') || '—', a.motores.map(_salMotorTxt).join(', ')];
  return dif;
}
