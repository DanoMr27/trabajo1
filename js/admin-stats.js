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

async function renderStats() {
  $("#view").innerHTML = `
    <div class="stats" id="sdash">
      <p class="demo-note" id="sDemo" hidden><b>Datos de demostración.</b> Incluyen ventas de prueba. Bórralas antes de vender de verdad con <code>node server/seed.js --clear</code>.</p>
      <div class="v-head row-head"><div><h2>Estadísticas de ventas</h2><p class="msg" id="sTz"></p></div><span class="msg" id="sUpd"></span></div>
      <div class="skpis" id="skpis"></div>
      <article class="panel wide">
        <header class="panel-h"><div><h3>Ingresos de los últimos 30 días</h3><p class="sub" id="trendSub"></p></div><button class="link" type="button" data-stoggle="trend">Ver tabla</button></header>
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
      <p class="range-total" id="rangeTotal"></p>
      <div class="adm-grid">
        <article class="panel"><header class="panel-h"><div><h3>De qué red vienen</h3><p class="sub">Según el enlace de la publicación (?src=)</p></div><button class="link" type="button" data-stoggle="source">Ver tabla</button></header><div id="ssource"></div></article>
        <article class="panel"><header class="panel-h"><div><h3>Obra o libro</h3><p class="sub">Qué se vende más</p></div><button class="link" type="button" data-stoggle="product">Ver tabla</button></header><div id="sproduct"></div></article>
        <article class="panel"><header class="panel-h"><div><h3>Por función</h3><p class="sub">Entradas de cada fecha</p></div><button class="link" type="button" data-stoggle="funcion">Ver tabla</button></header><div id="sfuncion"></div></article>
        <article class="panel"><header class="panel-h"><div><h3>Por día de la semana</h3><p class="sub" id="weekdaySub">Qué días se vende más</p></div><button class="link" type="button" data-stoggle="weekday">Ver tabla</button></header><div id="sweekday"></div></article>
        <article class="panel"><header class="panel-h"><div><h3>Validaciones por persona</h3><p class="sub">Quién aprobó cada pago</p></div><button class="link" type="button" data-stoggle="validator">Ver tabla</button></header><div id="svalidator"></div></article>
        <article class="panel wide"><header class="panel-h"><div><h3>Últimas ventas</h3></div></header><div id="srecent"></div></article>
      </div>
    </div>`;
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
  $("#rangeTotal").innerHTML = d.total.orders
    ? `En ${RANGE_NAMES[d.range]}: <b>${bs(d.total.revenue)}</b> · ${num(d.total.tickets)} entradas · ${num(d.total.books)} libros · ${num(d.total.orders)} ventas · promedio ${bs(Math.round(d.total.revenue / d.total.orders))}`
    : `Sin ventas en ${RANGE_NAMES[d.range]}.`;
  const rows = (list) => list.map((x) => ({ ...x, value: x[m] }));
  spanel("source", rows(d.bySource), hbars);
  spanel("product", rows(d.byProduct), hbars);
  spanel("funcion", rows(d.byFuncion), hbars, { keepOrder: true });
  spanel("weekday", rows(d.byWeekday), weekdayChart, { keepOrder: true });
  spanel("validator", rows(d.byValidator), hbars);
  srecent(d.recent);
  const best = [...d.byWeekday].sort((a, b) => b[m] - a[m])[0];
  const tot = d.byWeekday.reduce((a, x) => a + x[m], 0);
  $("#weekdaySub").textContent = tot ? `El que más vende: ${best.name} (${pct(best[m], tot)} del total)` : "Qué días se vende más";
}

function delta(cur, prev, label) {
  if (!prev && !cur) return `<p class="delta flat">Sin ventas ${label}</p>`;
  if (!prev) return `<p class="delta flat">Sin ventas ${label} para comparar</p>`;
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return `<p class="delta flat"><span aria-hidden="true">＝</span> Igual que ${label}</p>`;
  const up = p > 0;
  return `<p class="delta ${up ? "up" : "down"}"><span aria-hidden="true">${up ? "▲" : "▼"}</span> ${up ? "Sube" : "Baja"} ${Math.abs(p)}% vs ${label} <small>(${bs(prev)})</small></p>`;
}
function skpis(k) {
  $("#skpis").innerHTML = [
    ["Hoy", k.day, "ayer a esta hora"],
    ["Esta semana", k.week, "la semana pasada"],
    ["Este mes", k.month, "el mes pasado"],
  ]
    .map(([title, p, label]) => `<article class="skpi"><h3>${title}</h3><p class="kpi-v">${bs(p.revenue)}</p><p class="kpi-s">${num(p.tickets)} entradas · ${num(p.books)} libros · ${num(p.orders)} ventas</p>${delta(p.revenue, p.prev.revenue, label)}</article>`)
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
