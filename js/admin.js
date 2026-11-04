/* =====================================================================
   SOTIRIA Tickets — panel del propietario
   Los datos los calcula el servidor (/api/admin/stats) y solo los
   entrega con una sesión iniciada con la contraseña del propietario.
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Math.round(n).toLocaleString("es-BO");
const bs = (n) => "Bs " + num(n);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + "%";
const fmt = (metric, v) => (metric === "revenue" ? bs(v) : `${num(v)} ${v === 1 ? "entrada" : "entradas"}`);
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dayLabel = (iso) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};
const RANGE_NAMES = { day: "hoy", week: "esta semana", month: "este mes", d30: "los últimos 30 días", d90: "los últimos 90 días", all: "todo el historial" };

const state = { range: "month", metric: "revenue", data: null, tables: new Set() };

/* ---------------- acceso ---------------- */
async function api(path, opts = {}) {
  const r = await fetch("/api/admin" + path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(j.error || "No se pudo conectar con el servidor.");
    e.status = r.status;
    throw e;
  }
  return j;
}

function show(id) {
  ["login", "noserver", "dash"].forEach((x) => ($("#" + x).hidden = x !== id));
  $("#admActions").hidden = id !== "dash";
  if (id === "login") setTimeout(() => $("#pw").focus(), 30);
}

async function start() {
  if (location.protocol === "file:") return show("noserver");
  try {
    const me = await api("/me");
    if (me.auth) return load();
    show("login");
    if (!me.configured) $("#loginErr").textContent = "El panel aún no tiene contraseña. En la terminal ejecuta: node server/set-password.js";
  } catch {
    show("noserver");
  }
}

$("#loginForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const btn = $("#loginBtn");
  btn.disabled = true;
  $("#loginErr").textContent = "";
  try {
    await api("/login", { method: "POST", body: { password: $("#pw").value } });
    $("#pw").value = "";
    await load();
  } catch (e) {
    $("#loginErr").textContent = e.message;
    $("#pw").select();
  } finally {
    btn.disabled = false;
  }
};

$("#logout").onclick = async () => {
  try {
    await api("/logout", { method: "POST" });
  } catch {}
  state.data = null;
  show("login");
};

/* ---------------- datos ---------------- */
let refreshTimer;
async function load() {
  $("#dash").classList.add("busy");
  try {
    state.data = await api("/stats?range=" + state.range);
    show("dash");
    render();
  } catch (e) {
    if (e.status === 401) return show("login");
    $("#updated").textContent = "Sin conexión con el servidor";
  } finally {
    $("#dash").classList.remove("busy");
  }
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(load, 60000); // se actualiza solo cada minuto
}
$("#refresh").onclick = load;

function setSeg(group, value) {
  $$("#" + group + " button").forEach((b) => b.setAttribute("aria-checked", b.dataset.v === value));
}
$("#fRange").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b || b.dataset.v === state.range) return;
  state.range = b.dataset.v;
  setSeg("fRange", state.range);
  load();
});
$("#fMetric").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b || b.dataset.v === state.metric) return;
  state.metric = b.dataset.v;
  setSeg("fMetric", state.metric);
  render();
});
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-toggle]");
  if (!t) return;
  const k = t.dataset.toggle;
  state.tables.has(k) ? state.tables.delete(k) : state.tables.add(k);
  render();
});

/* ---------------- render ---------------- */
function render() {
  const d = state.data;
  if (!d) return;
  const m = state.metric;
  $("#demoNote").hidden = !d.demo;
  $("#updated").textContent = "Actualizado " + new Date(d.generatedAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
  $("#tzNote").textContent = `Horario de Bolivia (UTC${d.tzOffset >= 0 ? "+" : ""}${d.tzOffset}). Cada período se compara con el mismo tramo del período anterior.`;
  renderKpis(d.kpis);
  renderTrend(d.trend);

  $("#rangeTotal").innerHTML = d.total.orders
    ? `En ${RANGE_NAMES[d.range]}: <b>${bs(d.total.revenue)}</b> · ${num(d.total.tickets)} entradas · ${num(d.total.orders)} ventas · ticket promedio ${bs(d.total.revenue / d.total.orders)}`
    : `Sin ventas en ${RANGE_NAMES[d.range]}.`;

  const rows = (list) => list.map((x) => ({ name: x.name, value: x[m], revenue: x.revenue, tickets: x.tickets, orders: x.orders }));
  panel("venue", rows(d.byVenue), hbars);
  panel("zone", rows(d.byZone), hbars);
  panel("cat", rows(d.byCategory), hbars);
  panel("weekday", rows(d.byWeekday), weekdayChart, { keepOrder: true });
  renderEvents(d.topEvents);
  renderMethod(d.byMethod);
  renderRecent(d.recent);

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

function renderKpis(k) {
  const tiles = [
    ["Hoy", k.day, "ayer a esta hora"],
    ["Esta semana", k.week, "la semana pasada"],
    ["Este mes", k.month, "el mes pasado"],
  ];
  $("#kpis").innerHTML = tiles
    .map(
      ([title, p, label]) => `
    <article class="kpi">
      <h2>${title}</h2>
      <p class="kpi-v">${bs(p.revenue)}</p>
      <p class="kpi-s">${num(p.tickets)} entradas · ${num(p.orders)} ventas</p>
      ${delta(p.revenue, p.prev.revenue, label)}
    </article>`,
    )
    .join("");
}

/* Escala "redonda" para los ejes */
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
      { h: "Ventas", num: 1, f: (r) => num(r.orders) },
      { h: "% ingresos", num: 1, f: (r) => pct(r.revenue, tot) },
    ],
    rows,
  );
}

function panel(id, rows, chart, opts = {}) {
  const el = $("#" + id);
  $(`[data-toggle="${id}"]`).textContent = state.tables.has(id) ? "Ver gráfico" : "Ver tabla";
  const sorted = opts.keepOrder ? rows : [...rows].sort((a, b) => b.value - a.value);
  if (!rows.some((r) => r.orders)) return (el.innerHTML = `<p class="none">Sin ventas en este período.</p>`);
  el.innerHTML = state.tables.has(id) ? breakdownTable(sorted) : chart(sorted);
}

const tipFor = (r, total) =>
  `<b>${esc(r.name)}</b><br>${bs(r.revenue)} · ${num(r.tickets)} entradas<br>${num(r.orders)} ventas · ${pct(r[state.metric], total)} del total`;

/* Barras horizontales ordenadas (una sola serie, un solo color) */
function hbars(rows) {
  const m = state.metric;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const total = rows.reduce((a, r) => a + r[m], 0);
  return `<ul class="hbars">${rows
    .map(
      (r) => `
    <li tabindex="0" data-tip="${esc(tipFor(r, total))}">
      <span class="hb-name">${esc(r.name)}</span>
      <span class="hb-track">${r.value > 0 ? `<i style="width:${(r.value / max) * 100}%"></i>` : ""}</span>
      <span class="hb-val">${fmt(m, r.value)} <small>${pct(r.value, total)}</small></span>
    </li>`,
    )
    .join("")}</ul>`;
}

/* Barras verticales: se resalta el mejor día y el resto queda en gris */
function weekdayChart(rows) {
  const m = state.metric;
  const max = Math.max(...rows.map((r) => r.value), 0);
  const top = niceMax(max);
  const total = rows.reduce((a, r) => a + r[m], 0);
  const bestIdx = rows.findIndex((r) => r.value === max);
  return vchart(
    rows.map((r, i) => ({
      label: r.name.slice(0, 3),
      value: r.value,
      hi: i === bestIdx && max > 0,
      tip: tipFor(r, total),
      directLabel: i === bestIdx && max > 0 ? fmt(m, r.value) : "",
    })),
    top,
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
      ${cols
        .map(
          (c) => `<div class="col${c.hi ? " hi" : ""}" tabindex="0" data-tip="${esc(c.tip)}" aria-label="${esc(c.label)}: ${esc(fmt(metric, c.value))}">
            <i style="height:${(c.value / top) * 100}%">${c.directLabel ? `<em>${esc(c.directLabel)}</em>` : ""}</i></div>`,
        )
        .join("")}
    </div>
    <div class="vc-x" aria-hidden="true">${cols.map((c) => `<span>${esc(c.label)}</span>`).join("")}</div>
  </div>`;
}

function renderTrend(trend) {
  const el = $("#trend");
  $(`[data-toggle="trend"]`).textContent = state.tables.has("trend") ? "Ver gráfico" : "Ver tabla";
  const tot = trend.reduce((a, d) => a + d.revenue, 0);
  const best = [...trend].sort((a, b) => b.revenue - a.revenue)[0];
  $("#trendSub").textContent = tot ? `Total: ${bs(tot)} · mejor día: ${dayLabel(best.day)} (${bs(best.revenue)})` : "Aún no hay ventas en los últimos 30 días.";
  if (state.tables.has("trend")) {
    el.innerHTML = tableHTML(
      [
        { h: "Día", f: (r) => dayLabel(r.day) },
        { h: "Ingresos", num: 1, f: (r) => bs(r.revenue) },
        { h: "Entradas", num: 1, f: (r) => num(r.tickets) },
        { h: "Ventas", num: 1, f: (r) => num(r.orders) },
      ],
      [...trend].reverse(),
    );
    return;
  }
  const top = niceMax(Math.max(...trend.map((d) => d.revenue)));
  const last = trend.length - 1;
  el.innerHTML = vchart(
    trend.map((d, i) => {
      const wd = new Date(d.day + "T12:00:00").toLocaleDateString("es-BO", { weekday: "long" });
      return {
        label: i % 5 === last % 5 ? dayLabel(d.day) : "",
        value: d.revenue,
        hi: false,
        tip: `<b>${wd} ${dayLabel(d.day)}</b><br>${bs(d.revenue)} · ${num(d.tickets)} entradas · ${num(d.orders)} ventas`,
        directLabel: i === last && d.revenue ? bs(d.revenue) : "",
      };
    }),
    top,
    "revenue",
    "trend",
  );
}

function renderEvents(list) {
  const el = $("#events");
  if (!list.length) return (el.innerHTML = `<p class="none">Sin ventas en este período.</p>`);
  el.innerHTML = tableHTML(
    [
      { h: "Evento", f: (r) => `<b>${esc(r.name)}</b><small>${esc(r.venue)}</small>` },
      { h: "Entradas", num: 1, f: (r) => num(r.tickets) },
      { h: "Ingresos", num: 1, f: (r) => bs(r.revenue) },
    ],
    list,
  );
}

function renderMethod(list) {
  const el = $("#method");
  const m = state.metric;
  const tot = list.reduce((a, x) => a + x[m], 0);
  if (!tot) return (el.innerHTML = `<p class="none">Sin ventas en este período.</p>`);
  el.innerHTML = `<div class="split">${list
    .map((x) => `<div><p class="split-v">${pct(x[m], tot)}</p><p class="split-l">${esc(x.name)}</p><p class="kpi-s">${fmt(m, x[m])} · ${num(x.orders)} ventas</p></div>`)
    .join("")}</div>`;
}

function renderRecent(list) {
  const el = $("#recent");
  if (!list.length) return (el.innerHTML = `<p class="none">Sin ventas en este período.</p>`);
  el.innerHTML = tableHTML(
    [
      { h: "Fecha", f: (r) => new Date(r.paidAt).toLocaleString("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
      { h: "Evento", f: (r) => `<b>${esc(r.event)}</b><small>${esc(r.venue)}</small>` },
      { h: "Zona", f: (r) => esc(r.zone) },
      { h: "Cant.", num: 1, f: (r) => r.qty },
      { h: "Monto", num: 1, f: (r) => bs(r.amount) },
      { h: "Pago", f: (r) => (r.method === "card" ? "Tarjeta" : "QR") },
      { h: "Comprador", f: (r) => esc(r.buyer) },
    ],
    list,
  );
}

/* ---------------- tooltip (mouse y teclado) ---------------- */
const tip = $("#tip");
function showTip(el, x, y) {
  tip.innerHTML = el.dataset.tip;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, x - r.width / 2), innerWidth - r.width - 8);
  const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
  tip.style.transform = `translate(${left}px, ${top}px)`;
}
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

setSeg("fRange", state.range);
setSeg("fMetric", state.metric);
start();
