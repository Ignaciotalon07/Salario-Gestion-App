// DATOS HARDCODEADOS
// Cuando conectemos Google Sheets, estos arrays se reemplazan por
// llamadas a la API. La forma de los objetos no deberia cambiar.

const CATS = {
  liquidacion: {
    label: 'Liquidacion',
    color: '#2d2d8e',
    bg: '#eeedfb',
    text: '#1e1e6e',
    sub: ['Vacaciones', 'Horas extras', 'Feriados', 'SAC / Aguinaldo', 'Licencias', 'Descuentos', 'Embargos', 'Sueldo basico y bruto', 'Liquidacion final']
  },
  errores: {
    label: 'Errores del sistema',
    color: '#c0392b',
    bg: '#fdf0ef',
    text: '#8b1a12',
    sub: ['Recibos / PDF', 'Importacion de datos', 'AFIP / Presentaciones', 'Calculo incorrecto', 'Pantalla bloqueada', 'Error al guardar', 'Impresion']
  },
  configuracion: {
    label: 'Configuracion',
    color: '#2d6a2d',
    bg: '#eef7ee',
    text: '#1a4a1a',
    sub: ['Feriados', 'Convenios colectivos', 'Parametros generales', 'Usuarios y permisos', 'Conceptos de liquidacion', 'Banco / CBU', 'Categorias de empleados']
  },
  actualizaciones: {
    label: 'Actualizaciones',
    color: '#b45309',
    bg: '#fef8ee',
    text: '#7c3a06',
    sub: ['Version 3.x', 'Cambios en liquidacion', 'Nuevos modulos', 'Migracion de datos', 'Cambios en AFIP']
  },
  fuera: {
    label: 'Fuera del sistema',
    color: '#5f5e5a',
    bg: '#f0efe9',
    text: '#3a3a36',
    sub: ['Consulta contable', 'Consulta laboral', 'Consulta AFIP', 'Otro software', 'Problema de PC / red']
  }
};

// Lookup rapido de clientes (para inferir tipo e iniciales al crear pendientes)
const CLIENTES_LOOKUP = {
  'ESTIN':         { tipo: 'empresa',         iniciales: 'ES' },
  'Ispova':        { tipo: 'estudio',         iniciales: 'IS' },
  'Estudio Bocco': { tipo: 'estudio',         iniciales: 'BO' },
  'Noetinger':     { tipo: 'municipalidad',   iniciales: 'NO' },
  'Mark Twain':    { tipo: 'colegio',         iniciales: 'MT' },
  'Taborin':       { tipo: 'colegio',         iniciales: 'TA' },
  'Sartori':       { tipo: 'estudio',         iniciales: 'SA' },
  'Zarazaga':      { tipo: 'estudio',         iniciales: 'ZA' },
  'Nina':          { tipo: 'empresa',         iniciales: 'NI' },
  'm3':            { tipo: 'empresa',         iniciales: 'M3' }
};

const TIPO_LABELS = {
  empresa: 'Empresa',
  estudio: 'Est. contable',
  colegio: 'Colegio',
  municipalidad: 'Municipalidad'
};

// Pendientes iniciales (seed para localStorage la primera vez)
const PENDIENTES_INICIALES = [
  {
    id: 1,
    cliente: 'Nina',
    tipo: 'empresa',
    iniciales: 'NI',
    asesor: 'Ignacio',
    prioridad: 'alta',
    categoriaLabel: 'Liquidacion',
    categoriaBadge: 'b-red',
    cuando: 'Hace 2 dias',
    descripcion: 'El cliente no puede cerrar la liquidacion de mayo. El sistema muestra un error de validacion al intentar procesar. Se reviso la configuracion de conceptos pero el error persiste.',
    intento: 'Se verifico la configuracion de conceptos, se revisaron los parametros del periodo y se reinicio el servicio. El error sigue apareciendo.',
    proxPaso: 'Conectarse esta manana y revisar si hay empleados con datos incompletos que bloqueen el cierre.',
    resuelto: false
  },
  {
    id: 2,
    cliente: 'Noetinger',
    tipo: 'municipalidad',
    iniciales: 'NO',
    asesor: 'Matias',
    prioridad: 'media',
    categoriaLabel: 'Configuracion',
    categoriaBadge: 'b-purple',
    cuando: 'Hace 1 dia',
    descripcion: 'El cliente tiene dudas con la carga de los feriados provinciales. Se le explico el proceso pero necesitan hacer la prueba ellos solos y confirmar si les sale.',
    intento: 'Se mostro el proceso paso a paso por conexion remota. El cliente tomo nota.',
    proxPaso: 'Consultar hoy si pudieron hacerlo solos. Si no, programar una segunda videollamada.',
    resuelto: false
  },
  {
    id: 3,
    cliente: 'ESTIN',
    tipo: 'empresa',
    iniciales: 'ES',
    asesor: 'Daniel',
    prioridad: 'media',
    categoriaLabel: 'Errores',
    categoriaBadge: 'b-blue',
    cuando: 'Hoy',
    descripcion: 'El recibo de un empleado especifico no se genera en PDF. Los demas salen bien. Se sospecha que hay algun dato del empleado mal cargado.',
    intento: 'Se verifico la plantilla de recibos, estaba activa. El resto de los empleados genera bien.',
    proxPaso: 'Revisar el legajo del empleado afectado: CBU, categoria, datos personales. Buscar que campo tiene diferente.',
    resuelto: false
  }
];

// Las soluciones ahora viven en la tabla 'soluciones' de Supabase, gestionada
// por js/kb.js. El array global 'soluciones' se carga al iniciar y queda
// disponible para pendientes.js (sugerencias automaticas).
