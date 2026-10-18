/* =========================================================
   PROTOCOLO F2F · Panel del coach
   Lee los datos desde el Apps Script (protegido con clave)
   y dibuja la evolución por cliente con SVG propio.
   Modo demo: coach.html?demo=1
   ========================================================= */
(function () {
  "use strict";

  var CONFIG = window.F2F_CONFIG || {};
  var KEY_STORE = "f2f-coach-key";
  var DAY = 86400000;
  var DEMO = /[?&]demo=1/.test(location.search);

  var ICONS = {
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
  };
  function icon(n) { return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + "</svg>"; }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function store(k, v, persist) {
    try {
      if (v === undefined) return localStorage.getItem(k) || sessionStorage.getItem(k);
      localStorage.removeItem(k); sessionStorage.removeItem(k);
      if (v !== null) (persist ? localStorage : sessionStorage).setItem(k, v);
    } catch (e) { return null; }
  }
  function isoWeek(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date - y0) / DAY + 1) / 7);
  }
  var fmtDate = function (d) { return d.toLocaleDateString("es-DO", { day: "numeric", month: "short" }).replace(".", ""); };
  var fmtNum = function (n, dec) { return n == null ? "—" : Number(n).toFixed(dec || 0).replace(/\.0$/, ""); };
  var avg = function (a) { a = a.filter(function (x) { return x != null; }); return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; };
  var norm = function (s) { return String(s || "").trim().toLowerCase(); };

  /* ---------- Datos ---------- */
  var DATA = null, clients = [], filter = "activos", current = null;

  function buildClients(raw) {
    var map = {};
    (raw.clientes || []).forEach(function (c) {
      map[norm(c.nombre)] = { nombre: c.nombre, estado: c.estado || "Activo", objetivo: c.objetivo || "", inicio: c.inicio ? new Date(c.inicio) : null, pesoInicial: c.pesoInicial, whatsapp: c.whatsapp, checkins: [] };
    });
    (raw.checkins || []).forEach(function (r) {
      var k = norm(r.nombre); if (!k) return;
      if (!map[k]) map[k] = { nombre: r.nombre, estado: "Activo", objetivo: "", inicio: null, pesoInicial: null, checkins: [] };
      r.date = new Date(r.fecha);
      map[k].checkins.push(r);
    });
    return Object.keys(map).map(function (k) {
      var c = map[k];
      c.checkins.sort(function (a, b) { return a.date - b.date; });
      c.last = c.checkins[c.checkins.length - 1] || null;
      c.prev = c.checkins[c.checkins.length - 2] || null;
      c.days = c.last ? Math.floor((Date.now() - c.last.date) / DAY) : null;
      c.status = !c.last ? "none" : c.days > 8 ? "bad" : c.days >= 6 ? "warn" : "ok";
      var ws = c.checkins.filter(function (x) { return x.peso != null; });
      c.pesoActual = ws.length ? ws[ws.length - 1].peso : null;
      var base = c.pesoInicial != null ? c.pesoInicial : ws.length ? ws[0].peso : null;
      c.pesoCambio = c.pesoActual != null && base != null && (ws.length > 1 || c.pesoInicial != null) ? c.pesoActual - base : null;
      return c;
    }).sort(function (a, b) {
      var o = { bad: 0, warn: 1, none: 2, ok: 3 };
      return o[a.status] - o[b.status] || a.nombre.localeCompare(b.nombre, "es");
    });
  }
  var STATUS_TXT = { ok: "Al día", warn: "Toca ya", bad: "Atrasado", none: "Sin check-in" };

  function load(key) {
    if (DEMO) return Promise.resolve(demoData());
    if (!CONFIG.SCRIPT_URL) return Promise.reject(new Error("Falta la URL del Apps Script en config.js"));
    var url = CONFIG.SCRIPT_URL + (CONFIG.SCRIPT_URL.indexOf("?") > -1 ? "&" : "?") + "accion=datos&clave=" + encodeURIComponent(key) + "&t=" + Date.now();
    return fetch(url, { redirect: "follow" }).then(function (r) {
      if (!r.ok) throw new Error("No se pudo conectar (" + r.status + ")");
      return r.json();
    }).then(function (d) {
      if (!d || !d.ok) { var e = new Error((d && d.error) || "Error leyendo la hoja"); e.auth = /clave/i.test(e.message); throw e; }
      return d;
    });
  }

  /* ---------- Acceso ---------- */
  function showLogin(msg) {
    $("#dash").hidden = true; $("#login").hidden = false;
    $("#loginErr").textContent = msg || "";
    setTimeout(function () { $("#key").focus(); }, 50);
  }
  function enter(key, persist) {
    loading(true);
    return load(key).then(function (d) {
      if (!DEMO) store(KEY_STORE, key, persist);
      DATA = d; clients = buildClients(d);
      $("#login").hidden = true; $("#dash").hidden = false;
      $("#updated").textContent = DEMO ? "Modo demo · datos de ejemplo" : "Actualizado " + new Date().toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit" });
      route();
    }).catch(function (e) {
      if (e.auth) store(KEY_STORE, null);
      showLogin(e.message === "Failed to fetch" ? "Sin conexión. Revisa tu internet e intenta de nuevo." : e.message);
    }).finally(function () { loading(false); });
  }
  function loading(on) { $("#loading").hidden = !on; $("#loginBtn").disabled = on; $("#refreshBtn").classList.toggle("is-loading", on); }

  /* ---------- Vista general ---------- */
  function renderAll() {
    $("#viewAll").hidden = false; $("#viewClient").hidden = true;
    $("#weekNow").textContent = isoWeek(new Date());
    var activos = clients.filter(function (c) { return c.estado === "Activo"; });
    var semana = activos.filter(function (c) { return c.days != null && c.days < 7; });
    var pend = activos.filter(function (c) { return c.status !== "ok"; });
    var sc = avg(semana.map(function (c) { return c.last.score; }));
    $("#kpisAll").innerHTML = [
      kpi("Clientes activos", activos.length),
      kpi("Check-ins esta semana", semana.length, "/" + activos.length, null, true),
      kpi("Score promedio", sc == null ? "—" : Math.round(sc), null, "de los check-ins de la semana"),
      kpi("Pendientes", pend.length, null, pend.length ? "toca escribirles" : "¡todos al día! 🔥"),
    ].join("");

    var list = clients.filter(function (c) {
      if (filter === "todos") return true;
      if (c.estado !== "Activo") return false;
      return filter === "activos" || c.status !== "ok";
    });
    var tb = $("#clientsTable tbody");
    $("#clientsTable").classList.add("table--click");
    tb.innerHTML = list.map(function (c) {
      var s = c.last ? c.last.score : null;
      var d = c.last && c.prev ? c.last.score - c.prev.score : null;
      return '<tr data-name="' + esc(c.nombre) + '" tabindex="0">' +
        '<td><span class="cname">' + esc(c.nombre) + "</span>" + (c.objetivo ? '<span class="cgoal">' + esc(c.objetivo) + "</span>" : c.estado !== "Activo" ? '<span class="cgoal">' + esc(c.estado) + "</span>" : "") + "</td>" +
        '<td><span class="status status--' + c.status + '">' + STATUS_TXT[c.status] + "</span></td>" +
        '<td class="hide-xs">' + (c.last ? fmtDate(c.last.date) + ' <span class="muted">· hace ' + (c.days === 0 ? "hoy" : c.days + " d") + "</span>" : '<span class="muted">—</span>') + "</td>" +
        '<td class="num">' + (s != null ? '<span class="score-pill' + (s >= 80 ? " hi" : "") + '">' + s + "</span>" + deltaHtml(d, "") : '<span class="muted">—</span>') + "</td>" +
        '<td class="hide-sm">' + spark(c.checkins.map(function (x) { return x.score; })) + "</td>" +
        '<td class="num hide-sm">' + (c.pesoActual != null ? fmtNum(c.pesoActual, 1) + " lb" : '<span class="muted">—</span>') + "</td>" +
        '<td class="num hide-sm">' + (c.pesoCambio != null ? (c.pesoCambio > 0 ? "+" : "") + fmtNum(c.pesoCambio, 1) + " lb" : '<span class="muted">—</span>') + "</td>" +
        '<td class="go">' + icon("chevron") + "</td></tr>";
    }).join("");
    $("#emptyAll").hidden = list.length > 0;
    if (!list.length) $("#emptyAll").textContent = clients.length ? "Nadie en este filtro. 🙌" : "Todavía no hay check-ins. Cuando tus asesorados envíen el primero, aparecerán aquí.";
  }

  function kpi(label, value, small, delta, accent) {
    return '<div class="kpi' + (accent ? " kpi--accent" : "") + '"><div class="kpi__label">' + label + '</div><div class="kpi__value">' + value + (small ? "<small>" + small + "</small>" : "") + "</div>" + (delta ? '<div class="kpi__delta">' + delta + "</div>" : "") + "</div>";
  }
  function deltaHtml(d, unit, invert) {
    if (d == null || d === 0) return "";
    var good = invert ? d < 0 : d > 0;
    return ' <span class="' + (good ? "up" : "down") + '" style="font-size:12px;font-weight:700">' + (d > 0 ? "▲" : "▼") + fmtNum(Math.abs(d), unit === " lb" ? 1 : 0) + "</span>";
  }
  function spark(vals) {
    vals = vals.filter(function (v) { return v != null; }).slice(-10);
    if (vals.length < 2) return '<span class="muted">—</span>';
    var W = 120, H = 32, n = vals.length;
    var pts = vals.map(function (v, i) { return [(i / (n - 1)) * (W - 6) + 3, H - 4 - (v / 100) * (H - 8)]; });
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join("");
    var l = pts[n - 1];
    return '<svg class="spark" viewBox="0 0 ' + W + " " + H + '" aria-label="Evolución del score: ' + vals.join(", ") + '"><path d="' + d + '" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="' + l[0] + '" cy="' + l[1] + '" r="3" fill="var(--s1)"/></svg>';
  }

  /* ---------- Vista de cliente ---------- */
  function renderClient(c) {
    current = c;
    $("#viewAll").hidden = true; $("#viewClient").hidden = false;
    window.scrollTo(0, 0);
    $("#cName").textContent = c.nombre;
    var meta = [];
    if (c.objetivo) meta.push(c.objetivo);
    if (c.inicio) meta.push("Desde el " + c.inicio.toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric" }));
    meta.push(c.checkins.length + (c.checkins.length === 1 ? " check-in" : " check-ins"));
    $("#cMeta").textContent = meta.join(" · ");
    $("#clientPick").innerHTML = clients.map(function (x) { return '<option' + (x === c ? " selected" : "") + ">" + esc(x.nombre) + "</option>"; }).join("");

    var ck = c.checkins;
    var last4 = avg(ck.slice(-4).map(function (x) { return x.score; }));
    var prev4 = ck.length > 4 ? avg(ck.slice(-8, -4).map(function (x) { return x.score; })) : null;
    var waist = ck.filter(function (x) { return x.cintura != null; });
    var wDelta = waist.length > 1 ? waist[waist.length - 1].cintura - waist[0].cintura : null;
    $("#kpisClient").innerHTML = [
      kpi("Último score", c.last ? c.last.score : "—", null, c.last && c.prev ? deltaTxt(c.last.score - c.prev.score, "", "vs. semana anterior") : c.last ? "primer check-in" : "", true),
      kpi("Promedio 4 semanas", last4 == null ? "—" : Math.round(last4), null, prev4 != null ? deltaTxt(Math.round(last4 - prev4), "", "vs. 4 anteriores") : ""),
      kpi("Peso actual", c.pesoActual != null ? fmtNum(c.pesoActual, 1) : "—", c.pesoActual != null ? "lb" : null, c.pesoCambio != null ? deltaTxt(c.pesoCambio, " lb", "desde el inicio", true) : ""),
      kpi("Cintura", waist.length ? fmtNum(waist[waist.length - 1].cintura, 1) : "—", waist.length ? "pulg" : null, wDelta != null ? deltaTxt(wDelta, " pulg", "desde el inicio", true) : waist.length ? "" : "sin medidas aún"),
    ].join("");

    var P = function (k) { return ck.filter(function (x) { return x[k] != null; }).map(function (x) { return { x: x.date, y: x[k] }; }); };
    lineChart($("#chScore"), { series: [{ name: "Score", color: "var(--s1)", pts: P("score"), area: true }], yMin: 0, yMax: 100, ticks: [0, 25, 50, 75, 100] });
    lineChart($("#chWeight"), { series: [{ name: "Peso", color: "var(--s1)", pts: P("peso"), unit: " lb", dec: 1 }], auto: true });
    lineChart($("#chAdh"), { series: [{ name: "Dieta", color: "var(--s1)", pts: P("dieta") }, { name: "Entreno", color: "var(--s2)", pts: P("entreno") }], yMin: 0, yMax: 10, ticks: [0, 5, 10], direct: true });
    $("#lgAdh").innerHTML = '<span><i style="background:var(--s1)"></i>Dieta</span><span><i style="background:var(--s2)"></i>Entreno</span>';
    lineChart($("#chSleep"), { series: [{ name: "Sueño", color: "var(--s1)", pts: P("suenoHoras"), unit: " h", dec: 1, extra: function (i) { var q = ck.filter(function (x) { return x.suenoHoras != null; })[i]; return q && q.suenoCalidad ? "Calidad: " + q.suenoCalidad : ""; } }], yMin: 4, yMax: 10, ticks: [4, 6, 7, 9, 10], band: [7, 9] });
    lineChart($("#chEnergy"), { series: [{ name: "Energía", color: "var(--s1)", pts: P("energia"), unit: "/5" }], yMin: 1, yMax: 5, ticks: [1, 2, 3, 4, 5] });

    $("#histCount").textContent = ck.length ? "Más reciente primero" : "";
    $("#histTable tbody").innerHTML = ck.slice().reverse().map(function (x) {
      var notas = [x.notas, x.digestionNota ? "Digestión: " + x.digestionNota : ""].filter(Boolean).join(" · ");
      return "<tr><td><b>S" + esc(x.semana) + '</b> <span class="muted">' + fmtDate(x.date) + "</span></td>" +
        '<td class="num"><span class="score-pill' + (x.score >= 80 ? " hi" : "") + '">' + esc(x.score) + "</span></td>" +
        '<td class="num">' + fmtNum(x.dieta) + '</td><td class="num">' + fmtNum(x.entreno) + (x.sesiones != null ? ' <span class="muted">(' + x.sesiones + ")</span>" : "") + "</td>" +
        '<td class="num">' + fmtNum(x.suenoHoras, 1) + ' h <span class="muted">' + esc(x.suenoCalidad || "") + "</span></td>" +
        '<td class="num">' + fmtNum(x.energia) + '/5</td><td class="num">' + (x.peso != null ? fmtNum(x.peso, 1) : "—") + (x.cintura != null ? ' <span class="muted">· ' + fmtNum(x.cintura, 1) + '"</span>' : "") + "</td>" +
        "<td>" + esc(x.digestion || "") + "</td><td>" + (notas ? esc(notas) : '<span class="muted">—</span>') + "</td></tr>";
    }).join("") || '<tr><td colspan="9" class="empty">Sin check-ins todavía.</td></tr>';
  }
  function deltaTxt(d, unit, suffix, invert) {
    if (d == null) return "";
    if (Math.abs(d) < 0.05) return "= " + suffix;
    var good = invert ? null : d > 0; // en peso/cintura no juzgamos: depende del objetivo
    var cls = good == null ? "" : good ? "up" : "down";
    return '<span class="' + cls + '">' + icon(d > 0 ? "up" : "down") + (d > 0 ? "+" : "−") + fmtNum(Math.abs(d), unit ? 1 : 0) + unit + "</span>&nbsp;" + suffix;
  }

  /* ---------- Gráfica de líneas (SVG) ---------- */
  function lineChart(el, o) {
    el._opts = o;
    var W = el.clientWidth || 600, H = el.clientHeight || 220;
    var m = { t: 14, r: o.direct ? 64 : 18, b: 28, l: 36 };
    var all = [];
    o.series.forEach(function (s) { s.pts.forEach(function (p) { all.push(p); }); });
    if (!all.length) { el.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '"><text class="nodata" x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle">Sin datos todavía</text></svg>'; return; }
    var yMin = o.yMin, yMax = o.yMax, ticks = o.ticks;
    if (o.auto) {
      var ys = all.map(function (p) { return p.y; });
      var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), pad = Math.max(2, (hi - lo) * 0.25);
      yMin = Math.floor((lo - pad) / 2) * 2; yMax = Math.ceil((hi + pad) / 2) * 2;
      var step = Math.max(1, Math.round((yMax - yMin) / 4));
      ticks = []; for (var t = yMin; t <= yMax; t += step) ticks.push(t);
    }
    var xs = []; all.forEach(function (p) { var t = +p.x; if (xs.indexOf(t) === -1) xs.push(t); });
    xs.sort(function (a, b) { return a - b; });
    var x0 = xs[0], x1 = xs[xs.length - 1];
    var X = function (t) { return xs.length === 1 ? (m.l + W - m.r) / 2 : m.l + ((t - x0) / (x1 - x0)) * (W - m.l - m.r); };
    var Y = function (v) { return m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b); };

    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(o.series.map(function (x) { return x.name; }).join(" y ")) + '">';
    if (o.band) s += '<rect class="band" x="' + m.l + '" y="' + Y(o.band[1]) + '" width="' + (W - m.l - m.r) + '" height="' + (Y(o.band[0]) - Y(o.band[1])) + '"/>';
    s += '<g class="grid">' + ticks.map(function (t) { return '<line x1="' + m.l + '" x2="' + (W - m.r) + '" y1="' + Y(t) + '" y2="' + Y(t) + '"/>'; }).join("") + "</g>";
    s += '<g class="axis">' + ticks.map(function (t) { return '<text x="' + (m.l - 8) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + t + "</text>"; }).join("");
    var every = Math.max(1, Math.ceil(xs.length / Math.max(2, Math.floor((W - m.l - m.r) / 70))));
    xs.forEach(function (t, i) {
      if (i % every && i !== xs.length - 1) return;
      if (i !== xs.length - 1 && xs.length - 1 - i < every) return;
      s += '<text x="' + X(t) + '" y="' + (H - 8) + '" text-anchor="middle">' + fmtDate(new Date(t)) + "</text>";
    });
    s += "</g>";
    var labelY = []; // evita que las etiquetas directas se encimen
    o.series.forEach(function (se) {
      if (!se.pts.length) return;
      var d = se.pts.map(function (p, i) { return (i ? "L" : "M") + X(+p.x).toFixed(1) + " " + Y(p.y).toFixed(1); }).join("");
      if (se.area && se.pts.length > 1) s += '<path class="area" fill="' + se.color + '" d="' + d + "L" + X(+se.pts[se.pts.length - 1].x) + " " + Y(yMin) + "L" + X(+se.pts[0].x) + " " + Y(yMin) + 'Z"/>';
      s += '<path class="line" stroke="' + se.color + '" d="' + d + '"/>';
      var lp = se.pts[se.pts.length - 1];
      s += '<circle class="dot" r="5" fill="' + se.color + '" cx="' + X(+lp.x) + '" cy="' + Y(lp.y) + '"/>';
      if (o.direct) {
        var ly = Y(lp.y) + 4;
        labelY.forEach(function (u) { if (Math.abs(u - ly) < 15) ly = u + (ly <= u ? -15 : 15); });
        labelY.push(ly);
        s += '<text class="dlabel" x="' + (X(+lp.x) + 10) + '" y="' + ly + '">' + se.name + "</text>";
      }
      else s += '<text class="dlabel" x="' + X(+lp.x) + '" y="' + (Y(lp.y) - 12) + '" text-anchor="middle">' + fmtNum(lp.y, se.dec) + "</text>";
    });
    if (o.band) s += '<text class="band-label" x="' + (W - m.r - 4) + '" y="' + (Y(o.band[1]) + 12) + '" text-anchor="end">zona ideal</text>';
    s += '<line class="cross" id="x" y1="' + m.t + '" y2="' + (H - m.b) + '" visibility="hidden"/><g class="hl"></g>';
    s += '<rect class="hit" x="' + (m.l - 10) + '" y="0" width="' + (W - m.l - m.r + 20) + '" height="' + H + '" fill="transparent"/></svg>';
    el.innerHTML = s;

    var svg = el.firstChild, cross = svg.querySelector(".cross"), hl = svg.querySelector(".hl"), tip = $("#tip");
    function move(ev) {
      var r = svg.getBoundingClientRect();
      var px = (ev.clientX - r.left) * (W / r.width);
      var best = xs[0];
      xs.forEach(function (t) { if (Math.abs(X(t) - px) < Math.abs(X(best) - px)) best = t; });
      cross.setAttribute("x1", X(best)); cross.setAttribute("x2", X(best)); cross.setAttribute("visibility", "visible");
      var rows = [], dots = "";
      o.series.forEach(function (se) {
        var idx = -1; se.pts.forEach(function (p, i) { if (+p.x === best) idx = i; });
        if (idx < 0) return;
        var p = se.pts[idx];
        dots += '<circle class="dot" r="6" fill="' + se.color + '" cx="' + X(best) + '" cy="' + Y(p.y) + '"/>';
        rows.push('<div class="row"><span><i style="background:' + se.color + '"></i>' + se.name + "</span><strong>" + fmtNum(p.y, se.dec) + (se.unit || "") + "</strong></div>" + (se.extra && se.extra(idx) ? '<div class="row"><span class="muted">' + se.extra(idx) + "</span></div>" : ""));
      });
      hl.innerHTML = dots;
      tip.innerHTML = "<b>Semana " + isoWeek(new Date(best)) + " · " + fmtDate(new Date(best)) + "</b>" + rows.join("");
      tip.hidden = false;
      tip.style.left = Math.min(Math.max(r.left + X(best) * (r.width / W), 80), innerWidth - 80) + "px";
      tip.style.top = r.top + m.t * (r.height / H) + 8 + "px";
    }
    function leave() { cross.setAttribute("visibility", "hidden"); hl.innerHTML = ""; tip.hidden = true; }
    var hit = svg.querySelector(".hit");
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);
  }
  var resizeT;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { $$(".chart").forEach(function (el) { if (el._opts && el.offsetParent) lineChart(el, el._opts); }); }, 150);
  });
  window.addEventListener("scroll", function () { $("#tip").hidden = true; }, { passive: true });

  /* ---------- Navegación ---------- */
  function route() {
    var m = location.hash.match(/^#c=(.+)$/);
    var c = m && clients.find(function (x) { return norm(x.nombre) === norm(decodeURIComponent(m[1])); });
    if (c) renderClient(c); else renderAll();
  }
  function openClient(name) { location.hash = "c=" + encodeURIComponent(name); }

  /* ---------- Demo ---------- */
  function demoData() {
    var people = [
      { n: "Francis", g: "Ganar masa muscular", w: 138, dw: 0.6, base: 78, wa: 29 },
      { n: "María Pérez", g: "Definición", w: 154, dw: -0.8, base: 70, wa: 31 },
      { n: "Juan Rodríguez", g: "Ganar fuerza", w: 147, dw: 0.4, base: 60, wa: null },
      { n: "Carlos Méndez", g: "Recomposición", w: 171, dw: -0.3, base: 55, wa: 35 },
    ];
    var rnd = (function (s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })(7);
    var checkins = [], now = Date.now();
    people.forEach(function (p, pi) {
      var weeks = pi === 3 ? 6 : 10, skipLast = pi === 2 ? 2 : pi === 3 ? 1 : 0;
      for (var i = weeks - 1; i >= skipLast; i--) {
        var d = new Date(now - (i * 7 + (pi === 1 ? 1 : 0)) * DAY - 3600000 * (pi + 2));
        var trend = (weeks - i) * 1.4;
        var diet = Math.max(3, Math.min(10, Math.round((p.base + trend) / 10 + (rnd() - 0.5) * 2)));
        var train = Math.max(3, Math.min(10, Math.round((p.base + trend + 6) / 10 + (rnd() - 0.5) * 2)));
        var sleep = Math.round((6.2 + rnd() * 2.2) * 2) / 2, q = sleep >= 7.5 ? "Buena" : sleep >= 6.5 ? "Normal" : "Mala";
        var en = Math.max(2, Math.min(5, Math.round(2.6 + trend / 8 + rnd())));
        var hs = sleep >= 7 && sleep <= 9 ? 100 : sleep < 7 ? 100 - (7 - sleep) * 25 : 100 - (sleep - 9) * 15;
        var sc = Math.round(diet * 3.5 + train * 3 + (hs * 0.6 + { Mala: 40, Normal: 75, Buena: 100 }[q] * 0.4) * 0.2 + en * 3);
        checkins.push({
          fecha: d.toISOString(), semana: isoWeek(d), nombre: p.n, dieta: diet, entreno: train, sesiones: Math.min(6, Math.round(train / 2)),
          suenoHoras: sleep, suenoCalidad: q, digestion: rnd() > 0.75 ? "Hinchazón" : "Sin problemas", digestionNota: "",
          energia: en, peso: i % 2 === 0 || pi === 0 ? Math.round((p.w + (weeks - i) * p.dw + (rnd() - 0.5)) * 10) / 10 : null,
          cintura: p.wa && i % 4 === 0 ? Math.round((p.wa + (weeks - i) * (p.dw < 0 ? -0.15 : 0.05)) * 10) / 10 : null,
          notas: i === 0 && pi === 0 ? "Subí el peso en sentadilla. Me cuesta comer la última comida." : i === 3 && pi === 1 ? "Semana de viaje, comí fuera 3 veces." : "", score: sc,
        });
      }
    });
    var clientes = people.map(function (p, i) { return { nombre: p.n, estado: "Activo", objetivo: p.g, inicio: new Date(now - (i === 3 ? 6 : 10) * 7 * DAY).toISOString(), pesoInicial: p.w }; });
    clientes.push({ nombre: "Ana Gómez", estado: "Activo", objetivo: "Empieza la próxima semana", inicio: "", pesoInicial: null });
    return { ok: true, checkins: checkins, clientes: clientes };
  }

  /* ---------- Arranque ---------- */
  function boot() {
    $$("i[data-icon]").forEach(function (el) { var t = document.createElement("span"); t.innerHTML = icon(el.getAttribute("data-icon")); el.replaceWith(t.firstChild); });
    $("#loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var k = $("#key").value.trim();
      if (k.length < 6) { $("#loginErr").textContent = "La clave tiene al menos 6 caracteres."; return; }
      enter(k, $("#remember").checked);
    });
    $("#logoutBtn").addEventListener("click", function () { store(KEY_STORE, null); location.hash = ""; DATA = null; $("#key").value = ""; showLogin(""); });
    $("#refreshBtn").addEventListener("click", function () { enter(store(KEY_STORE) || "", !!localStorage.getItem(KEY_STORE)); });
    $("#backBtn").addEventListener("click", function () { location.hash = ""; });
    $("#clientPick").addEventListener("change", function (e) { openClient(e.target.value); });
    $("#filter").addEventListener("click", function (e) {
      var b = e.target.closest("[data-f]"); if (!b) return;
      filter = b.getAttribute("data-f");
      $$("#filter [data-f]").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
      renderAll();
    });
    $("#clientsTable tbody").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-name]"); if (tr) openClient(tr.getAttribute("data-name")); });
    $("#clientsTable tbody").addEventListener("keydown", function (e) { if (e.key === "Enter") { var tr = e.target.closest("tr[data-name]"); if (tr) openClient(tr.getAttribute("data-name")); } });
    window.addEventListener("hashchange", function () { if (DATA) route(); });

    var saved = store(KEY_STORE);
    if (DEMO) enter("demo", false);
    else if (saved) enter(saved, !!localStorage.getItem(KEY_STORE));
    else showLogin("");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
