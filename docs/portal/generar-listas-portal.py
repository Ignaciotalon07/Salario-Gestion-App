#!/usr/bin/env python3
"""
Regenera las listas de compartido/portal-listas.js (buscadores del portal de clientes) a partir de las
tablas que se exportan desde Salario (.xlsx con las columnas Tabla, Código, Descripción, ...,
Vig.Desde, Vig.Hasta).

Uso (desde la carpeta del proyecto):
    pip install openpyxl
    python docs/portal/generar-listas-portal.py obras-sociales "C:/ruta/OBRA-SOCIAL.XLSX"
    python docs/portal/generar-listas-portal.py actividades    "C:/ruta/ACTIVIDADES.XLSX"

- obras-sociales: Tabla 14 de Salario (obras sociales SIJP). Descripción tal cual está en Salario.
- actividades:    Tabla 46 de Salario (CLAE de ARCA). Descripción en MAYÚSCULAS.
- Se descartan filas vencidas (Vig.Hasta < hoy) y repetidas.
- Salario guarda el código como número y pierde los ceros: se completa a 6 dígitos.
- Reemplaza SOLO el bloque entre /*INICIO:<lista>*/ y /*FIN:<lista>*/ de compartido/portal-listas.js.
"""
import sys, re, json, datetime, pathlib
import openpyxl

LISTAS = {
    # nombre en la línea de comandos: (clave en portal-listas.js, mayúsculas)
    'obras-sociales': ('obrasSociales', False),
    'actividades':    ('clae',          True),
}

if len(sys.argv) < 3 or sys.argv[1] not in LISTAS:
    sys.exit(__doc__)

clave, mayusculas = LISTAS[sys.argv[1]]
ruta_xlsx = sys.argv[2]
destino = pathlib.Path(__file__).resolve().parent.parent.parent / 'compartido' / 'portal-listas.js'

def a_fecha(v):
    if isinstance(v, datetime.datetime):
        return v
    try:
        return datetime.datetime.fromisoformat(str(v)[:19])
    except Exception:
        return None

hoy = datetime.datetime.now()
ws = openpyxl.load_workbook(ruta_xlsx, read_only=True, data_only=True).worksheets[0]
vistos, filas = set(), []
for r in ws.iter_rows(min_row=3, values_only=True):
    if r[1] is None or not str(r[2] or '').strip():
        continue
    hasta = a_fecha(r[9]) if len(r) > 9 else None
    if hasta and hasta < hoy:                    # vigencia vencida
        continue
    cod = str(int(float(r[1]))).zfill(6)
    if cod in vistos:
        continue
    vistos.add(cod)
    desc = re.sub(r'\s+', ' ', str(r[2])).strip()
    filas.append((cod, desc.upper() if mayusculas else desc))
filas.sort(key=lambda f: f[0] if mayusculas else f[1].lower())   # actividades por código; obras sociales por nombre

bloque = '/*INICIO:%s*/\n' % clave + ''.join(
    '    [%s, %s],\n' % (json.dumps(c), json.dumps(d, ensure_ascii=False)) for c, d in filas
) + '    /*FIN:%s*/' % clave

js = destino.read_text(encoding='utf-8')
patron = r'/\*INICIO:%s\*/.*?/\*FIN:%s\*/' % (clave, clave)
nuevo, n = re.subn(patron, lambda m: bloque, js, flags=re.S)
if n != 1:
    sys.exit('No encontré los marcadores INICIO/FIN de %s en compartido/portal-listas.js' % clave)
destino.write_text(nuevo, encoding='utf-8')
print('%s cargadas: %d' % (sys.argv[1], len(filas)))
