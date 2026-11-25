-- ====================================================================
-- 080_PORTAL_RELEVAMIENTO — Portal de implementación: Relevamiento inicial (paso 7).
-- Reemplaza el Excel "2 - Relevamiento Inicial": el cliente lo completa en el portal.
--
--   * relevamiento_preguntas      → las 46 consignas (10 bloques), configurables por el equipo
--   * relevamiento_respuestas     → respuestas del cliente (texto / Sí-No / por Mensuales y Jornales,
--                                   omitida con motivo, "Entendido" en los comentarios)
--   * relevamiento_notas_equipo   → notas INTERNAS del equipo por pregunta (el cliente NO las ve)
--   * relevamiento_aprobacion     → quién aprobó el relevamiento y cuándo (Key User)
--   * cliente_empresas            → +modalidad_pago y +pct_quincenal (detalle de la empresa principal)
--   * relevamiento_faltantes()    → qué le falta completar (lo usa la pantalla y la aprobación)
--   * RPC portal_guardar_respuesta / portal_aprobar_relevamiento
--   * prep_pasos()                → el paso 7 se completa al aprobar el relevamiento
-- El cliente NO escribe las tablas directo: todo va por funciones que validan.
-- Idempotente. Correr en Supabase → SQL Editor.
-- ====================================================================

-- ── 1) Preguntas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relevamiento_preguntas (
  id            uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  seccion       integer  NOT NULL,                 -- 1..10 (número del bloque)
  seccion_titulo text    NOT NULL,
  orden         integer  NOT NULL,                 -- orden dentro del bloque
  clave         text     NOT NULL UNIQUE,          -- identificador estable (ej. s4_horas_extras)
  tema          text     NOT NULL,                 -- columna "tema"
  consulta      text     NOT NULL,                 -- la pregunta; párrafos separados por línea en blanco
  tipo          text     NOT NULL CHECK (tipo IN ('texto','sino','dual_texto','dual_sino','confirmar','comentario')),
  omitible      boolean  NOT NULL DEFAULT false,
  activa        boolean  NOT NULL DEFAULT true,
  tipos_cliente text[]                              -- NULL = todos; ej. {estudio,colegio}
);
CREATE INDEX IF NOT EXISTS idx_relev_preg_seccion ON relevamiento_preguntas (seccion, orden);

-- ── 2) Respuestas (una fila por pregunta y columna) ──────────────────
-- columna: 'unica' (preguntas simples) | 'mensuales' | 'jornales' (preguntas duales)
CREATE TABLE IF NOT EXISTS relevamiento_respuestas (
  cliente_id   uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  pregunta_id  uuid        NOT NULL REFERENCES relevamiento_preguntas(id) ON DELETE CASCADE,
  columna      text        NOT NULL DEFAULT 'unica' CHECK (columna IN ('unica','mensuales','jornales')),
  sino         text        CHECK (sino IN ('si','no')),
  texto        text,
  omitida      boolean     NOT NULL DEFAULT false,
  motivo       text,                                   -- motivo de la omisión
  confirmado   boolean     NOT NULL DEFAULT false,     -- "Entendido" / "Revisé que estén correctos"
  actualizado_por text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, pregunta_id, columna)
);

-- ── 3) Notas internas del equipo (NUNCA visibles para el cliente) ────
CREATE TABLE IF NOT EXISTS relevamiento_notas_equipo (
  cliente_id   uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  pregunta_id  uuid        NOT NULL REFERENCES relevamiento_preguntas(id) ON DELETE CASCADE,
  nota         text        NOT NULL,
  autor        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, pregunta_id)
);

-- ── 4) Aprobación ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relevamiento_aprobacion (
  cliente_id   uuid        PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  aprobado_por text        NOT NULL,                  -- nombre y apellido de quien aprobó
  aprobado_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 5) Detalle de la empresa principal (parte "Empresas") ────────────
ALTER TABLE cliente_empresas ADD COLUMN IF NOT EXISTS modalidad_pago text;
ALTER TABLE cliente_empresas ADD COLUMN IF NOT EXISTS pct_quincenal  integer;
ALTER TABLE cliente_empresas DROP CONSTRAINT IF EXISTS cliente_empresas_modalidad_check;
ALTER TABLE cliente_empresas ADD CONSTRAINT cliente_empresas_modalidad_check
  CHECK (modalidad_pago IS NULL OR modalidad_pago IN ('mensual','quincenal','mixto'));
ALTER TABLE cliente_empresas DROP CONSTRAINT IF EXISTS cliente_empresas_pct_check;
ALTER TABLE cliente_empresas ADD CONSTRAINT cliente_empresas_pct_check
  CHECK (pct_quincenal IS NULL OR pct_quincenal BETWEEN 0 AND 100);

-- ── 6) RLS ───────────────────────────────────────────────────────────
ALTER TABLE relevamiento_preguntas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE relevamiento_respuestas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE relevamiento_notas_equipo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE relevamiento_aprobacion    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipo gestiona relev_preguntas" ON relevamiento_preguntas;
CREATE POLICY "equipo gestiona relev_preguntas" ON relevamiento_preguntas
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente lee preguntas" ON relevamiento_preguntas;
CREATE POLICY "cliente lee preguntas" ON relevamiento_preguntas
  FOR SELECT TO authenticated USING (es_usuario_portal() AND activa);

DROP POLICY IF EXISTS "equipo gestiona relev_respuestas" ON relevamiento_respuestas;
CREATE POLICY "equipo gestiona relev_respuestas" ON relevamiento_respuestas
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente ve sus respuestas" ON relevamiento_respuestas;
CREATE POLICY "cliente ve sus respuestas" ON relevamiento_respuestas
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

-- Las notas internas: SOLO el equipo (no hay policy para clientes)
DROP POLICY IF EXISTS "equipo gestiona relev_notas" ON relevamiento_notas_equipo;
CREATE POLICY "equipo gestiona relev_notas" ON relevamiento_notas_equipo
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());

DROP POLICY IF EXISTS "equipo gestiona relev_aprobacion" ON relevamiento_aprobacion;
CREATE POLICY "equipo gestiona relev_aprobacion" ON relevamiento_aprobacion
  FOR ALL TO authenticated USING (is_team_member()) WITH CHECK (is_team_member());
DROP POLICY IF EXISTS "cliente ve su aprobacion" ON relevamiento_aprobacion;
CREATE POLICY "cliente ve su aprobacion" ON relevamiento_aprobacion
  FOR SELECT TO authenticated USING (cliente_id = portal_cliente_id());

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE relevamiento_respuestas;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE relevamiento_aprobacion;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 7) Seed: las 46 consignas (si ya existen, no se pisan) ───────────
INSERT INTO relevamiento_preguntas (seccion, seccion_titulo, orden, clave, tema, consulta, tipo, omitible) VALUES
  (1, $q$Equipo de Nómina$q$, 1, $q$s1_liquidadores$q$, $q$Liquidadores$q$, $q$¿Todas las personas van a hacer el proceso completo de liquidación o van a dividirse las tareas?

¿Cuentan con un papel de trabajo o planilla de control? Si no, ¿conocen las fórmulas de cálculo?

¿Prevén altas o bajas de liquidadores durante la implementación?$q$, 'texto', false),
  (1, $q$Equipo de Nómina$q$, 2, $q$s1_referente_de_la_implementacion_key_user$q$, $q$Referente de la implementación (Key User)$q$, $q$Indicá quién va a ser el referente. Es la única persona que valida los cambios en las fórmulas y aprueba el relevamiento y las fórmulas propuestas, antes de que empecemos a programarlas.$q$, 'texto', false),
  (1, $q$Equipo de Nómina$q$, 3, $q$s1_responsable_de_pruebas$q$, $q$Responsable de pruebas$q$, $q$¿Quién va a realizar las pruebas? Puede ser el mismo referente u otra persona. Las pruebas que definamos en el cronograma deben completarse dentro de las fechas estimadas.$q$, 'texto', false),
  (1, $q$Equipo de Nómina$q$, 4, $q$s1_conocimiento_de_lsd$q$, $q$Conocimiento de LSD$q$, $q$¿Quién presenta el F.931 (Libro de Sueldos Digital): ustedes o un estudio contable?

En cualquier caso, quien liquida debería poder controlar el borrador del F.931, detectar diferencias cruzando por CUIL con el Excel de ARCA (ex AFIP) e interpretar los errores comunes de la web para pedir su corrección. ¿Cuentan con esa experiencia?$q$, 'texto', true),
  (1, $q$Equipo de Nómina$q$, 5, $q$s1_conocimiento_de_ganancias$q$, $q$Conocimiento de Ganancias$q$, $q$¿Tienen un Excel de control del cálculo de Ganancias y conocen el proceso, incluida la presentación de SICORE y F.1359?

Tené en cuenta que Ganancias se calcula por fecha de pago y no por mes liquidado.$q$, 'sino', true),
  (2, $q$Paralelos$q$, 1, $q$s2_ultimo_mes_liquidado$q$, $q$Último mes liquidado$q$, $q$Vamos a usar el PDF de tu última liquidación para listar los conceptos y definir juntos las fórmulas y bases.

¿En ese mes se forzaron conceptos a mano (fuera de retroactivos y casos particulares)? Si es así, indicanos un mes anterior con la menor cantidad posible de ajustes manuales.$q$, 'texto', true),
  (2, $q$Paralelos$q$, 2, $q$s2_importes_netos$q$, $q$Importes netos$q$, $q$Además del PDF, necesitamos el neto de cada empleado de ese mes. ¿Tenés un Excel con los netos o preferís que los tomemos del PDF?$q$, 'texto', true),
  (3, $q$Empresas$q$, 1, $q$s3_particularidades_de_convenios$q$, $q$Particularidades de convenios$q$, $q$¿Hay convenios institucionales o liquidaciones con reglas propias, abiertas para casos particulares? Los revisamos en las reuniones de seguimiento.$q$, 'sino', true),
  (3, $q$Empresas$q$, 2, $q$s3_personal_mensual_y_quincenal$q$, $q$Personal mensual y quincenal$q$, $q$¿Qué porcentaje aproximado del personal cobra por mes y qué porcentaje por quincena?$q$, 'dual_texto', true),
  (3, $q$Empresas$q$, 3, $q$s3_personal_con_ganancias$q$, $q$Personal con Ganancias$q$, $q$¿Cuántas personas tributan Impuesto a las Ganancias?

Si la implementación empieza con el año en curso, hay que cargar lo acumulado a la fecha (ingresos, deducciones y descuentos). ¿Cómo lo tienen hoy? ¿Podrían prepararlo en un Excel para importarlo?$q$, 'texto', true),
  (3, $q$Empresas$q$, 4, $q$s3_datos_laborales$q$, $q$Datos laborales$q$, $q$¿Qué datos laborales necesitan registrar por empleado (centros de costos, áreas, secciones u otros)? ¿Existe alguna jerarquía entre ellos? Tené en cuenta que cada tabla se arma por empresa.$q$, 'texto', true),
  (3, $q$Empresas$q$, 5, $q$s3_migracion_de_empleados$q$, $q$Migración de empleados$q$, $q$Los datos de los empleados se cargan desde un Excel que incluya los datos del F.931 y el CBU. ¿Cuentan con esa información? ¿En qué formato la tienen hoy?$q$, 'sino', true),
  (3, $q$Empresas$q$, 6, $q$s3_logos_y_firmas$q$, $q$Logos y firmas$q$, $q$Estos son los logos y firmas que cargaste en el paso 4. Revisá que estén bien antes de seguir.$q$, 'confirmar', false),
  (4, $q$Nómina$q$, 1, $q$s4_sueldos_y_jornales$q$, $q$Sueldos y jornales$q$, $q$Mensuales: ¿Se liquida con días teóricos por defecto? ¿Cómo se informan las altas y bajas con días reales?

Jornales: ¿Cómo se informan las horas trabajadas (reloj, planilla)? ¿Se fijan horas teóricas por empleado y se cargan horas distintas por novedad en un período determinado?$q$, 'dual_texto', true),
  (4, $q$Nómina$q$, 2, $q$s4_jornada_parcial$q$, $q$Jornada parcial$q$, $q$¿Tienen personal con jornada parcial? Contanos las particularidades. Por defecto, las remuneraciones 04 y 08 se presentan como parcial en el F.931.$q$, 'dual_sino', true),
  (4, $q$Nómina$q$, 3, $q$s4_adicionales_o_configuraciones_individual$q$, $q$Adicionales o configuraciones individuales$q$, $q$¿Algún empleado requiere una configuración especial o datos extra (campos adicionales de Datos Laborales o de Extensión)?$q$, 'dual_sino', true),
  (4, $q$Nómina$q$, 4, $q$s4_nocturnidad$q$, $q$Nocturnidad$q$, $q$¿Tienen personal con horario nocturno? ¿Cómo se liquida?$q$, 'dual_sino', true),
  (4, $q$Nómina$q$, 5, $q$s4_feriados$q$, $q$Feriados$q$, $q$¿El feriado se paga discriminado en el recibo o solo cuando se trabaja?$q$, 'dual_texto', true),
  (4, $q$Nómina$q$, 6, $q$s4_licencias$q$, $q$Licencias$q$, $q$¿Cómo se pagan las licencias y cómo se muestran en el recibo?

¿El valor del día incluye antigüedad, presentismo y similares, o esos conceptos se calculan aparte?

Para mensuales: ¿se toman 30 o 25 días como base (en algunos casos o en todos)?$q$, 'dual_texto', true),
  (4, $q$Nómina$q$, 7, $q$s4_descuentos_por_ausencias_y_licencias_sin$q$, $q$Descuentos por ausencias y licencias sin goce$q$, $q$En ausencias injustificadas, licencias sin goce, maternidad u otros casos que se descuentan: ¿cómo se calcula el descuento? ¿Afectan los días trabajados para el SAC y SICOSS?$q$, 'dual_texto', true),
  (4, $q$Nómina$q$, 8, $q$s4_horas_extras$q$, $q$Horas extras$q$, $q$¿Qué recargos de horas extras aplican (50 %, 100 % u otros)?$q$, 'dual_texto', true),
  (4, $q$Nómina$q$, 9, $q$s4_vacaciones$q$, $q$Vacaciones$q$, $q$¿Se pagan todos los días de vacaciones al salir o solo los del mes más un adelanto? ¿Cómo se distribuyen para el SAC?$q$, 'dual_texto', true),
  (4, $q$Nómina$q$, 10, $q$s4_prestacion_dineraria_ilt$q$, $q$Prestación dineraria (ILT)$q$, $q$¿Los días de prestación dineraria reducen los días trabajados para el SAC y SICOSS? ¿Se paga SAC sobre la ILT?$q$, 'dual_texto', true),
  (4, $q$Nómina$q$, 11, $q$s4_sac$q$, $q$SAC$q$, $q$¿Cómo se calcula el SAC si hay conceptos no remunerativos? ¿El SAC proporcional se paga en las liquidaciones finales (excepto junio y diciembre)?$q$, 'dual_texto', true),
  (4, $q$Nómina$q$, 12, $q$s4_indemnizaciones$q$, $q$Indemnizaciones$q$, $q$¿Hay particularidades en las liquidaciones finales (indemnizaciones, preaviso, etc.)?$q$, 'dual_sino', true),
  (4, $q$Nómina$q$, 13, $q$s4_asignaciones_familiares$q$, $q$Asignaciones familiares$q$, $q$¿Pagan asignaciones familiares? ¿Aplican las nacionales o las provinciales?$q$, 'dual_sino', true),
  (4, $q$Nómina$q$, 14, $q$s4_embargos_y_cuotas_alimentarias$q$, $q$Embargos y cuotas alimentarias$q$, $q$¿Tienen empleados con embargos o cuotas alimentarias? ¿Cuántos aproximadamente?$q$, 'dual_sino', true),
  (4, $q$Nómina$q$, 15, $q$s4_anticipos_adelantos_y_prestamos$q$, $q$Anticipos, adelantos y préstamos$q$, $q$¿Otorgan anticipos, adelantos o préstamos? ¿En qué tipo de liquidación se descuentan (en blanco o no)?$q$, 'dual_sino', true),
  (4, $q$Nómina$q$, 16, $q$s4_pasantes_y_directores$q$, $q$Pasantes y directores$q$, $q$¿Tienen pasantes o directores? Para ellos se arma un esquema de liquidación particular, con o sin descuentos según corresponda. Contanos cómo se liquidan hoy.$q$, 'dual_sino', true),
  (4, $q$Nómina$q$, 17, $q$s4_liquidaciones_historicas$q$, $q$Liquidaciones históricas$q$, $q$¿Tienen archivos de liquidaciones anteriores para migrar? ¿Desde qué fecha quieren migrar?$q$, 'dual_sino', true),
  (5, $q$Acreditaciones$q$, 1, $q$s5_interfaces_bancarias$q$, $q$Interfaces bancarias$q$, $q$¿Con qué bancos acreditan los sueldos, o solo le pasan a Tesorería un listado de CBU y monto?

Si presentan un archivo TXT al banco, ¿quién lo genera: el liquidador o el referente? Lo necesitamos porque las pruebas se hacen cargando el archivo real, no solo mirando el formato.$q$, 'texto', true),
  (6, $q$Asientos contables$q$, 1, $q$s6_plan_de_cuentas$q$, $q$Plan de cuentas$q$, $q$¿Usan un único plan de cuentas o uno distinto por empresa?

Necesitamos un Excel solo con las cuentas de la liquidación de sueldos (código y nombre), separadas en Debe y Haber. No envíes el plan contable completo del área de Contabilidad.$q$, 'texto', true),
  (6, $q$Asientos contables$q$, 2, $q$s6_configuracion_del_asiento$q$, $q$Configuración del asiento$q$, $q$Indicanos cómo se arma el asiento: qué totales o conceptos van a cada cuenta, en el Debe y en el Haber, y si hace falta abrirlo por centros de costos.$q$, 'texto', true),
  (6, $q$Asientos contables$q$, 3, $q$s6_formato_de_importacion$q$, $q$Formato de importación$q$, $q$¿El software contable que usan requiere un formato específico para importar el asiento? ¿Cuál?$q$, 'sino', true),
  (7, $q$Sindicales$q$, 1, $q$s7_archivos_para_presentaciones$q$, $q$Archivos para presentaciones$q$, $q$¿Qué sindicatos requieren archivos para presentar sus declaraciones juradas?$q$, 'texto', true),
  (7, $q$Sindicales$q$, 2, $q$s7_reportes$q$, $q$Reportes$q$, $q$¿Qué sindicatos piden un reporte específico?$q$, 'texto', true),
  (8, $q$LSD · F.931$q$, 1, $q$s8_particularidades_en_lsd$q$, $q$Particularidades en LSD$q$, $q$¿Hay alguna particularidad en el Libro de Sueldos Digital (temas gremiales, de presentación, correcciones manuales u otras que requieran una configuración especial)?

Si el F.931 lo presenta un estudio contable, ¿quién hace el cruce de aportes y contribuciones?$q$, 'sino', true),
  (8, $q$LSD · F.931$q$, 2, $q$s8_libro_de_sueldos_del_ministerio_de_traba$q$, $q$Libro de Sueldos del Ministerio de Trabajo$q$, $q$¿Necesitan emitir el Libro de Sueldos del Ministerio de Trabajo? ¿Hay algún formato particular?$q$, 'sino', true),
  (8, $q$LSD · F.931$q$, 3, $q$s8_sijcor$q$, $q$SIJCOR$q$, $q$¿Presentan SIJCOR?$q$, 'sino', true),
  (9, $q$Reportes de gestión$q$, 1, $q$s9_lista_de_reportes$q$, $q$Lista de reportes$q$, $q$¿Qué reportes necesitan para la gestión? Los revisamos para ver si alcanzan los reportes estándar o si hacen falta informes especiales.$q$, 'texto', true),
  (10, $q$Comentarios de implementación$q$, 1, $q$s10_como_vas_a_usar_este_portal$q$, $q$Cómo vas a usar este portal$q$, $q$Es tu espacio para acompañar toda la implementación. Desde acá vas a poder:
• Seguir el paso a paso y el avance de las tareas, las nuestras y las tuyas
• Cargar tu información, tus archivos y este relevamiento
• Pedir las reuniones por Meet y ver cuándo son
• Dejar dudas y notas en cada tarea, y escribirle por WhatsApp a tu responsable
• Recibir avisos de novedades y de tareas por vencer
• Consultar la ayuda y descargar material$q$, 'comentario', false),
  (10, $q$Comentarios de implementación$q$, 2, $q$s10_documentos_y_ddjj$q$, $q$Documentos y DDJJ$q$, $q$Salario genera los formatos de las presentaciones y declaraciones juradas, pero la presentación se hace en plataformas web externas (ARCA, sindicatos, etc.). Si esas plataformas devuelven errores o mensajes, es responsabilidad de ustedes interpretarlos e informarnos el motivo.$q$, 'comentario', false),
  (10, $q$Comentarios de implementación$q$, 3, $q$s10_papel_de_trabajo$q$, $q$Papel de trabajo$q$, $q$Las personas que liquidan deben conocer todos los cálculos y poder controlarlos con un papel de trabajo.$q$, 'comentario', false),
  (10, $q$Comentarios de implementación$q$, 4, $q$s10_programacion_de_conceptos_y_formulas$q$, $q$Programación de conceptos y fórmulas$q$, $q$Durante la programación y el primer paralelo, nuestro equipo programa las fórmulas que revisamos juntos en las reuniones. Después, en soporte, probamos las fórmulas nuevas con una muestra chica y luego ustedes repiten las pruebas en condiciones más exigentes (licencias, bajas, jornadas reducidas, etc.).$q$, 'comentario', false),
  (10, $q$Comentarios de implementación$q$, 5, $q$s10_gestion_del_tiempo$q$, $q$Gestión del tiempo$q$, $q$Llevamos un cronograma (Gantt) con el inicio, el avance y el fin de cada tarea, tanto nuestras como tuyas. Cualquier demora se actualiza ahí para informar cuánto se corre el proyecto y cómo recuperarlo.$q$, 'comentario', false),
  (10, $q$Comentarios de implementación$q$, 6, $q$s10_validacion_de_datos$q$, $q$Validación de datos$q$, $q$Con la aprobación de este relevamiento y de la planilla de conceptos (estándar y no estándar, con sus fórmulas) damos por validados los datos para implementar.$q$, 'comentario', false)
ON CONFLICT (clave) DO NOTHING;

-- ── 8) Qué le falta completar al cliente ─────────────────────────────
-- Una fila por punto pendiente. Sin filas = relevamiento completo.
CREATE OR REPLACE FUNCTION relevamiento_faltantes(p_cliente uuid)
RETURNS TABLE (clave text, tema text, motivo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE e cliente_empresas%ROWTYPE;
BEGIN
  IF p_cliente IS NULL OR NOT (is_team_member() OR p_cliente = portal_cliente_id()) THEN
    RETURN;
  END IF;

  -- Preguntas: respondida, omitida o confirmada, según el tipo
  RETURN QUERY
  SELECT p.clave, p.tema,
         CASE WHEN p.tipo IN ('confirmar','comentario') THEN 'sin marcar “Leído y entendido”'
              ELSE 'sin responder ni omitir' END
  FROM relevamiento_preguntas p
  WHERE p.activa
    AND (p.tipos_cliente IS NULL OR EXISTS (SELECT 1 FROM clientes c WHERE c.id = p_cliente AND c.tipo = ANY (p.tipos_cliente)))
    AND NOT (
      CASE p.tipo
        WHEN 'texto' THEN EXISTS (SELECT 1 FROM relevamiento_respuestas r WHERE r.cliente_id = p_cliente AND r.pregunta_id = p.id AND r.columna = 'unica'
                                  AND (r.omitida OR length(btrim(coalesce(r.texto,''))) > 0))
        WHEN 'sino'  THEN EXISTS (SELECT 1 FROM relevamiento_respuestas r WHERE r.cliente_id = p_cliente AND r.pregunta_id = p.id AND r.columna = 'unica'
                                  AND (r.omitida OR r.sino IS NOT NULL))
        WHEN 'dual_texto' THEN
          EXISTS (SELECT 1 FROM relevamiento_respuestas r WHERE r.cliente_id = p_cliente AND r.pregunta_id = p.id AND r.omitida)
          OR (SELECT count(*) FROM relevamiento_respuestas r WHERE r.cliente_id = p_cliente AND r.pregunta_id = p.id
                AND r.columna IN ('mensuales','jornales') AND length(btrim(coalesce(r.texto,''))) > 0) = 2
        WHEN 'dual_sino' THEN
          EXISTS (SELECT 1 FROM relevamiento_respuestas r WHERE r.cliente_id = p_cliente AND r.pregunta_id = p.id AND r.omitida)
          OR (SELECT count(*) FROM relevamiento_respuestas r WHERE r.cliente_id = p_cliente AND r.pregunta_id = p.id
                AND r.columna IN ('mensuales','jornales') AND r.sino IS NOT NULL) = 2
        ELSE EXISTS (SELECT 1 FROM relevamiento_respuestas r WHERE r.cliente_id = p_cliente AND r.pregunta_id = p.id AND r.confirmado)
      END)
  ORDER BY p.seccion, p.orden;

  -- Detalle de la empresa principal
  SELECT * INTO e FROM cliente_empresas WHERE cliente_id = p_cliente AND es_principal LIMIT 1;
  IF e.id IS NULL OR e.cant_legajos IS NULL OR e.modalidad_pago IS NULL
     OR (e.modalidad_pago = 'mixto' AND e.pct_quincenal IS NULL) THEN
    RETURN QUERY SELECT 'empresa_detalle'::text, 'Detalle de tu empresa'::text, 'faltan datos'::text;
  END IF;
END $$;

REVOKE ALL ON FUNCTION relevamiento_faltantes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION relevamiento_faltantes(uuid) TO authenticated;

-- ── 9) Guardar una respuesta (RPC del cliente) ───────────────────────
CREATE OR REPLACE FUNCTION portal_guardar_respuesta(
  p_clave      text,
  p_columna    text    DEFAULT 'unica',
  p_sino       text    DEFAULT NULL,
  p_texto      text    DEFAULT NULL,
  p_omitida    boolean DEFAULT false,
  p_motivo     text    DEFAULT NULL,
  p_confirmado boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cli uuid := portal_cliente_id();
  v_p   relevamiento_preguntas%ROWTYPE;
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;
  IF EXISTS (SELECT 1 FROM relevamiento_aprobacion WHERE cliente_id = v_cli) THEN
    RAISE EXCEPTION 'El relevamiento ya fue aprobado. Escribinos si necesitás cambiar algo.';
  END IF;

  SELECT * INTO v_p FROM relevamiento_preguntas WHERE clave = p_clave AND activa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pregunta inexistente'; END IF;

  IF p_columna NOT IN ('unica','mensuales','jornales') THEN RAISE EXCEPTION 'Columna inválida'; END IF;
  IF v_p.tipo IN ('dual_texto','dual_sino') AND p_columna = 'unica' THEN
    -- La omisión de una pregunta dual se guarda en la columna "mensuales" (vale para ambas)
    IF NOT p_omitida THEN RAISE EXCEPTION 'Indicá si es para Mensuales o Jornales'; END IF;
  END IF;
  IF p_sino IS NOT NULL AND p_sino NOT IN ('si','no') THEN RAISE EXCEPTION 'Respuesta inválida'; END IF;
  IF p_omitida AND NOT v_p.omitible THEN RAISE EXCEPTION 'Esta pregunta no se puede omitir'; END IF;
  IF p_omitida AND length(btrim(coalesce(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'Indicá el motivo de la omisión'; END IF;
  IF length(coalesce(p_texto,'')) > 4000 THEN RAISE EXCEPTION 'Respuesta demasiado larga'; END IF;

  INSERT INTO relevamiento_respuestas (cliente_id, pregunta_id, columna, sino, texto, omitida, motivo, confirmado, actualizado_por, updated_at)
  VALUES (v_cli, v_p.id,
          CASE WHEN p_omitida AND v_p.tipo IN ('dual_texto','dual_sino') THEN 'mensuales' ELSE p_columna END,
          p_sino, nullif(btrim(p_texto),''), p_omitida, CASE WHEN p_omitida THEN btrim(p_motivo) END,
          p_confirmado, 'Cliente (portal)', now())
  ON CONFLICT (cliente_id, pregunta_id, columna) DO UPDATE
    SET sino = EXCLUDED.sino, texto = EXCLUDED.texto, omitida = EXCLUDED.omitida,
        motivo = EXCLUDED.motivo, confirmado = EXCLUDED.confirmado,
        actualizado_por = EXCLUDED.actualizado_por, updated_at = now();
END $$;

REVOKE ALL ON FUNCTION portal_guardar_respuesta(text,text,text,text,boolean,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_guardar_respuesta(text,text,text,text,boolean,text,boolean) TO authenticated;

-- ── 10) Aprobar el relevamiento (RPC del cliente) ────────────────────
CREATE OR REPLACE FUNCTION portal_aprobar_relevamiento(p_nombre text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cli  uuid := portal_cliente_id();
  v_falta text;
BEGIN
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Sin acceso al portal'; END IF;
  IF length(btrim(coalesce(p_nombre,''))) < 5 THEN
    RAISE EXCEPTION 'Indicá nombre y apellido de quien aprueba';
  END IF;
  IF EXISTS (SELECT 1 FROM relevamiento_aprobacion WHERE cliente_id = v_cli) THEN RETURN; END IF;

  SELECT string_agg(tema, ' · ') INTO v_falta FROM relevamiento_faltantes(v_cli);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Te falta completar: %', v_falta;
  END IF;

  INSERT INTO relevamiento_aprobacion (cliente_id, aprobado_por) VALUES (v_cli, btrim(p_nombre));
  PERFORM portal_registrar_novedad(v_cli, 'relevamiento_aprobado', btrim(p_nombre), NULL);
END $$;

REVOKE ALL ON FUNCTION portal_aprobar_relevamiento(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION portal_aprobar_relevamiento(text) TO authenticated;

-- ── 11) Novedad nueva para la campanita del equipo ───────────────────
ALTER TABLE portal_novedades DROP CONSTRAINT IF EXISTS portal_novedades_tipo_check;
ALTER TABLE portal_novedades ADD CONSTRAINT portal_novedades_tipo_check
  CHECK (tipo IN ('etapa_completada','empresa_cargada','empresa_editada','archivo_subido',
                  'usuarios_cargados','cantidad_empresas','relevamiento_aprobado'));

-- ── 12) prep_pasos: el paso 7 se completa al aprobar el relevamiento ─
CREATE OR REPLACE FUNCTION prep_pasos(p_cliente uuid)
RETURNS TABLE (paso integer, completo boolean, revision text, comentario text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e   cliente_empresas%ROWTYPE;
  v_prep portal_prep%ROWTYPE;
BEGIN
  IF p_cliente IS NULL OR NOT (is_team_member() OR p_cliente = portal_cliente_id()) THEN
    RETURN;
  END IF;

  SELECT * INTO e      FROM cliente_empresas WHERE cliente_id = p_cliente AND es_principal LIMIT 1;
  SELECT * INTO v_prep FROM portal_prep      WHERE cliente_id = p_cliente;

  RETURN QUERY
  WITH calc(paso, completo) AS (
    VALUES
      (1, e.id IS NOT NULL
          AND coalesce(btrim(e.razon_social),'') <> '' AND coalesce(btrim(e.cuit),'') <> ''
          AND coalesce(btrim(e.domicilio),'') <> ''    AND coalesce(btrim(e.tipo_empleador),'') <> ''
          AND e.cant_legajos IS NOT NULL),
      (2, e.id IS NOT NULL
          AND coalesce(btrim(e.obra_social),'') <> '' AND coalesce(btrim(e.art),'') <> ''
          AND coalesce(btrim(e.actividad_principal),'') <> '' AND coalesce(btrim(e.convenios),'') <> ''),
      (3, EXISTS (SELECT 1 FROM portal_usuarios_salario u WHERE u.cliente_id = p_cliente)),
      (4, e.id IS NOT NULL
          AND EXISTS (SELECT 1 FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'logo')
          AND EXISTS (SELECT 1 FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'firma')),
      (5, e.id IS NOT NULL
          AND (SELECT count(*) FROM cliente_documentos d WHERE d.cliente_id = p_cliente AND d.empresa_id = e.id AND d.origen = 'cliente' AND d.categoria = 'liquidacion') >= 2),
      (6, v_prep.empresas_declaradas IS NOT NULL),
      -- 7 Relevamiento: completo cuando el cliente lo aprobó
      (7, EXISTS (SELECT 1 FROM relevamiento_aprobacion a WHERE a.cliente_id = p_cliente)),
      -- 8 Reunión: se calcula en una migración siguiente
      (8, false)
  )
  SELECT c.paso, c.completo,
         CASE WHEN r.estado IS NOT NULL THEN r.estado
              WHEN c.completo AND c.paso IN (1,2,4,5) THEN 'en_revision'
              ELSE NULL END,
         r.comentario
  FROM calc c
  LEFT JOIN portal_prep_revision r ON r.cliente_id = p_cliente AND r.paso = c.paso
  ORDER BY c.paso;
END $$;

-- ── Verificación ─────────────────────────────────────────────────────
-- Debe dar: preguntas = 46 (40 consignas + 6 comentarios) y 10 bloques
SELECT count(*) AS preguntas,
       count(DISTINCT seccion) AS bloques,
       count(*) FILTER (WHERE tipo = 'comentario') AS comentarios
FROM relevamiento_preguntas;
