/* =====================================================================
   SOTIRIA — pestaña "Estadísticas" del panel.
   Adaptada del panel del propietario de Jerold27 (gráficos, KPIs con
   comparación contra el período anterior, tablas y tooltips) al modelo
   actual: entradas de la obra, libro, funciones y redes sociales.
   Usa api(), esc() y bs() de js/admin.js.
   ===================================================================== */
const ST = { range: "month", metric: "revenue", data: null, tables: new Set() };
const num = (n) => Math.round(n).toLocaleString("es-BO");
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + "%";
const fmtM = (metric, v) => (metric === "revenue" ? bs(v) : `${num(v)} ${v === 1 ? "unidad" : "unidades"}`);
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dayLabel = (iso) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
const RANGE_NAMES = { day: "hoy", week: "esta semana", month: "este mes", d30: "los últimos 30 días", d90: "los últimos 90 días", all: "todo el historial" };

/* iconos (trazo, heredan el color del texto) */
const SVG = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
const SI = {
  day: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  week: SVG('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M7 15h10"/>'),
  month: SVG('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>'),
  money: SVG('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>'),
  ticket: SVG('<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/>'),
  book: SVG('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  cart: SVG('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
  avg: SVG('<path d="M5 19 19 5"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'),
  trend: SVG('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  share: SVG('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  layers: SVG('<path d="M12 2 2 7l10 5 10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>'),
  bars: SVG('<path d="M5 20V11M11 20V5M17 20v-7M2 20h20"/>'),
  shield: SVG('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  download: SVG('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
};
const ico = (k) => `<span class="s-ico">${SI[k]}</span>`;
const PANELS = [
  ["source", "share", "De qué red vienen", "Según el enlace de la publicación (?src=)"],
  ["product", "layers", "Obra o libro", "Qué se vende más"],
  ["funcion", "week", "Por función", "Entradas de cada fecha"],
  ["weekday", "bars", "Por día de la semana", "Qué días se vende más"],
  ["validator", "shield", "Validaciones por persona", "Quién aprobó cada pago"],
];

async function renderStats() {
  $("#view").innerHTML = `
    <div class="stats" id="sdash">
      <p class="demo-note" id="sDemo" hidden><b>Datos de demostración.</b> Incluyen ventas de prueba. Bórralas antes de vender de verdad con <code>node server/seed.js --clear</code>.</p>
      <header class="s-head">
        <div><span class="kicker">CRM · Reporte</span><h2>Estadísticas de ventas</h2><p class="msg" id="sTz"></p></div>
        <div class="s-actions">
          <span class="s-upd" id="sUpd">Cargando…</span>
          <button class="btn xls-btn" type="button" id="sExport" title="Descarga un Excel con el resumen, los desgloses del período elegido, las últimas ventas y los clientes">${SI.download}<span>Descargar Excel</span></button>
        </div>
      </header>
      <div class="skpis" id="skpis"></div>
      <article class="panel wide">
        <header class="panel-h">${ico("trend")}<div><h3>Ingresos de los últimos 30 días</h3><p class="sub" id="trendSub"></p></div><button class="s-toggle" type="button" data-stoggle="trend">Ver tabla</button></header>
        <div id="strend"></div>
      </article>
      <div class="filterbar" role="group" aria-label="Filtros del detalle">
        <h3>Detalle por</h3>
        <div class="seg" id="fRange" role="radiogroup" aria-label="Período">
          ${Object.entries({ day: "Hoy", week: "Esta semana", month: "Este mes", d30: "30 días", d90: "90 días", all: "Todo" }).map(([k, v]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${ST.range === k}">${v}</button>`).join("")}
        </div>
        <div class="seg" id="fMetric" role="radiogroup" aria-label="Medida">
          <button type="button" role="radio" data-v="revenue" aria-checked="${ST.metric === "revenue"}">Ingresos (Bs)</button>
          <button type="button" role="radio" data-v="units" aria-checked="${ST.metric === "units"}">Unidades</button>
        </div>
      </div>
      <section class="s-summary" id="rangeTotal" aria-live="polite"></section>
      <div class="adm-grid">
        ${PANELS.map(([id, i, t, sub]) => `<article class="panel"><header class="panel-h">${ico(i)}<div><h3>${t}</h3><p class="sub" id="sub-${id}">${sub}</p></div><button class="s-toggle" type="button" data-stoggle="${id}">Ver tabla</button></header><div id="s${id}"></div></article>`).join("")}
        <article class="panel wide"><header class="panel-h">${ico("clock")}<div><h3>Últimas ventas</h3><p class="sub">Pagos validados en el período elegido</p></div></header><div id="srecent"></div></article>
      </div>
    </div>`;
  $("#sExport").onclick = exportStats;
  $("#fRange").onclick = (ev) => {
    const b = ev.target.closest("button");
    if (!b || b.dataset.v === ST.range) return;
    ST.range = b.dataset.v;
    $$("#fRange button").forEach((x) => x.setAttribute("aria-checked", x === b));
    loadStats();
  };
  $("#fMetric").onclick = (ev) => {
    const b = ev.target.closest("button");
    if (!b || b.dataset.v === ST.metric) return;
    ST.metric = b.dataset.v;
    $$("#fMetric button").forEach((x) => x.setAttribute("aria-checked", x === b));
    drawStats();
  };
  $("#sdash").onclick = (ev) => {
    const t = ev.target.closest("[data-stoggle]");
    if (!t) return;
    const k = t.dataset.stoggle;
    ST.tables.has(k) ? ST.tables.delete(k) : ST.tables.add(k);
    drawStats();
  };
  loadStats();
}

async function loadStats() {
  $("#sdash")?.classList.add("busy");
  try {
    ST.data = await api("/stats?range=" + ST.range);
    drawStats();
  } catch (e) {
    $("#sUpd") && ($("#sUpd").textContent = e.message);
  } finally {
    $("#sdash")?.classList.remove("busy");
  }
}

function drawStats() {
  const d = ST.data;
  if (!d || !$("#sdash")) return;
  const m = ST.metric;
  $("#sDemo").hidden = !d.demo;
  $("#sUpd").textContent = "Actualizado " + new Date(d.generatedAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
  $("#sTz").textContent = `Horario de Bolivia (UTC${d.tzOffset >= 0 ? "+" : ""}${d.tzOffset}). Cada período se compara con el mismo tramo del período anterior.`;
  skpis(d.kpis);
  strend(d.trend);
  const t = d.total;
  $("#rangeTotal").innerHTML =
    `<h3>Resumen de ${RANGE_NAMES[d.range]}</h3>` +
    (t.orders
      ? `<ul>${[
          ["money", "Ingresos", bs(t.revenue), "hl"],
          ["ticket", "Entradas", num(t.tickets)],
          ["book", "Libros", num(t.books)],
          ["cart", "Ventas", num(t.orders)],
          ["avg", "Promedio por venta", bs(Math.round(t.revenue / t.orders))],
        ]
          .map(([i, l, v, c]) => `<li${c ? ` class="${c}"` : ""}>${ico(i)}<div><small>${l}</small><b>${v}</b></div></li>`)
          .join("")}</ul>`
      : `<p class="none">Sin ventas en ${RANGE_NAMES[d.range]}.</p>`);
  const rows = (list) => list.map((x) => ({ ...x, value: x[m] }));
  spanel("source", rows(d.bySource), hbars);
  spanel("product", rows(d.byProduct), hbars);
  spanel("funcion", rows(d.byFuncion), hbars, { keepOrder: true });
  spanel("weekday", rows(d.byWeekday), weekdayChart, { keepOrder: true });
  spanel("validator", rows(d.byValidator), hbars);
  srecent(d.recent);
  const best = [...d.byWeekday].sort((a, b) => b[m] - a[m])[0];
  const tot = d.byWeekday.reduce((a, x) => a + x[m], 0);
  $("#sub-weekday").textContent =tot ? `El que más vende: ${best.name} (${pct(best[m], tot)} del total)` : "Qué días se vende más";
}

function delta(cur, prev, label) {
  if (!prev) return `<p class="delta flat"><b>—</b><span>Sin ventas ${label} para comparar</span></p>`;
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return `<p class="delta flat"><b><span aria-hidden="true">＝</span> 0%</b><span>igual que ${label}</span></p>`;
  const up = p > 0;
  return `<p class="delta ${up ? "up" : "down"}"><b><span aria-hidden="true">${up ? "▲" : "▼"}</span> ${up ? "+" : "−"}${Math.abs(p)}%</b><span>vs ${label} <small>(${bs(prev)})</small></span></p>`;
}
function skpis(k) {
  $("#skpis").innerHTML = [
    ["day", "Hoy", k.day, "ayer a esta hora"],
    ["week", "Esta semana", k.week, "la semana pasada"],
    ["month", "Este mes", k.month, "el mes pasado"],
  ]
    .map(
      ([i, title, p, label]) => `<article class="skpi k-${i}">
        <header>${ico(i)}<h3>${title}</h3></header>
        <p class="kpi-v">${bs(p.revenue)}</p>
        <ul class="kpi-s"><li>${SI.ticket}${num(p.tickets)} entradas</li><li>${SI.book}${num(p.books)} libros</li><li>${SI.cart}${num(p.orders)} ventas</li></ul>
        ${delta(p.revenue, p.prev.revenue, label)}
      </article>`,
    )
    .join("");
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function tableHTML(cols, rows) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th${c.num ? ' class="n"' : ""}>${c.h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td${c.num ? ' class="n"' : ""}>${c.f(r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function breakdownTable(rows) {
  const tot = rows.reduce((a, r) => a + r.revenue, 0);
  return tableHTML(
    [
      { h: "Nombre", f: (r) => esc(r.name) },
      { h: "Ingresos", num: 1, f: (r) => bs(r.revenue) },
      { h: "Entradas", num: 1, f: (r) => num(r.tickets) },
      { h: "Libros", num: 1, f: (r) => num(r.books) },
      { h: "Ventas", num: 1, f: (r) => num(r.orders) },
      { h: "% ingresos", num: 1, f: (r) => pct(r.revenue, tot) },
    ],
    rows,
  );
}
function spanel(id, rows, chart, opts = {}) {
  const el = $("#s" + id);
  $(`[data-stoggle="${id}"]`).textContent = ST.tables.has(id) ? "Ver gráfico" : "Ver tabla";
  const sorted = opts.keepOrder ? rows : [...rows].sort((a, b) => b.value - a.value);
  if (!rows.some((r) => r.orders)) return (el.innerHTML = `<p class="none">Sin ventas en este período.</p>`);
  el.innerHTML = ST.tables.has(id) ? breakdownTable(sorted) : chart(sorted);
}
const tipFor = (r, total) => `<b>${esc(r.name)}</b><br>${bs(r.revenue)} · ${num(r.tickets)} entradas · ${num(r.books)} libros<br>${num(r.orders)} ventas · ${pct(r[ST.metric], total)} del total`;

function hbars(rows) {
  const m = ST.metric;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((a, r) => a + r[m], 0);
  return `<ul class="hbars">${rows
    .map(
      (r) => `<li tabindex="0" data-tip="${esc(tipFor(r, total))}"><span class="hb-name">${esc(r.name)}</span>
      <span class="hb-track">${r.value > 0 ? `<i style="width:${(r.value / max) * 100}%"></i>` : ""}</span>
      <span class="hb-val">${fmtM(m, r.value)} <small>${pct(r.value, total)}</small></span></li>`,
    )
    .join("")}</ul>`;
}
function weekdayChart(rows) {
  const m = ST.metric;
  const max = Math.max(...rows.map((r) => r.value), 0);
  const total = rows.reduce((a, r) => a + r[m], 0);
  const bestIdx = rows.findIndex((r) => r.value === max);
  return vchart(
    rows.map((r, i) => ({ label: r.name.slice(0, 3), value: r.value, hi: i === bestIdx && max > 0, tip: tipFor(r, total), directLabel: i === bestIdx && max > 0 ? fmtM(m, r.value) : "" })),
    niceMax(max),
    m,
    "wd",
  );
}
function vchart(cols, top, metric, cls = "") {
  const ticks = [0, 0.5, 1].map((f) => top * f);
  const tickLabel = (v) => (metric === "revenue" ? (v >= 1000 ? num(v / 1000) + " mil" : num(v)) : num(v));
  return `
  <div class="vchart ${cls}" style="--n:${cols.length}">
    <div class="vc-y" aria-hidden="true">${ticks.map((t) => `<span style="bottom:${(t / top) * 100}%">${tickLabel(t)}</span>`).join("")}</div>
    <div class="vc-plot">
      ${ticks.map((t) => `<b class="grid" style="bottom:${(t / top) * 100}%"></b>`).join("")}
      ${cols.map((c) => `<div class="col${c.hi ? " hi" : ""}" tabindex="0" data-tip="${esc(c.tip)}" aria-label="${esc(c.label)}: ${esc(fmtM(metric, c.value))}"><i style="height:${(c.value / top) * 100}%">${c.directLabel ? `<em>${esc(c.directLabel)}</em>` : ""}</i></div>`).join("")}
    </div>
    <div class="vc-x" aria-hidden="true">${cols.map((c) => `<span>${esc(c.label)}</span>`).join("")}</div>
  </div>`;
}
function strend(trend) {
  const el = $("#strend");
  $(`[data-stoggle="trend"]`).textContent = ST.tables.has("trend") ? "Ver gráfico" : "Ver tabla";
  const tot = trend.reduce((a, d) => a + d.revenue, 0);
  const best = [...trend].sort((a, b) => b.revenue - a.revenue)[0];
  $("#trendSub").textContent = tot ? `Total: ${bs(tot)} · mejor día: ${dayLabel(best.day)} (${bs(best.revenue)})` : "Aún no hay ventas en los últimos 30 días.";
  if (ST.tables.has("trend")) {
    el.innerHTML = tableHTML(
      [
        { h: "Día", f: (r) => dayLabel(r.day) },
        { h: "Ingresos", num: 1, f: (r) => bs(r.revenue) },
        { h: "Entradas", num: 1, f: (r) => num(r.tickets) },
        { h: "Libros", num: 1, f: (r) => num(r.books) },
        { h: "Ventas", num: 1, f: (r) => num(r.orders) },
      ],
      [...trend].reverse(),
    );
    return;
  }
  const last = trend.length - 1;
  el.innerHTML = vchart(
    trend.map((d, i) => {
      const wd = new Date(d.day + "T12:00:00").toLocaleDateString("es-BO", { weekday: "long" });
      return {
        label: i % 5 === last % 5 ? dayLabel(d.day) : "",
        value: d.revenue,
        hi: false,
        tip: `<b>${wd} ${dayLabel(d.day)}</b><br>${bs(d.revenue)} · ${num(d.tickets)} entradas · ${num(d.books)} libros`,
        directLabel: i === last && d.revenue ? bs(d.revenue) : "",
      };
    }),
    niceMax(Math.max(...trend.map((d) => d.revenue))),
    "revenue",
    "trend",
  );
}
function srecent(list) {
  const el = $("#srecent");
  if (!list.length) return (el.innerHTML = `<p class="none">Sin ventas en este período.</p>`);
  el.innerHTML = tableHTML(
    [
      { h: "Fecha", f: (r) => new Date(r.paidAt).toLocaleString("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
      { h: "Pedido", f: (r) => `<button class="link" type="button" data-order="${esc(r.code)}">${esc(r.code)}</button>` },
      { h: "Detalle", f: (r) => esc(r.detalle) },
      { h: "Monto", num: 1, f: (r) => bs(r.amount) },
      { h: "Origen", f: (r) => esc(r.source) },
      { h: "Comprador", f: (r) => esc(r.buyer) },
      { h: "Validó", f: (r) => esc(r.by) },
    ],
    list,
  );
}

/* =====================================================================
   EXPORTAR A EXCEL (.xlsx): una hoja por tabla, con números reales,
   encabezados fijos y filtros. Usa el período elegido en "Detalle por".
   ===================================================================== */
const H = (list) => list.map((v) => ({ v, s: "header" }));
const fechaHora = (t) => (t ? new Date(t).toLocaleString("es-BO", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

function breakdownSheet(name, title, rows, rangeName) {
  const tot = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, tickets: a.tickets + r.tickets, books: a.books + r.books, orders: a.orders + r.orders }), { revenue: 0, tickets: 0, books: 0, orders: 0 });
  const body = rows.map((r) => [r.name, { v: r.revenue, s: "money" }, { v: r.tickets, s: "int" }, { v: r.books, s: "int" }, { v: r.orders, s: "int" }, { v: tot.revenue ? r.revenue / tot.revenue : 0, s: "pct" }]);
  return {
    name,
    cols: [30, 14, 11, 10, 10, 12],
    freeze: 3,
    filter: true,
    filterEnd: 3 + body.length,
    rows: [
      [{ v: title, s: "title" }],
      [{ v: `Período: ${rangeName}`, s: "note" }],
      H(["Nombre", "Ingresos", "Entradas", "Libros", "Ventas", "% de ingresos"]),
      ...body,
      [{ v: "Total", s: "bold" }, { v: tot.revenue, s: "moneyBold" }, { v: tot.tickets, s: "intBold" }, { v: tot.books, s: "intBold" }, { v: tot.orders, s: "intBold" }, { v: tot.revenue ? 1 : 0, s: "pct" }],
    ],
  };
}

function reportSheets(d, clients) {
  const rangeName = RANGE_NAMES[d.range];
  const gen = new Date(d.generatedAt);
  const t = d.total;
  const k = d.kpis;
  const cmp = (label, p) => [label, { v: p.revenue, s: "money" }, { v: p.prev.revenue, s: "money" }, p.prev.revenue ? { v: (p.revenue - p.prev.revenue) / p.prev.revenue, s: "pct" } : "—", { v: p.tickets, s: "int" }, { v: p.books, s: "int" }, { v: p.orders, s: "int" }];
  const trendTot = d.trend.reduce((a, r) => ({ revenue: a.revenue + r.revenue, tickets: a.tickets + r.tickets, books: a.books + r.books, orders: a.orders + r.orders }), { revenue: 0, tickets: 0, books: 0, orders: 0 });

  return [
    {
      name: "Resumen",
      cols: [26, 16, 18, 13, 11, 10, 10],
      rows: [
        [{ v: "SOTIRIA · Reporte de ventas", s: "title" }],
        [{ v: `Período del detalle: ${rangeName} · Generado: ${fechaHora(gen)} (horario de Bolivia)`, s: "note" }],
        [],
        H(["Indicador", "Valor"]),
        ["Ingresos", { v: t.revenue, s: "money" }],
        ["Entradas vendidas", { v: t.tickets, s: "int" }],
        ["Libros vendidos", { v: t.books, s: "int" }],
        ["Ventas (pedidos pagados)", { v: t.orders, s: "int" }],
        ["Promedio por venta", { v: t.orders ? Math.round(t.revenue / t.orders) : 0, s: "money" }],
        [],
        H(["Comparación", "Ingresos", "Período anterior", "Variación", "Entradas", "Libros", "Ventas"]),
        cmp("Hoy (vs ayer)", k.day),
        cmp("Esta semana (vs anterior)", k.week),
        cmp("Este mes (vs anterior)", k.month),
        ...(d.demo ? [[], [{ v: "Atención: incluye datos de demostración.", s: "note" }]] : []),
      ],
    },
    {
      name: "Ingresos 30 días",
      cols: [13, 13, 14, 11, 10, 10],
      freeze: 3,
      filter: true,
      filterEnd: 3 + d.trend.length,
      rows: [
        [{ v: "Ingresos de los últimos 30 días", s: "title" }],
        [{ v: "Un día por fila, del más reciente al más antiguo", s: "note" }],
        H(["Fecha", "Día", "Ingresos", "Entradas", "Libros", "Ventas"]),
        ...[...d.trend].reverse().map((r) => [r.day, new Date(r.day + "T12:00:00").toLocaleDateString("es-BO", { weekday: "long" }), { v: r.revenue, s: "money" }, { v: r.tickets, s: "int" }, { v: r.books, s: "int" }, { v: r.orders, s: "int" }]),
        [{ v: "Total", s: "bold" }, { v: "", s: "bold" }, { v: trendTot.revenue, s: "moneyBold" }, { v: trendTot.tickets, s: "intBold" }, { v: trendTot.books, s: "intBold" }, { v: trendTot.orders, s: "intBold" }],
      ],
    },
    breakdownSheet("Por red social", "Ventas por red social de origen", d.bySource, rangeName),
    breakdownSheet("Obra o libro", "Ventas por producto", d.byProduct, rangeName),
    breakdownSheet("Por función", "Ventas por función de la obra", d.byFuncion, rangeName),
    breakdownSheet("Por día de semana", "Ventas por día de la semana", d.byWeekday, rangeName),
    breakdownSheet("Validaciones", "Pagos validados por persona", d.byValidator, rangeName),
    {
      name: "Últimas ventas",
      cols: [18, 13, 44, 12, 14, 26, 16],
      freeze: 3,
      filter: true,
      rows: [
        [{ v: "Últimas ventas", s: "title" }],
        [{ v: `Período: ${rangeName}`, s: "note" }],
        H(["Fecha", "Pedido", "Detalle", "Monto", "Origen", "Comprador", "Validó"]),
        ...d.recent.map((r) => [fechaHora(r.paidAt), r.code, r.detalle, { v: r.amount, s: "money" }, r.source, r.buyer, r.by]),
      ],
    },
    {
      name: "Clientes",
      cols: [28, 16, 12, 28, 18, 22, 10, 10, 14, 10, 10, 18],
      freeze: 3,
      filter: true,
      rows: [
        [{ v: "Clientes (CRM)", s: "title" }],
        [{ v: "Todos los contactos: compradores e interesados (no depende del período)", s: "note" }],
        H(["Nombre", "WhatsApp", "CI", "Correo", "Interés", "Origen", "Pedidos", "Pagados", "Gastado", "Entradas", "Libros", "Último contacto"]),
        ...clients.map((c) => [c.name || "", c.phone ? "+" + c.phone : "", c.ci || "", c.email || "", (c.interests || []).join(", "), (c.sources || []).join(", "), { v: c.orders || 0, s: "int" }, { v: c.paid || 0, s: "int" }, { v: c.spent || 0, s: "money" }, { v: c.tickets || 0, s: "int" }, { v: c.books || 0, s: "int" }, fechaHora(c.last)]),
      ],
    },
  ];
}

async function exportStats() {
  const btn = $("#sExport");
  if (!ST.data || btn.disabled) return;
  const label = btn.querySelector("span");
  btn.disabled = true;
  label.textContent = "Generando…";
  try {
    let clients = [];
    try {
      clients = await api("/crm");
    } catch {}
    const blob = XLSX.build(reportSheets(ST.data, clients));
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.download(blob, `sotiria-estadisticas-${ST.data.range}-${stamp}.xlsx`);
    toast("📊 Excel descargado");
  } catch (e) {
    toast("No se pudo generar el Excel: " + e.message, true);
  } finally {
    btn.disabled = false;
    label.textContent = "Descargar Excel";
  }
}

/* tooltip (mouse y teclado) */
(() => {
  const tip = $("#tip");
  const showTip = (el, x, y) => {
    tip.innerHTML = el.dataset.tip;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8);
    const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
    tip.style.transform = `translate(${left}px, ${top}px)`;
  };
  document.addEventListener("mousemove", (ev) => {
    const el = ev.target.closest("[data-tip]");
    if (el) showTip(el, ev.clientX, ev.clientY);
    else tip.hidden = true;
  });
  document.addEventListener("focusin", (ev) => {
    const el = ev.target.closest("[data-tip]");
    if (!el) return (tip.hidden = true);
    const r = el.getBoundingClientRect();
    showTip(el, r.left + r.width / 2, r.top);
  });
  document.addEventListener("focusout", () => (tip.hidden = true));
  window.addEventListener("scroll", () => (tip.hidden = true), { passive: true });
})();
