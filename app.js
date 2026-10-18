/* =========================================================
   PROTOCOLO F2F · Check-in semanal
   JS sin dependencias: navegación tipo story, borrador en
   localStorage, F2F Score, envío a Google Sheets con cola de
   reintentos y resumen por WhatsApp.
   ========================================================= */
(function () {
  "use strict";

  var CONFIG = window.F2F_CONFIG || {};
  var DRAFT_KEY = "f2f-checkin-draft-v1";
  var QUEUE_KEY = "f2f-checkin-queue-v1";
  var LAST_STEP = 8; // resumen
  var DONE_STEP = 9;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Iconos (trazos de Lucide, ISC) ---------- */
  var ICONS = {
    arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    dumbbell: '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
    pen: '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    rotate: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    cloudOff: '<path d="m2 2 20 20"/><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"/><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"/>',
    frown: '<circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
    meh: '<circle cx="12" cy="12" r="10"/><line x1="8" x2="16" y1="15" y2="15"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  };
  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || "") + "</svg>";
  }
  function paintIcons(root) {
    (root || document).querySelectorAll("i[data-icon]").forEach(function (el) {
      var tmp = document.createElement("span");
      tmp.innerHTML = icon(el.getAttribute("data-icon"));
      var svg = tmp.firstChild;
      if (el.id) svg.id = el.id;
      el.replaceWith(svg);
    });
  }

  /* ---------- Utilidades ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  function isoWeek(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return { week: Math.ceil(((date - yearStart) / 86400000 + 1) / 7), year: date.getUTCFullYear() };
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function cleanName(s) {
    s = String(s || "").replace(/\s+/g, " ").trim().slice(0, 40);
    return s.replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
  }

  function fmtHours(h) { return String(h).replace(/\.0$/, ""); }

  function parseWeight(s) {
    s = String(s || "").replace(",", ".").replace(/[^\d.]/g, "");
    var n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n * 10) / 10;
  }

  /* ---------- Estado ---------- */
  var blank = function () {
    return {
      name: "", diet: null, train: null, sessions: null,
      sleepH: null, sleepQ: null, digestion: [], digestionNote: "",
      energy: null, weight: "", notes: "",
    };
  };
  var state = blank();
  var step = 0;
  var lastPayload = null;

  var params = new URLSearchParams(location.search);
  var urlName = cleanName(params.get("c") || params.get("nombre") || "");

  function saveDraft() { store(DRAFT_KEY, { state: state, step: step, savedAt: Date.now() }); }

  /* ---------- F2F Score ---------- */
  // Dieta 35% · Entreno 30% · Sueño 20% · Energía 15%  →  0–100
  function sleepScore(h, q) {
    if (h == null) return 0;
    var hs;
    if (h >= 7 && h <= 9) hs = 100;
    else if (h < 7) hs = Math.max(0, 100 - (7 - h) * 25);
    else hs = 100 - (h - 9) * 15;
    var qs = { Mala: 40, Normal: 75, Buena: 100 }[q] || 0;
    return hs * 0.6 + qs * 0.4;
  }
  function computeScore(s) {
    var diet = (s.diet || 0) * 10;
    var train = (s.train || 0) * 10;
    var sleep = sleepScore(s.sleepH, s.sleepQ);
    var energy = (s.energy || 0) * 20;
    return Math.round(diet * 0.35 + train * 0.3 + sleep * 0.2 + energy * 0.15);
  }
  function scoreVerdict(n) {
    if (n >= 85) return "Semana de máquina. Así es que se construye.\u00a0🔥";
    if (n >= 70) return "Muy buena semana. Vamos a pulir los detalles.";
    if (n >= 50) return "Vamos bien. Hay espacio para apretar un poco más.";
    return "Semana difícil, pasa. Lo importante es que estás aquí. Ajustamos y seguimos.";
  }

  /* ---------- Rating (dieta / entreno) ---------- */
  function ratingTone(v) {
    if (v == null) return "var(--text-3)";
    if (v <= 4) return "var(--amber)";
    if (v <= 7) return "var(--text)";
    return "var(--red)";
  }
  function ratingVerdict(v) {
    if (v <= 4) return "Semana difícil";
    if (v <= 7) return "Vamos bien";
    return "¡Máquina!";
  }
  function setFill(range) {
    var min = +range.min, max = +range.max, v = +range.value;
    range.style.setProperty("--fill", ((v - min) / (max - min)) * 100 + "%");
  }

  function initRating(box) {
    var field = box.getAttribute("data-rating");
    var range = $(".range", box);
    var ticks = $(".ticks", box);
    for (var i = 1; i <= 10; i++) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tick"; b.textContent = i;
      b.setAttribute("data-value", i);
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", field === "diet" ? "Dieta " + i + " de 10" : "Entreno " + i + " de 10");
      ticks.appendChild(b);
    }
    var commit = function (v) {
      state[field] = v; range.value = v; renderRating(box); saveDraft(); clearErr();
    };
    range.addEventListener("input", function () { commit(+range.value); });
    range.addEventListener("pointerup", function () { commit(+range.value); });
    range.addEventListener("keyup", function () { commit(+range.value); });
    ticks.addEventListener("click", function (e) {
      var t = e.target.closest(".tick"); if (!t) return;
      commit(+t.getAttribute("data-value"));
      haptic();
    });
  }
  function renderRating(box) {
    var field = box.getAttribute("data-rating");
    var v = state[field];
    var range = $(".range", box), num = $(".rating__num", box);
    box.classList.toggle("is-untouched", v == null);
    box.style.setProperty("--tone", ratingTone(v));
    if (v != null) {
      if (num.textContent !== String(v)) bump(num);
      num.textContent = v;
      $(".rating__verdict", box).textContent = ratingVerdict(v);
      range.value = v;
      range.setAttribute("aria-valuetext", v + " de 10, " + ratingVerdict(v));
    } else {
      num.textContent = "–";
      $(".rating__verdict", box).textContent = "Desliza o toca un número";
    }
    setFill(range);
    $$(".tick", box).forEach(function (t) { t.setAttribute("aria-pressed", String(+t.getAttribute("data-value") === v)); });
  }
  function bump(el) {
    if (reduceMotion) return;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }

  /* ---------- Sueño ---------- */
  function sleepTone(h) {
    if (h == null) return "var(--text-3)";
    if (h < 6) return "var(--amber)";
    if (h < 7) return "var(--text)";
    if (h <= 9) return "var(--red)";
    return "var(--text)";
  }
  function sleepText(h) {
    if (h < 6) return "Te falta descanso";
    if (h < 7) return "Casi ahí";
    if (h <= 9) return "Zona de recuperación";
    return "Bastante descanso";
  }
  function initSleep() {
    var range = $("#sleepH");
    var commit = function () { state.sleepH = +range.value; renderSleep(); saveDraft(); clearErr(); };
    range.addEventListener("input", commit);
    range.addEventListener("pointerup", commit);
    range.addEventListener("keyup", commit);
  }
  function renderSleep() {
    var box = $("#sleepBox"), range = $("#sleepH"), num = $("#sleepNum"), h = state.sleepH;
    box.classList.toggle("is-untouched", h == null);
    box.style.setProperty("--tone", sleepTone(h));
    if (h != null) {
      var txt = fmtHours(h);
      if (num.textContent !== txt) bump(num);
      num.textContent = txt;
      $("#sleepVerdict").textContent = sleepText(h);
      range.value = h;
      range.setAttribute("aria-valuetext", txt + " horas por noche");
    } else {
      num.textContent = "–";
      $("#sleepVerdict").textContent = "Desliza para elegir";
    }
    setFill(range);
  }

  /* ---------- Selecciones simples / múltiples ---------- */
  function initSingles() {
    $$("[data-single]").forEach(function (group) {
      var field = group.getAttribute("data-single");
      var optional = field === "sessions";
      group.addEventListener("click", function (e) {
        var b = e.target.closest("[data-value]"); if (!b) return;
        var raw = b.getAttribute("data-value");
        var val = /^\d+$/.test(raw) ? +raw : raw;
        state[field] = optional && state[field] === val ? null : val; // en opcionales, tocar de nuevo deselecciona
        renderSingles(); saveDraft(); clearErr(); haptic();
        if (field === "energy" && state.energy != null) autoAdvance();
      });
    });
  }
  function renderSingles() {
    $$("[data-single]").forEach(function (group) {
      var field = group.getAttribute("data-single");
      $$("[data-value]", group).forEach(function (b) {
        var raw = b.getAttribute("data-value");
        var val = /^\d+$/.test(raw) ? +raw : raw;
        var on = state[field] === val;
        b.setAttribute(b.getAttribute("role") === "radio" ? "aria-checked" : "aria-pressed", String(on));
      });
    });
  }

  function initChips() {
    var group = $('[data-multi="digestion"]');
    group.addEventListener("click", function (e) {
      var b = e.target.closest(".chip"); if (!b) return;
      var v = b.getAttribute("data-value");
      var list = state.digestion.slice();
      var i = list.indexOf(v);
      if (i > -1) list.splice(i, 1);
      else if (v === "Sin problemas") list = [v];
      else { list = list.filter(function (x) { return x !== "Sin problemas"; }); list.push(v); }
      state.digestion = list;
      renderChips(); saveDraft(); clearErr(); haptic();
    });
  }
  function renderChips() {
    $$('[data-multi="digestion"] .chip').forEach(function (b) {
      b.setAttribute("aria-pressed", String(state.digestion.indexOf(b.getAttribute("data-value")) > -1));
    });
    var showMore = state.digestion.some(function (x) { return x !== "Sin problemas"; });
    $("#digestionMore").hidden = !showMore;
  }

  /* ---------- Campos de texto ---------- */
  function initTextFields() {
    $$("input[data-field]:not([type=range]), textarea[data-field]").forEach(function (el) {
      var f = el.getAttribute("data-field");
      el.addEventListener("input", function () {
        state[f] = el.value;
        if (f === "notes") $("#notesCount").textContent = el.value.length;
        if (f === "name") renderName();
        if (f === "weight" || f === "notes") renderChrome();
        saveDraft(); clearErr();
      });
    });
    $("#weight").addEventListener("input", function (e) {
      var el = e.target, v = el.value.replace(/[^\d.,]/g, "");
      if (v !== el.value) { el.value = v; state.weight = v; saveDraft(); renderChrome(); }
    });
    $("#changeName").addEventListener("click", function () {
      urlName = "";
      state.name = "";
      $("#name").value = "";
      renderName();
      $("#name").focus();
    });
  }
  function renderTextFields() {
    $("#name").value = state.name;
    $("#digestionNote").value = state.digestionNote;
    $("#weight").value = state.weight;
    $("#notes").value = state.notes;
    $("#notesCount").textContent = state.notes.length;
  }
  function renderName() {
    var n = cleanName(state.name);
    $$(".js-name").forEach(function (el) { el.textContent = n; });
    $(".js-name-wrap").textContent = n ? ", " + n : "";
    var fromUrl = !!urlName && n === urlName;
    $("#nameField").hidden = fromUrl;
    $("#notYou").hidden = !fromUrl;
  }

  /* ---------- Validación ---------- */
  var ERR = {
    0: function () { return cleanName(state.name).length < 2 ? "Escribe tu nombre para empezar." : ""; },
    1: function () { return state.diet == null ? "Elige un número del 1 al 10 para seguir." : ""; },
    2: function () { return state.train == null ? "Elige un número del 1 al 10 para seguir." : ""; },
    3: function () {
      if (state.sleepH == null) return "Mueve el slider para marcar tus horas de sueño.";
      if (!state.sleepQ) return "Dime cómo fue la calidad de tu sueño.";
      return "";
    },
    4: function () { return state.digestion.length ? "" : "Marca al menos una opción (o “Sin problemas”)."; },
    5: function () { return state.energy == null ? "Elige tu nivel de energía." : ""; },
    6: function () {
      if (!String(state.weight).trim()) return "";
      var w = parseWeight(state.weight);
      return w == null || w < 60 || w > 600 ? "Ese peso no se ve bien. Escríbelo en libras (ej.: 152) o déjalo vacío." : "";
    },
  };
  function validate(s) {
    var fn = ERR[s]; var msg = fn ? fn() : "";
    var screen = screenEl(s), err = $(".err", screen);
    if (msg) {
      err.textContent = msg;
      if (!reduceMotion) { err.classList.remove("shake"); void err.offsetWidth; err.classList.add("shake"); }
      haptic(30);
      return false;
    }
    err.textContent = "";
    return true;
  }
  function clearErr() { var e = $(".err", screenEl(step)); if (e) e.textContent = ""; }

  /* ---------- Navegación ---------- */
  function screenEl(s) { return $('.screen[data-step="' + s + '"]'); }

  function go(to, opts) {
    opts = opts || {};
    if (to < 0 || to > DONE_STEP) return;
    if (to > step && !opts.force) {
      for (var s = step; s < to; s++) if (!validate(s)) { if (s !== step) go(s, { force: true }); return; }
    }
    var from = step;
    step = to;
    $$(".screen").forEach(function (el) {
      var n = +el.getAttribute("data-step");
      el.classList.toggle("is-active", n === to);
      el.classList.toggle("is-before", n < to);
      el.setAttribute("aria-hidden", String(n !== to));
      if ("inert" in el) el.inert = n !== to;
    });
    var cur = screenEl(to);
    cur.scrollTop = 0;
    if (to === LAST_STEP) renderSummary();
    renderChrome();
    if (to !== DONE_STEP) saveDraft();
    if (from !== to && !opts.silent) {
      var h = $("h1, h2", cur);
      if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    }
  }
  function next() {
    if (step === LAST_STEP) return submit();
    if (step === 0) state.name = cleanName(state.name);
    go(step + 1);
  }
  function back() { if (step > 0 && step < DONE_STEP) go(step - 1); }

  var advanceTimer;
  function autoAdvance() {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(function () { if (step === 5) go(6); }, reduceMotion ? 150 : 650);
  }

  function renderChrome() {
    var pct = step >= LAST_STEP ? 100 : (step / LAST_STEP) * 100;
    $("#progressBar").style.width = pct + "%";
    $("#progress").setAttribute("aria-valuenow", Math.round(pct));
    var label = $("#stepLabel");
    if (step === 0) label.innerHTML = "Semana <b>" + isoWeek(new Date()).week + "</b>";
    else if (step < LAST_STEP) label.innerHTML = "<b>0" + step + "</b> / 07";
    else if (step === LAST_STEP) label.innerHTML = "<b>Resumen</b>";
    else label.innerHTML = "<b>Listo</b>";
    var nav = $("#nav");
    nav.hidden = step === DONE_STEP;
    nav.classList.toggle("is-first", step === 0);
    var nextLabel = $("#nextLabel"), nextIcon = $("#nextIcon");
    var lab = step === 0 ? "¡Vamos!" : step === LAST_STEP ? "Enviar check-in" : (step === 6 && !String(state.weight).trim()) || (step === 7 && !state.notes.trim()) ? "Saltar" : "Siguiente";
    nextLabel.textContent = lab;
    nextIcon.innerHTML = step === LAST_STEP ? ICONS.send : ICONS.arrowRight;
  }

  /* ---------- Resumen ---------- */
  function sessionsText(n) { return n == null ? "" : n === 1 ? "1 sesión" : n + " sesiones"; }

  function rows() {
    var w = parseWeight(state.weight);
    return [
      { icon: "utensils", k: "Dieta", v: state.diet + "/10", step: 1 },
      { icon: "dumbbell", k: "Entreno", v: state.train + "/10" + (state.sessions != null ? " · " + sessionsText(state.sessions) : ""), step: 2 },
      { icon: "moon", k: "Sueño", v: fmtHours(state.sleepH) + " h · " + state.sleepQ, step: 3 },
      { icon: "activity", k: "Digestión", v: state.digestion.join(", "), note: state.digestionNote.trim(), step: 4 },
      { icon: "zap", k: "Energía", v: state.energy + "/5", step: 5 },
      { icon: "scale", k: "Peso", v: w != null ? w + " lb" : "No registrado", muted: w == null, step: 6 },
      { icon: "pen", k: "Nota", v: state.notes.trim() ? "Sí" : "Sin nota", muted: !state.notes.trim(), note: state.notes.trim(), step: 7 },
    ];
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function renderSummary() {
    var html = rows().map(function (r) {
      return '<div class="summary__row">' + icon(r.icon) +
        "<dt>" + r.k + "</dt>" +
        '<dd class="' + (r.muted ? "muted" : "") + '">' + esc(r.v) + "</dd>" +
        '<button type="button" class="summary__edit" data-goto="' + r.step + '" aria-label="Editar ' + r.k.toLowerCase() + '">' + icon("pen") + "</button>" +
        (r.note ? '<p class="summary__note">“' + esc(r.note.length > 120 ? r.note.slice(0, 117) + "…" : r.note) + "”</p>" : "") +
        "</div>";
    }).join("");
    $("#summary").innerHTML = html;
    var score = computeScore(state);
    $("#scoreVerdict").textContent = scoreVerdict(score);
    animateScore(score);
  }

  function animateScore(score) {
    var ring = $("#ringFill"), num = $("#scoreNum");
    var C = 2 * Math.PI * 86;
    ring.style.transition = "none";
    ring.style.strokeDashoffset = C;
    void ring.getBoundingClientRect();
    ring.style.transition = "";
    requestAnimationFrame(function () { ring.style.strokeDashoffset = C * (1 - score / 100); });
    if (reduceMotion) { num.textContent = score; return; }
    var t0 = performance.now(), dur = 1400;
    (function tick(t) {
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      num.textContent = Math.round(score * e);
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  /* ---------- Envío ---------- */
  function buildPayload() {
    var now = new Date(), wk = isoWeek(now);
    var w = parseWeight(state.weight);
    return {
      id: uid(),
      fecha: now.toISOString(),
      fechaLocal: now.toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" }),
      semana: wk.week,
      anio: wk.year,
      nombre: cleanName(state.name),
      dieta: state.diet,
      entreno: state.train,
      sesiones: state.sessions,
      suenoHoras: state.sleepH,
      suenoCalidad: state.sleepQ,
      digestion: state.digestion.join(", "),
      digestionNota: state.digestionNote.trim(),
      energia: state.energy,
      peso: w,
      notas: state.notes.trim(),
      score: computeScore(state),
    };
  }

  function getQueue() { return store(QUEUE_KEY) || []; }
  function setQueue(q) { store(QUEUE_KEY, q.length ? q : null); }

  function postOne(item) {
    var ctrl = "AbortController" in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);
    // text/plain evita el "preflight" CORS que Apps Script no soporta.
    return fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(item),
      redirect: "follow",
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json().catch(function () { return { ok: true }; });
    }).then(function (data) {
      if (data && data.ok === false) throw new Error(data.error || "Error del servidor");
      return true;
    }).catch(function (err) { clearTimeout(timer); throw err; });
  }

  var flushing = false;
  function flushQueue() {
    if (flushing || !CONFIG.SCRIPT_URL) return Promise.resolve(getQueue().length === 0);
    flushing = true;
    var chain = Promise.resolve();
    getQueue().forEach(function (item) {
      chain = chain.then(function () {
        return postOne(item).then(function () {
          setQueue(getQueue().filter(function (x) { return x.id !== item.id; }));
        });
      });
    });
    return chain.then(function () { flushing = false; return getQueue().length === 0; })
      .catch(function (err) { flushing = false; console.warn("[F2F] Envío pendiente:", err); return false; });
  }

  function submit() {
    for (var s = 0; s < LAST_STEP; s++) if (!validate(s)) return go(s, { force: true });
    var btn = $("#nextBtn");
    btn.classList.add("is-loading");
    $("#nextLabel").textContent = "Enviando…";
    $("#nextIcon").innerHTML = ICONS.loader;

    lastPayload = buildPayload();
    var q = getQueue(); q.push(lastPayload); setQueue(q);

    flushQueue().then(function (ok) {
      btn.classList.remove("is-loading");
      showDone(ok);
    });
  }

  function showDone(synced) {
    var p = lastPayload;
    $("#doneScore").textContent = p.score;
    $("#doneLead").textContent = p.nombre.split(" ")[0] + ", buen trabajo esta semana. Ahora avísame por WhatsApp 👇";
    var sync = $("#syncStatus");
    sync.className = "sync " + (synced ? "ok" : "queued");
    sync.innerHTML = synced
      ? icon("check") + " Guardado en tu registro"
      : icon("cloudOff") + " Guardado en tu teléfono. Se enviará solo cuando haya conexión.";
    $("#waBtn").href = whatsappUrl(p);
    store(DRAFT_KEY, null);
    go(DONE_STEP, { force: true });
    celebrate();
  }

  function whatsappMessage(p) {
    var lines = [
      "📋 CHECK-IN SEMANAL — " + p.nombre,
      "🗓️ Semana " + p.semana + " · " + new Date(p.fecha).toLocaleDateString("es-DO", { day: "numeric", month: "short" }),
      "",
      "🍽️ Dieta: " + p.dieta + "/10",
      "🏋️ Entreno: " + p.entreno + "/10" + (p.sesiones != null ? " (" + sessionsText(p.sesiones) + ")" : ""),
      "😴 Sueño: " + fmtHours(p.suenoHoras) + " h/noche · " + p.suenoCalidad,
      "🫃 Digestión: " + p.digestion + (p.digestionNota ? " — " + p.digestionNota : ""),
      "⚡ Energía: " + p.energia + "/5",
      "⚖️ Peso: " + (p.peso != null ? p.peso + " lb" : "No me pesé"),
      "🔥 F2F Score: " + p.score,
    ];
    if (p.notas) lines.push("📝 Nota: " + p.notas);
    return lines.join("\n");
  }
  function whatsappUrl(p) {
    var phone = String(CONFIG.COACH_PHONE || "18294493723").replace(/\D/g, "");
    return "https://api.whatsapp.com/send/?phone=" + phone + "&text=" + encodeURIComponent(whatsappMessage(p)) + "&type=phone_number&app_absent=0";
  }

  /* ---------- Confeti ---------- */
  function celebrate() {
    if (reduceMotion) return;
    var cv = $("#confetti"), ctx = cv.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
    var colors = ["#e13a2e", "#ff5a45", "#f4f1ea", "#ffffff", "#a8241b"];
    var parts = [];
    for (var i = 0; i < 90; i++) {
      parts.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.2, y: H * 0.38,
        vx: (Math.random() - 0.5) * 16 * dpr, vy: (-Math.random() * 14 - 6) * dpr,
        w: (Math.random() * 6 + 4) * dpr, h: (Math.random() * 10 + 6) * dpr,
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
        c: colors[(Math.random() * colors.length) | 0], life: 0,
      });
    }
    var t0 = performance.now();
    (function frame(t) {
      var el = t - t0;
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.vy += 0.35 * dpr; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - el / 2600);
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
        ctx.restore();
      });
      if (el < 2700) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    })(t0);
  }

  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {} }

  /* ---------- Gestos y teclado ---------- */
  function initGestures() {
    var stage = $("#stage"), sx = 0, sy = 0, st = 0, ignore = false;
    stage.addEventListener("touchstart", function (e) {
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
      ignore = !!e.target.closest('input, textarea, .range, .ticks');
    }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      if (ignore || step === DONE_STEP) return;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 600) {
        if (dx < 0 && step < LAST_STEP) next(); else if (dx > 0) back();
      }
    }, { passive: true });

    document.addEventListener("keydown", function (e) {
      if (step === DONE_STEP) return;
      var tag = (e.target.tagName || "").toLowerCase();
      var typing = tag === "textarea" || (tag === "input" && e.target.type !== "range");
      if (e.key === "Enter" && (!typing || tag === "input" || e.metaKey || e.ctrlKey)) {
        if (tag === "button" || tag === "a") return; // deja que el botón haga su acción
        e.preventDefault(); next();
      } else if (!typing && tag !== "input") {
        if (e.key === "ArrowRight" && step < LAST_STEP) { e.preventDefault(); next(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
      }
    });
  }

  /* ---------- Arranque ---------- */
  function renderAll() {
    renderName(); renderTextFields();
    $$("[data-rating]").forEach(renderRating);
    renderSleep(); renderSingles(); renderChips();
  }

  function boot() {
    paintIcons();
    $("#weekTag").textContent = "Semana " + isoWeek(new Date()).week;

    var draft = store(DRAFT_KEY);
    if (draft && draft.state && Date.now() - (draft.savedAt || 0) < 5 * 86400000) {
      state = Object.assign(blank(), draft.state);
      step = Math.min(draft.step || 0, LAST_STEP);
    }
    if (urlName) state.name = urlName;
    if (step > 0 && cleanName(state.name).length < 2) step = 0;

    $$("[data-rating]").forEach(initRating);
    initSleep(); initSingles(); initChips(); initTextFields(); initGestures();

    $("#nextBtn").addEventListener("click", next);
    $("#backBtn").addEventListener("click", back);
    $("#summary").addEventListener("click", function (e) {
      var b = e.target.closest("[data-goto]"); if (b) go(+b.getAttribute("data-goto"));
    });
    $("#restartBtn").addEventListener("click", function () {
      var keep = cleanName(state.name);
      state = blank(); state.name = urlName || keep;
      renderAll(); go(0, { force: true });
    });

    renderAll();
    go(step, { force: true, silent: true });

    // Reintenta envíos pendientes al abrir y al recuperar conexión.
    flushQueue();
    window.addEventListener("online", flushQueue);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) flushQueue(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
