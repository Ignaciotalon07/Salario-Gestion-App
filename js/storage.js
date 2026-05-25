// STORAGE
// Wrapper sobre localStorage con keys versionadas para poder migrar
// schemas mas adelante sin pisar datos del equipo.

const STORAGE_KEYS = {
  PENDIENTES: 'salario.pendientes.v1',
  CONSULTAS:  'salario.consultas.v1',
  CLIENTES:   'salario.clientes.v1'
};

function storageLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('Error reading localStorage', key, e);
    return fallback;
  }
}

function storageSave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Error writing localStorage', key, e);
  }
}
