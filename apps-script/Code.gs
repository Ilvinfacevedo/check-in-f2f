/**
 * PROTOCOLO F2F · Check-in semanal → Google Sheets  (v2)
 *
 * Crea y mantiene 4 pestañas con diseño:
 *   📊 Panel          resumen por cliente (se actualiza solo)
 *   👥 Clientes       tu lista de asesorados + enlace personal + botón de WhatsApp
 *   📋 Checkins       registro completo (aquí escribe la app)
 *   ⚙️ Configuración  clave del panel del coach, avisos por correo, enlace de la app
 *
 * Cómo instalar: ver SETUP.md. En resumen: pega este archivo en
 * Extensiones → Apps Script de TU hoja, ejecuta `setup` y despliega como Aplicación web.
 */

/* ======================= Ajustes fijos ======================= */
var TZ = 'America/Santo_Domingo';
var APP_URL_DEFAULT = 'https://ilvinfacevedo.github.io/check-in-f2f/';
var MAX_CLIENTES = 60; // filas preparadas en el Panel

var S = { panel: '📊 Panel', clientes: '👥 Clientes', checkins: '📋 Checkins', config: '⚙️ Configuración' };

var C = { // paleta de marca
  ink: '#0e0e0d', surface: '#191917', surface2: '#24241f', line: '#3a3a35',
  red: '#e13a2e', redSoft: '#fbe4e1', text: '#1d1d1b', muted: '#6b6860',
  white: '#ffffff', zebra: '#f7f5f0', ok: '#d9f2e3', okInk: '#14663a',
  warn: '#fff1d6', warnInk: '#8a5a00', bad: '#fde0dc', badInk: '#a3231a'
};

var HEADERS = [
  'Fecha', 'Semana', 'Año', 'Nombre',
  'Dieta', 'Entreno', 'Sesiones',
  'Sueño (h)', 'Calidad sueño',
  'Digestión', 'Digestión (nota)',
  'Energía', 'Peso (lb)', 'Cintura (pulg)', 'Notas',
  'F2F Score', 'ID'
];
// Letras de columna en 📋 Checkins (para fórmulas)
var COL = { fecha: 'A', semana: 'B', nombre: 'D', dieta: 'E', entreno: 'F', sueno: 'H', energia: 'L', peso: 'M', cintura: 'N', score: 'P', id: 'Q' };

var CONFIG_ROWS = [
  ['Clave del panel del coach', 'cambia-esta-clave', 'La pides al abrir coach.html. Cámbiala por una tuya (mínimo 6 caracteres).'],
  ['Correo para avisos', '', 'Si lo dejas vacío se usa el correo dueño de esta hoja.'],
  ['Aviso por correo en cada check-in', false, 'Marca la casilla si quieres un correo cada vez que alguien envía su check-in.'],
  ['Recordatorio de los lunes', false, 'Marca la casilla y luego usa el menú F2F → Activar recordatorios. Te llega un correo con quién no ha enviado.'],
  ['Enlace de la app', APP_URL_DEFAULT, 'Base para los enlaces personales. Solo cámbialo si mueves la app de dirección.']
];

/* ======================= Web App ======================= */

/** La app envía aquí cada check-in. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var data = JSON.parse(e.postData.contents);
    if (!data || !data.nombre) return json_({ ok: false, error: 'Datos incompletos' });

    var sh = ensureCheckins_();
    if (data.id && sh.getLastRow() > 1) {
      var dup = sh.getRange(2, HEADERS.length, sh.getLastRow() - 1, 1)
        .createTextFinder(String(data.id)).matchEntireCell(true).findNext();
      if (dup) return json_({ ok: true, duplicate: true });
    }

    var fecha = data.fecha ? new Date(data.fecha) : new Date();
    var wk = isoWeek_(fecha);
    var nombre = cleanName_(data.nombre);
    sh.appendRow([
      fecha, data.semana || wk.week, data.anio || wk.year, safe_(nombre),
      num_(data.dieta), num_(data.entreno), num_(data.sesiones),
      num_(data.suenoHoras), safe_(data.suenoCalidad),
      safe_(data.digestion), safe_(data.digestionNota),
      num_(data.energia), num_(data.peso), num_(data.cintura), safe_(data.notas),
      num_(data.score), safe_(data.id)
    ]);
    addClienteSiNoExiste_(nombre);
    avisoCorreo_(data, nombre);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * GET sin parámetros → comprobar que está activo.
 * GET ?accion=datos&clave=XXX → datos para el panel del coach (coach.html).
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (p.accion !== 'datos') {
    return json_({ ok: true, app: 'Protocolo F2F · Check-in', version: 2, hoja: ss ? ss.getName() : null });
  }
  var cfg = getConfig_();
  var clave = String(cfg['Clave del panel del coach'] || '');
  if (!clave || clave === 'cambia-esta-clave' || clave.length < 6) {
    return json_({ ok: false, error: 'Configura tu clave en la pestaña ⚙️ Configuración de la hoja.' });
  }
  if (String(p.clave || '') !== clave) {
    Utilities.sleep(800); // frena intentos a ciegas
    return json_({ ok: false, error: 'Clave incorrecta' });
  }
  return json_({ ok: true, generado: new Date().toISOString(), checkins: leerCheckins_(), clientes: leerClientes_() });
}

/* ======================= Instalación y diseño ======================= */

/** Ejecuta esta función UNA vez desde el editor (botón ▶). Crea y diseña todo. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Este script debe crearse DESDE tu hoja: Extensiones → Apps Script.');
  ss.setSpreadsheetTimeZone(TZ);
  ss.setSpreadsheetLocale('es_419');
  ss.setRecalculationInterval(SpreadsheetApp.RecalculationInterval.HOUR); // "Días" siempre al día
  migrarNombresViejos_(ss);
  ensureConfig_();
  ensureClientes_();
  ensureCheckins_();
  disenarCheckins_();
  construirPanel_();
  // orden de pestañas
  [S.panel, S.clientes, S.checkins, S.config].forEach(function (n, i) {
    ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1);
  });
  // borra "Hoja 1" si está vacía
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (n) {
    var h = ss.getSheetByName(n);
    if (h && h.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h);
  });
  ss.setActiveSheet(ss.getSheetByName(S.panel));
}

/** Menú "F2F" dentro de la hoja. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('F2F')
    .addItem('🎨 Reaplicar diseño', 'setup')
    .addItem('⏰ Activar recordatorios de los lunes', 'activarRecordatorios')
    .addItem('🔕 Desactivar recordatorios', 'desactivarRecordatorios')
    .addSeparator()
    .addItem('✉️ Probar correo de recordatorio', 'recordatorioSemanal')
    .addToUi();
}

function migrarNombresViejos_(ss) {
  var vieja = ss.getSheetByName('Checkins');
  if (vieja && !ss.getSheetByName(S.checkins)) vieja.setName(S.checkins);
}

function ensureCheckins_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(S.checkins) || ss.getSheetByName('Checkins');
  if (!sh) sh = ss.insertSheet(S.checkins);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return sh;
  }
  // Migración: inserta columnas nuevas (p. ej. Cintura) en su sitio si faltan
  var head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  var aliases = { 'Dieta (1-10)': 'Dieta', 'Entreno (1-10)': 'Entreno', 'Sueño (h/noche)': 'Sueño (h)', 'Energía (1-5)': 'Energía' };
  head = head.map(function (h) { return aliases[h] || h; });
  for (var i = 0; i < HEADERS.length; i++) {
    if (head[i] !== HEADERS[i] && head.indexOf(HEADERS[i]) === -1) {
      sh.insertColumnBefore(i + 1);
      head.splice(i, 0, HEADERS[i]);
    }
  }
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  return sh;
}

function disenarCheckins_() {
  var sh = ensureCheckins_();
  var n = HEADERS.length;
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
  if (sh.getMaxRows() < 500) sh.insertRowsAfter(sh.getMaxRows(), 500 - sh.getMaxRows());
  var rows = sh.getMaxRows();

  sh.setHiddenGridlines(true);
  sh.getRange(1, 1, rows, n).setFontFamily('Barlow').setFontSize(10).setVerticalAlignment('middle').setFontColor(C.text);
  header_(sh.getRange(1, 1, 1, n));
  sh.setRowHeight(1, 38);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(4);

  var widths = [120, 62, 52, 150, 62, 70, 72, 74, 96, 170, 200, 66, 74, 92, 320, 82, 90];
  widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  var body = function (col) { return sh.getRange(col + '2:' + col + rows); };
  body('A').setNumberFormat('dd/MM/yyyy  HH:mm');
  ['B', 'C', 'E', 'F', 'G', 'L', 'P'].forEach(function (c) { body(c).setHorizontalAlignment('center').setNumberFormat('0'); });
  ['H', 'M', 'N'].forEach(function (c) { body(c).setHorizontalAlignment('center').setNumberFormat('0.0'); });
  body('I').setHorizontalAlignment('center');
  body('D').setFontWeight('bold');
  ['J', 'K', 'O'].forEach(function (c) { body(c).setWrap(true); });
  body('P').setFontWeight('bold').setFontSize(11);
  body('Q').setFontColor('#a8a49a').setFontSize(8);

  // franjas alternas
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange(1, 1, rows, n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(C.ink).setFirstRowColor(C.white).setSecondRowColor(C.zebra);

  // colores condicionales
  var rules = [];
  var scale = function (col, min, mid, max) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue(C.bad, SpreadsheetApp.InterpolationType.NUMBER, String(min))
      .setGradientMidpointWithValue('#fff6e0', SpreadsheetApp.InterpolationType.NUMBER, String(mid))
      .setGradientMaxpointWithValue(C.ok, SpreadsheetApp.InterpolationType.NUMBER, String(max))
      .setRanges([body(col)]).build());
  };
  scale('E', 1, 6, 10); scale('F', 1, 6, 10); scale('L', 1, 3, 5); scale('P', 35, 65, 95);
  rules.push(cfText_('Mala', C.bad, C.badInk, body('I')));
  rules.push(cfText_('Buena', C.ok, C.okInk, body('I')));
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(6).setFontColor(C.badInk).setBold(true).setRanges([body('H')]).build());
  sh.setConditionalFormatRules(rules);

  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), n).createFilter();
}

function ensureClientes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(S.clientes) || ss.insertSheet(S.clientes);
  var heads = ['Nombre', 'WhatsApp (con 1 delante)', 'Estado', 'Fecha de inicio', 'Objetivo', 'Peso inicial (lb)', 'Enlace personal', 'Mandarle su enlace'];
  var n = heads.length;
  var first = sh.getLastRow() === 0;
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  if (sh.getMaxRows() < 200) sh.insertRowsAfter(sh.getMaxRows(), 200 - sh.getMaxRows());
  var rows = sh.getMaxRows();

  sh.setHiddenGridlines(true);
  sh.getRange(1, 1, rows, n).setFontFamily('Barlow').setFontSize(11).setVerticalAlignment('middle').setFontColor(C.text);
  titulo_(sh, 'CLIENTES', 'Escribe aquí a cada asesorado. El enlace personal y el botón de WhatsApp se crean solos.', n);
  sh.getRange(3, 1, 1, n).setValues([heads]);
  header_(sh.getRange(3, 1, 1, n));
  sh.setRowHeight(3, 36);
  sh.setFrozenRows(3);
  [170, 150, 100, 120, 200, 110, 330, 150].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  var r0 = 4, len = rows - 3;
  sh.getRange(r0, 1, len, 1).setFontWeight('bold');
  sh.getRange(r0, 2, len, 1).setNumberFormat('@');
  sh.getRange(r0, 3, len, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Activo', 'Pausado', 'Terminado'], true).setAllowInvalid(false).build()).setHorizontalAlignment('center');
  sh.getRange(r0, 4, len, 1).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
  sh.getRange(r0, 6, len, 1).setNumberFormat('0.0').setHorizontalAlignment('center');
  sh.getRange(r0, 7, len, 1).setFontColor(C.muted).setFontSize(9);
  sh.getRange(r0, 8, len, 1).setHorizontalAlignment('center').setFontWeight('bold').setFontColor(C.red);

  // Fórmulas automáticas (una sola por columna, se extienden solas)
  var base = "'" + S.config + "'!$B$8";
  sh.getRange('G4').setFormula('=ARRAYFORMULA(IF(A4:A="", "", ' + base + ' & "?c=" & ENCODEURL(TRIM(A4:A))))');
  sh.getRange('H4').setFormula('=ARRAYFORMULA(IF((A4:A="")+(B4:B=""), IF(A4:A="", "", "← pon su WhatsApp"), HYPERLINK("https://wa.me/" & REGEXREPLACE(B4:B & "", "[^0-9]", "") & "?text=" & ENCODEURL("¡Hola " & A4:A & "! 💪 Este es tu enlace para el check-in semanal de Protocolo F2F. Llénalo cada domingo, toma menos de 1 minuto: " & G4:G), "📲 Enviar")))');
  sh.getRange(5, 7, len - 1, 2).clearContent();

  var rules = [
    cfText_('Activo', C.ok, C.okInk, sh.getRange(r0, 3, len, 1)),
    cfText_('Pausado', C.warn, C.warnInk, sh.getRange(r0, 3, len, 1)),
    cfText_('Terminado', '#ececea', C.muted, sh.getRange(r0, 3, len, 1))
  ];
  sh.setConditionalFormatRules(rules);
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange(3, 1, rows - 2, n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(C.ink).setFirstRowColor(C.white).setSecondRowColor(C.zebra);
  if (first || !sh.getRange('A4').getValue()) {
    sh.getRange('A4:F4').setValues([['Francis', '', 'Activo', new Date(), 'Ganar masa muscular', '']]);
  }
  return sh;
}

function addClienteSiNoExiste_(nombre) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(S.clientes);
  if (!sh || !nombre) return;
  var last = Math.max(sh.getLastRow(), 4);
  var names = sh.getRange(4, 1, last - 3, 1).getValues().map(function (r) { return String(r[0]).trim().toLowerCase(); });
  if (names.indexOf(nombre.toLowerCase()) > -1) return;
  var row = 4;
  while (row - 4 < names.length && names[row - 4] !== '') row++;
  sh.getRange(row, 1, 1, 4).setValues([[nombre, '', 'Activo', new Date()]]);
}

function construirPanel_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(S.panel) || ss.insertSheet(S.panel);
  sh.clear(); sh.clearConditionalFormatRules();
  sh.getBandings().forEach(function (b) { b.remove(); });
  var heads = ['Cliente', 'Último check-in', 'Días', 'Estado', 'F2F Score', 'Prom. 4 sem.', 'Evolución del score', 'Dieta prom.', 'Entreno prom.', 'Peso actual', 'Cambio de peso', 'Check-ins'];
  var n = heads.length, rows = MAX_CLIENTES + 4;
  if (sh.getMaxColumns() > n) sh.deleteColumns(n + 1, sh.getMaxColumns() - n);
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());

  sh.setHiddenGridlines(true);
  sh.getRange(1, 1, sh.getMaxRows(), n).setFontFamily('Barlow').setFontSize(11).setVerticalAlignment('middle').setFontColor(C.text);
  titulo_(sh, 'PANEL DEL COACH', 'Se actualiza solo con cada check-in. Clientes en estado "Activo" de la pestaña 👥 Clientes.', n);
  sh.getRange(3, 1, 1, n).setValues([heads]);
  header_(sh.getRange(3, 1, 1, n));
  sh.setRowHeight(3, 36);
  sh.setFrozenRows(3); sh.setFrozenColumns(1);
  [170, 130, 56, 130, 86, 96, 190, 86, 96, 92, 112, 80].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  var CK = "'" + S.checkins + "'!";
  var CL = "'" + S.clientes + "'!";
  var col = function (k) { return CK + '$' + COL[k] + '$2:$' + COL[k]; };
  sh.getRange('A4').setFormula('=IFERROR(FILTER(' + CL + 'A4:A, ' + CL + 'A4:A<>"", ' + CL + 'C4:C="Activo"), "")');

  var f = [];
  for (var r = 4; r < 4 + MAX_CLIENTES; r++) {
    var who = col('nombre') + '=$A' + r;
    var data = function (k) { return 'FILTER({' + col('fecha') + ',' + col(k) + '}, ' + who + ', ' + col(k) + '<>"")'; };
    var last4 = function (k) { return 'AVERAGE(INDEX(ARRAY_CONSTRAIN(SORT(' + data(k) + ',1,FALSE),4,2),0,2))'; };
    f.push([
      '=IF($A' + r + '="","",IFERROR(1/(1/MAXIFS(' + col('fecha') + ',' + col('nombre') + ',$A' + r + ')),"—"))',
      '=IF(OR($A' + r + '="",B' + r + '="—"),"",INT(NOW()-B' + r + '))',
      '=IF($A' + r + '="","",IF(B' + r + '="—","⏳ Sin check-in",IF(C' + r + '>8,"🔴 Atrasado",IF(C' + r + '>=6,"🟡 Toca ya","🟢 Al día"))))',
      '=IF($A' + r + '="","",IFERROR(INDEX(SORT(' + data('score') + ',1,FALSE),1,2),""))',
      '=IF($A' + r + '="","",IFERROR(ROUND(' + last4('score') + ',0),""))',
      '=IF($A' + r + '="","",IFERROR(SPARKLINE(INDEX(SORT(' + data('score') + ',1,TRUE),0,2),{"charttype","line";"color","' + C.red + '";"linewidth",2;"ymin",0;"ymax",100}),""))',
      '=IF($A' + r + '="","",IFERROR(ROUND(' + last4('dieta') + ',1),""))',
      '=IF($A' + r + '="","",IFERROR(ROUND(' + last4('entreno') + ',1),""))',
      '=IF($A' + r + '="","",IFERROR(INDEX(SORT(' + data('peso') + ',1,FALSE),1,2),""))',
      '=IF(OR($A' + r + '="",J' + r + '=""),"",IFERROR(J' + r + '-INDEX(SORT(' + data('peso') + ',1,TRUE),1,2),""))',
      '=IF($A' + r + '="","",COUNTIF(' + col('nombre') + ',$A' + r + '))'
    ]);
  }
  sh.getRange(4, 2, MAX_CLIENTES, 11).setFormulas(f);

  var R = function (a1) { return sh.getRange(a1); };
  var last = 3 + MAX_CLIENTES;
  sh.setRowHeights(4, MAX_CLIENTES, 34);
  R('A4:A' + last).setFontWeight('bold');
  R('B4:B' + last).setNumberFormat('dd/MM/yyyy').setHorizontalAlignment('center');
  R('C4:F' + last).setHorizontalAlignment('center');
  R('E4:E' + last).setFontWeight('bold').setFontSize(13).setNumberFormat('0');
  R('F4:F' + last).setNumberFormat('0');
  R('H4:J' + last).setHorizontalAlignment('center').setNumberFormat('0.0');
  R('K4:K' + last).setHorizontalAlignment('center').setNumberFormat('+0.0" lb";-0.0" lb";"0 lb"');
  R('L4:L' + last).setHorizontalAlignment('center').setFontColor(C.muted);

  sh.getRange(3, 1, MAX_CLIENTES + 1, n).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(C.ink).setFirstRowColor(C.white).setSecondRowColor(C.zebra);

  var rules = [
    cfContains_('Al día', C.ok, C.okInk, R('D4:D' + last)),
    cfContains_('Toca ya', C.warn, C.warnInk, R('D4:D' + last)),
    cfContains_('Atrasado', C.bad, C.badInk, R('D4:D' + last)),
    SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue(C.bad, SpreadsheetApp.InterpolationType.NUMBER, '35')
      .setGradientMidpointWithValue('#fff6e0', SpreadsheetApp.InterpolationType.NUMBER, '65')
      .setGradientMaxpointWithValue(C.ok, SpreadsheetApp.InterpolationType.NUMBER, '95')
      .setRanges([R('E4:F' + last)]).build()
  ];
  sh.setConditionalFormatRules(rules);
}

function ensureConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(S.config) || ss.insertSheet(S.config);
  sh.setHiddenGridlines(true);
  if (sh.getMaxColumns() > 3) sh.deleteColumns(4, sh.getMaxColumns() - 3);
  sh.getRange(1, 1, sh.getMaxRows(), 3).setFontFamily('Barlow').setFontSize(11).setVerticalAlignment('middle').setFontColor(C.text);
  titulo_(sh, 'CONFIGURACIÓN', 'Cambia solo la columna B. Todo lo demás funciona solo.', 3);
  sh.getRange('A3:C3').setValues([['Ajuste', 'Valor', 'Para qué sirve']]);
  header_(sh.getRange('A3:C3'));
  [260, 330, 520].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

  var current = getConfig_();
  CONFIG_ROWS.forEach(function (row, i) {
    var r = 4 + i;
    var val = current.hasOwnProperty(row[0]) && current[row[0]] !== '' ? current[row[0]] : row[1];
    sh.getRange(r, 1, 1, 3).setValues([[row[0], val, row[2]]]);
    sh.setRowHeight(r, 40);
    if (typeof row[1] === 'boolean') sh.getRange(r, 2).insertCheckboxes().setValue(val === true);
  });
  sh.getRange('A4:A8').setFontWeight('bold');
  sh.getRange('B4:B8').setBackground('#fffaf0').setBorder(true, true, true, true, true, true, '#e5dccb', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange('C4:C8').setFontColor(C.muted).setWrap(true);

  sh.getRange('A11').setValue('CÓMO SE USA').setFontWeight('bold').setFontColor(C.red).setFontSize(12);
  var guia = [
    ['1. Agrega cada asesorado en 👥 Clientes (nombre + WhatsApp). El enlace personal se crea solo.'],
    ['2. Toca "📲 Enviar" en su fila para mandarle el enlace por WhatsApp con el mensaje listo.'],
    ['3. Cada check-in llega a 📋 Checkins y el 📊 Panel se actualiza solo.'],
    ['4. Para ver las gráficas por cliente abre coach.html (dirección de tu app + coach.html) y escribe tu clave.'],
    ['5. Si un día la hoja se ve desordenada: menú F2F → 🎨 Reaplicar diseño. No borra datos.'],
    ['⚠️ No cambies el orden ni los nombres de las columnas de 📋 Checkins.']
  ];
  sh.getRange(12, 1, guia.length, 1).setValues(guia).setWrap(false);
}

/* ======================= Correo ======================= */

function avisoCorreo_(d, nombre) {
  try {
    var cfg = getConfig_();
    if (cfg['Aviso por correo en cada check-in'] !== true) return;
    var to = cfg['Correo para avisos'] || Session.getEffectiveUser().getEmail();
    var body = [
      'Dieta: ' + d.dieta + '/10', 'Entreno: ' + d.entreno + '/10' + (d.sesiones != null ? ' (' + d.sesiones + ' sesiones)' : ''),
      'Sueño: ' + d.suenoHoras + ' h · ' + d.suenoCalidad, 'Digestión: ' + d.digestion + (d.digestionNota ? ' — ' + d.digestionNota : ''),
      'Energía: ' + d.energia + '/5', 'Peso: ' + (d.peso != null ? d.peso + ' lb' : '—') + (d.cintura != null ? ' · Cintura: ' + d.cintura + ' pulg' : ''),
      'F2F Score: ' + d.score, d.notas ? '\nNota: ' + d.notas : ''
    ].join('\n');
    MailApp.sendEmail(to, '📋 Check-in de ' + nombre + ' · Score ' + d.score, body + '\n\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  } catch (e) { /* un fallo de correo nunca bloquea el registro */ }
}

function activarRecordatorios() {
  desactivarRecordatorios();
  ScriptApp.newTrigger('recordatorioSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).inTimezone(TZ).create();
  var cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(S.config);
  if (cfg) cfg.getRange('B7').setValue(true);
  toast_('Listo: cada lunes a las 9 a. m. te llega un correo con quién no ha enviado su check-in.');
}

function desactivarRecordatorios() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'recordatorioSemanal') ScriptApp.deleteTrigger(t);
  });
  var cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(S.config);
  if (cfg) cfg.getRange('B7').setValue(false);
}

function recordatorioSemanal() {
  var cfg = getConfig_();
  var to = cfg['Correo para avisos'] || Session.getEffectiveUser().getEmail();
  var checkins = leerCheckins_();
  var lastBy = {};
  checkins.forEach(function (c) { var k = c.nombre.toLowerCase(); if (!lastBy[k] || c.fecha > lastBy[k]) lastBy[k] = c.fecha; });
  var pendientes = leerClientes_().filter(function (c) {
    if (c.estado !== 'Activo') return false;
    var l = lastBy[c.nombre.toLowerCase()];
    return !l || (Date.now() - new Date(l).getTime()) > 6 * 86400000;
  });
  var body = pendientes.length
    ? 'Estos clientes no han enviado su check-in en la última semana:\n\n' + pendientes.map(function (c) {
        return '• ' + c.nombre + (c.whatsapp ? '  →  https://wa.me/' + c.whatsapp.replace(/\D/g, '') : '');
      }).join('\n')
    : '¡Todos tus clientes activos enviaron su check-in! 🔥';
  MailApp.sendEmail(to, 'F2F · Check-ins pendientes (' + pendientes.length + ')', body + '\n\n' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  toast_('Correo enviado a ' + to);
}

/* ======================= Lectura de datos ======================= */

function leerCheckins_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(S.checkins);
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
  return v.filter(function (r) { return r[3]; }).map(function (r) {
    return {
      fecha: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), semana: r[1], anio: r[2], nombre: String(r[3]).trim(),
      dieta: n_(r[4]), entreno: n_(r[5]), sesiones: n_(r[6]), suenoHoras: n_(r[7]), suenoCalidad: r[8],
      digestion: r[9], digestionNota: r[10], energia: n_(r[11]), peso: n_(r[12]), cintura: n_(r[13]), notas: r[14], score: n_(r[15])
    };
  });
}

function leerClientes_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(S.clientes);
  if (!sh || sh.getLastRow() < 4) return [];
  return sh.getRange(4, 1, sh.getLastRow() - 3, 7).getValues().filter(function (r) { return r[0]; }).map(function (r) {
    return {
      nombre: String(r[0]).trim(), whatsapp: String(r[1]), estado: r[2] || 'Activo',
      inicio: r[3] instanceof Date ? r[3].toISOString() : '', objetivo: r[4], pesoInicial: n_(r[5]), enlace: r[6]
    };
  });
}

function getConfig_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(S.config);
  var out = {};
  if (!sh || sh.getLastRow() < 4) return out;
  sh.getRange(4, 1, Math.min(sh.getLastRow() - 3, 20), 2).getValues().forEach(function (r) { if (r[0]) out[String(r[0])] = r[1]; });
  return out;
}

/* ======================= Utilidades ======================= */

function titulo_(sh, title, sub, ncols) {
  sh.setFrozenColumns(0); // no se puede combinar celdas sobre columnas congeladas
  sh.getRange(1, 1, 2, ncols).setBackground(C.ink).breakApart();
  sh.getRange(1, 1, 1, ncols).merge().setValue('PROTOCOLO F2F  ·  ' + title)
    .setFontFamily('Bebas Neue').setFontSize(22).setFontColor(C.white).setVerticalAlignment('bottom');
  sh.getRange(2, 1, 1, ncols).merge().setValue(sub)
    .setFontFamily('Barlow').setFontSize(10).setFontColor('#b9b5ab').setVerticalAlignment('top');
  sh.setRowHeight(1, 44); sh.setRowHeight(2, 26);
  sh.getRange(2, 1, 1, ncols).setBorder(null, null, true, null, null, null, C.red, SpreadsheetApp.BorderStyle.SOLID_THICK);
}

function header_(range) {
  range.setBackground(C.ink).setFontColor(C.white).setFontWeight('bold').setFontSize(10)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true)
    .setBorder(null, null, true, null, null, null, C.red, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

function cfText_(txt, bg, ink, range) {
  return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(txt).setBackground(bg).setFontColor(ink).setBold(true).setRanges([range]).build();
}
function cfContains_(txt, bg, ink, range) {
  return SpreadsheetApp.newConditionalFormatRule().whenTextContains(txt).setBackground(bg).setFontColor(ink).setBold(true).setRanges([range]).build();
}

function toast_(msg) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'F2F', 6); } catch (e) {}
}

function isoWeek_(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((date - yearStart) / 86400000 + 1) / 7), year: date.getUTCFullYear() };
}

function cleanName_(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Evita que un texto que empiece con = + - @ se interprete como fórmula. */
function safe_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).slice(0, 1500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function num_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}
function n_(v) { return v === '' || v === null || isNaN(Number(v)) ? null : Number(v); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
