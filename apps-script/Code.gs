/**
 * PROTOCOLO F2F · Check-in semanal → Google Sheets
 *
 * Pega este archivo completo en Extensiones → Apps Script de tu hoja
 * y despliégalo como "Aplicación web" (ver SETUP.md).
 */

var SHEET_NAME = 'Checkins';
var TIMEZONE = 'America/Santo_Domingo';

var HEADERS = [
  'Fecha', 'Semana', 'Año', 'Nombre',
  'Dieta (1-10)', 'Entreno (1-10)', 'Sesiones',
  'Sueño (h/noche)', 'Calidad sueño',
  'Digestión', 'Digestión (nota)',
  'Energía (1-5)', 'Peso (lb)', 'Notas',
  'F2F Score', 'ID'
];

/** Recibe cada check-in desde la app. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var data = JSON.parse(e.postData.contents);
    if (!data || !data.nombre) return json_({ ok: false, error: 'Datos incompletos' });

    var sheet = getSheet_();

    // Evita filas duplicadas si la app reintenta el mismo envío.
    var idCol = HEADERS.length;
    if (data.id && sheet.getLastRow() > 1) {
      var found = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1)
        .createTextFinder(String(data.id)).matchEntireCell(true).findNext();
      if (found) return json_({ ok: true, duplicate: true });
    }

    var fecha = data.fecha ? new Date(data.fecha) : new Date();
    var week = isoWeek_(fecha);

    sheet.appendRow([
      fecha,
      data.semana || week.week,
      data.anio || week.year,
      safe_(data.nombre),
      num_(data.dieta),
      num_(data.entreno),
      num_(data.sesiones),
      num_(data.suenoHoras),
      safe_(data.suenoCalidad),
      safe_(data.digestion),
      safe_(data.digestionNota),
      num_(data.energia),
      num_(data.peso),
      safe_(data.notas),
      num_(data.score),
      safe_(data.id)
    ]);
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('dd/MM/yyyy HH:mm');

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Abre la URL /exec en el navegador para comprobar que está activo. */
function doGet() {
  return json_({ ok: true, app: 'Protocolo F2F · Check-in', hoja: SHEET_NAME });
}

/** Ejecuta esta función una vez desde el editor para crear la hoja y dar permisos. */
function setup() {
  getSheet_();
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TIMEZONE);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold').setBackground('#191917').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 130);
    sheet.setColumnWidth(14, 320);
  }
  return sheet;
}

function isoWeek_(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((date - yearStart) / 86400000 + 1) / 7), year: date.getUTCFullYear() };
}

/** Evita que un texto que empiece con = + - @ se interprete como fórmula. */
function safe_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).slice(0, 1000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function num_(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
