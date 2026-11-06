/* =====================================================================
   SOTIRIA — panel de ventas
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bs = (n) => "Bs " + Number(n || 0).toLocaleString("es-BO");
const STATUS = { nueva: "Nueva", esperando_pago: "Esperando pago", en_revision: "Por revisar", aprobada: "Aprobada", rechazada: "Rechazada", vencida: "Vencida" };
const st = (s) => `<span class="st st-${esc(s)}">${esc(STATUS[s] || s)}</span>`;
const media = (f) => "/api/admin/media/" + encodeURIComponent(f);
const fmt = (iso) => new Date(iso).toLocaleString("es-BO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const hm = (iso) => new Date(iso).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
function ago(iso) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 6e4);
  return m < 1 ? "ahora" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`;
}
const ME = () => localStorage.getItem("st_staff") || "panel";

async function api(path, body) {
  const r = await fetch("/api/admin" + path, body !== undefined ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  if (r.status === 401) {
    showLogin();
    throw new Error("Inicia sesión");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Error");
  return j;
}
let toastT;
function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast on" + (bad ? " bad" : "");
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.className = "toast"), 3500);
}

/* ---------------- sesión ---------------- */
function showLogin() {
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#lname").value = localStorage.getItem("st_staff") || "";
  ($("#lname").value ? $("#lpass") : $("#lname")).focus();
}
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#lerr").textContent = "";
  const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: $("#lpass").value }) });
  if (!r.ok) return ($("#lerr").textContent = (await r.json()).error || "Error");
  localStorage.setItem("st_staff", $("#lname").value.trim() || "panel");
  $("#lpass").value = "";
  start();
};
$("#logout").onclick = async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  showLogin();
};

/* ---------------- pestañas ---------------- */
let TAB = "receipts";
$("#tabs").onclick = (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  TAB = b.dataset.tab;
  $$("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $$(".tab").forEach((t) => (t.hidden = t.id !== "t-" + TAB));
  refresh();
};

/* ---------------- resumen ---------------- */
let SUM = null,
  lastReview = null;
async function loadSummary() {
  SUM = await api("/summary");
  const s = SUM.by;
  const av = SUM.availability;
  $("#stats").innerHTML = `
    <div class="stat ${s.en_revision ? "hl" : ""}"><small>Por revisar</small><b>${s.en_revision}</b><span>comprobantes</span></div>
    <div class="stat"><small>Esperando pago</small><b>${s.esperando_pago + s.nueva}</b><span>QR enviado o por escribir</span></div>
    <div class="stat"><small>Aprobadas</small><b>${s.aprobada}</b><span>${SUM.sold.obra || 0} entradas · ${SUM.sold.libro || 0} libros</span></div>
    <div class="stat"><small>Recaudado</small><b>${bs(SUM.revenue)}</b><span>pagos verificados</span></div>
    <div class="stat"><small>Disponibles</small><b>${Object.values(av.obra || {}).reduce((a, b) => a + b, 0)}</b><span>${Object.entries(av.obra || {}).map(([k, v]) => { const f = DATA.PRODUCTS.obra.funciones.find((x) => x.id === k); return `${f ? f.d.slice(8) + "/" + f.d.slice(5, 7) : k}: ${v}`; }).join(" · ")}</span></div>`;
  const setB = (id, n) => {
    $(id).hidden = !n;
    $(id).textContent = n;
  };
  setB("#bReceipts", s.en_revision);
  setB("#bChats", SUM.unread);
  setB("#bQR", SUM.missingQR.length);
  $("#simTab").hidden = SUM.whatsapp !== "simulador";
  $("#waMode").innerHTML = SUM.whatsapp === "real" ? "WhatsApp: <b>conectado ✓</b>" : "WhatsApp: <b>simulador</b>";
  document.title = (s.en_revision ? `(${s.en_revision}) ` : "") + "Panel | SOTIRIA";
  if (lastReview !== null && s.en_revision > lastReview) {
    toast("🧾 Nuevo comprobante por revisar");
    beep();
  }
  lastReview = s.en_revision;
}
function beep() {
  try {
    const a = new AudioContext(),
      o = a.createOscillator(),
      g = a.createGain();
    o.connect(g).connect(a.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.4);
    o.start();
    o.stop(a.currentTime + 0.4);
  } catch {}
}

/* ---------------- comprobantes ---------------- */
async function loadReceipts() {
  const list = await api("/orders?status=en_revision");
  if (!list.length) {
    $("#receiptList").innerHTML = `<p class="empty">✨ No hay comprobantes pendientes. Cuando un cliente envíe uno por WhatsApp aparecerá aquí.</p>`;
    return;
  }
  const details = await Promise.all(list.map((o) => api("/orders/" + o.id)));
  $("#receiptList").innerHTML = details
    .map(({ order: o, messages }) => {
      const recs = messages.filter((m) => (o.receipts || []).includes(m.id));
      const imgs = recs
        .map((m) => (m.type === "document" ? `<a class="rpdf" href="${media(m.media)}" target="_blank" rel="noopener">📄 Ver PDF</a>` : `<img class="rimg" src="${media(m.media)}" alt="Comprobante" data-zoom="${media(m.media)}">`))
        .join("");
      const lastRec = recs[recs.length - 1];
      const texts = messages.filter((m) => m.dir === "in" && m.type === "text").slice(-2);
      return `
      <article class="rcard">
        <div class="rimgs">${imgs || '<p class="empty">Sin imagen</p>'}</div>
        <div class="rinfo">
          <h2>${esc(o.buyer.n)} ${st(o.status)}</h2>
          <p class="amt">${bs(o.amount)}<small>Monto que debe figurar en el comprobante y en la cuenta</small></p>
          <dl class="kv">
            <dt>Orden</dt><dd class="mono">${esc(o.id)}</dd>
            <dt>Compra</dt><dd>${o.qty} × ${esc(o.productName)}${o.when ? " — " + esc(o.when) : ""}</dd>
            ${o.deliveryName ? `<dt>Entrega</dt><dd>${esc(o.deliveryName)}</dd>` : ""}
            <dt>CI</dt><dd>${esc(o.buyer.ci)}</dd>
            <dt>WhatsApp</dt><dd>${esc(o.wa || o.buyer.tel)}</dd>
            <dt>Recibido</dt><dd class="ago">${lastRec ? ago(lastRec.at) : ""}</dd>
          </dl>
          <div class="ractions">
            <button class="b ok" data-approve="${esc(o.id)}" data-amt="${o.amount}">✅ Aprobar y enviar entrada</button>
            <button class="b bad" data-reject="${esc(o.id)}">✕ Rechazar</button>
            <button class="b" data-openchat="${esc(o.wa || "")}">💬 Ver chat</button>
          </div>
          ${texts.length ? `<div class="msgs-mini">${texts.map((m) => `<p>💬 ${esc(m.text)}</p>`).join("")}</div>` : ""}
        </div>
      </article>`;
    })
    .join("");
}

/* acciones comunes */
document.addEventListener("click", async (e) => {
  const z = e.target.closest("[data-zoom]");
  if (z) return openLB(`<img src="${esc(z.dataset.zoom)}" alt="Comprobante ampliado">`);
  const ap = e.target.closest("[data-approve]");
  if (ap) {
    if (!confirm(`¿Confirmaste en la cuenta del banco que llegaron ${bs(ap.dataset.amt)}?\n\nAl aprobar se genera la entrada y se envía al WhatsApp del cliente.`)) return;
    ap.disabled = true;
    try {
      const r = await api(`/orders/${ap.dataset.approve}/approve`, { by: ME() });
      toast(r.sendError ? "Entrada emitida, pero WhatsApp falló: " + r.sendError : `✅ Entrada ${r.order.ticket.code} enviada`, !!r.sendError);
      closeLB();
      refresh();
    } catch (err) {
      toast(err.message, true);
      ap.disabled = false;
    }
    return;
  }
  const rj = e.target.closest("[data-reject]");
  if (rj) {
    const reason = prompt("Motivo del rechazo (se le enviará al cliente):", "El pago no figura en nuestra cuenta");
    if (reason === null) return;
    try {
      await api(`/orders/${rj.dataset.reject}/reject`, { reason, by: ME() });
      toast("Orden rechazada y cliente notificado");
      closeLB();
      refresh();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  const rs = e.target.closest("[data-resend]");
  if (rs) {
    try {
      await api(`/orders/${rs.dataset.resend}/resend`, { by: ME() });
      toast("Reenviado por WhatsApp");
      refresh();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  const oc = e.target.closest("[data-openchat]");
  if (oc && oc.dataset.openchat) {
    CHAT = oc.dataset.openchat;
    closeLB();
    $('[data-tab="chats"]').click();
    return;
  }
  const od = e.target.closest("[data-order]");
  if (od) openOrder(od.dataset.order);
});

/* ---------------- visor ---------------- */
function openLB(html) {
  $("#lbBody").innerHTML = html;
  $("#lb").hidden = false;
}
function closeLB() {
  $("#lb").hidden = true;
  $("#lbBody").innerHTML = "";
}
$("#lbX").onclick = closeLB;
$("#lb").onclick = (e) => e.target === $("#lb") && closeLB();
document.addEventListener("keydown", (e) => e.key === "Escape" && closeLB());

/* ---------------- chats ---------------- */
let CHAT = null;
async function loadChats() {
  const list = await api("/chats");
  $("#chatList").innerHTML = list.length
    ? list
        .map(
          (c) => `<button class="citem ${c.wa === CHAT ? "on" : ""}" data-chat="${esc(c.wa)}">
      <div class="top"><b>${esc(c.name || "+" + c.wa)}${c.unread ? `<span class="badge">${c.unread}</span>` : ""}</b><time>${c.last ? hm(c.last.at) : ""}</time></div>
      <p>${c.order ? st(c.order.status) + " " : ""}${c.last ? (c.last.dir === "out" ? "Tú: " : "") + esc(c.last.type === "text" ? c.last.text : c.last.type === "document" ? "📄 Documento" : "📷 Imagen") : ""}</p>
    </button>`,
        )
        .join("")
    : `<p class="empty">Aún no hay conversaciones.</p>`;
  if (CHAT) await loadThread();
}
$("#chatList").onclick = (e) => {
  const b = e.target.closest("[data-chat]");
  if (!b) return;
  CHAT = b.dataset.chat;
  loadChats();
};
function bubble(m, simMode) {
  const mine = simMode ? m.dir === "in" : m.dir === "out";
  const body =
    (m.media ? (m.type === "document" ? `<a href="${media(m.media)}" target="_blank" rel="noopener">📄 Ver documento</a><br>` : `<img src="${media(m.media)}" alt="" data-zoom="${media(m.media)}">`) : "") + esc(m.text || "");
  return `<div class="bub ${simMode ? (mine ? "me" : "") : mine ? "out" : ""}">${!simMode && m.dir === "out" && m.by && m.by !== "sistema" ? `<span class="by">${esc(m.by)}</span><br>` : ""}${body}${m.flag && !simMode ? `<span class="flag">⚠ ${esc(m.flag)}</span>` : ""}${m.error ? `<span class="fail">No enviado: ${esc(m.error)}</span>` : ""}<time>${hm(m.at)}${!simMode && m.dir === "out" && !m.by ? "" : ""}</time></div>`;
}
let threadSig = "";
async function loadThread() {
  const { chat, messages, orders } = await api("/chats/" + CHAT);
  const o = orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const sig = CHAT + messages.length + (o ? o.status : "");
  if (sig === threadSig && $("#thread")) return;
  threadSig = sig;
  const draft = $("#cText")?.value || "";
  $("#chatView").innerHTML = `
    <div class="chead"><div><b>${esc(o?.buyer.n || chat.name || "+" + CHAT)}</b><br><small>+${esc(CHAT)}${o ? ` · <a href="#" data-order="${esc(o.id)}">${esc(o.id)}</a> · ${o.qty} × ${esc(o.productName)} · ${bs(o.amount)}` : ""}</small></div>
      <div class="ractions">${o ? st(o.status) : ""}
        ${o && o.status === "en_revision" ? `<button class="b ok sm" data-approve="${esc(o.id)}" data-amt="${o.amount}">✅ Aprobar</button><button class="b bad sm" data-reject="${esc(o.id)}">Rechazar</button>` : ""}
        ${o && (o.status === "nueva" || o.status === "esperando_pago") ? `<button class="b sm" data-resend="${esc(o.id)}">Reenviar QR</button><button class="b ok sm" data-approve="${esc(o.id)}" data-amt="${o.amount}">Aprobar igual</button>` : ""}
        ${o && o.status === "aprobada" ? `<button class="b sm" data-resend="${esc(o.id)}">Reenviar entrada</button>` : ""}
      </div></div>
    <div class="thread" id="thread">${messages.map((m) => bubble(m)).join("")}</div>
    <form class="cform" id="cForm"><input id="cText" placeholder="Escribe una respuesta…" autocomplete="off" aria-label="Respuesta"><button class="b primary">Enviar</button></form>`;
  $("#cText").value = draft;
  const th = $("#thread");
  th.scrollTop = th.scrollHeight;
  $("#cForm").onsubmit = async (e) => {
    e.preventDefault();
    const text = $("#cText").value.trim();
    if (!text) return;
    try {
      await api(`/chats/${CHAT}/send`, { text, orderId: o?.id, by: ME() });
      $("#cText").value = "";
      threadSig = "";
      loadThread();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

/* ---------------- órdenes ---------------- */
$("#oStatus").innerHTML += Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
$("#oStatus").onchange = () => loadOrders();
let searchT;
$("#oSearch").oninput = () => (clearTimeout(searchT), (searchT = setTimeout(loadOrders, 250)));
async function loadOrders() {
  const q = new URLSearchParams({ status: $("#oStatus").value, q: $("#oSearch").value });
  const list = await api("/orders?" + q);
  $("#orderTable").innerHTML =
    `<thead><tr><th>Orden</th><th>Fecha</th><th>Cliente</th><th>Compra</th><th>Monto</th><th>Origen</th><th>Estado</th></tr></thead><tbody>` +
    (list.length
      ? list
          .map(
            (o) => `<tr class="click" data-order="${esc(o.id)}"><td class="mono">${esc(o.id)}</td><td>${fmt(o.createdAt)}</td><td>${esc(o.buyer.n)}<br><small>${esc(o.buyer.tel)}</small></td><td>${o.qty} × ${esc(o.productName)}${o.when ? `<br><small>${esc(o.when)}</small>` : ""}</td><td>${bs(o.amount)}</td><td><span class="tag">${esc(o.src)}</span></td><td>${st(o.status)}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="7" class="empty">Sin órdenes</td></tr>`) +
    "</tbody>";
}
async function openOrder(id) {
  const { order: o, messages } = await api("/orders/" + id);
  const recs = messages.filter((m) => (o.receipts || []).includes(m.id));
  openLB(`<div class="detail">
    <h2>${esc(o.id)} ${st(o.status)}</h2>
    <dl class="kv">
      <dt>Compra</dt><dd>${o.qty} × ${esc(o.productName)}${o.when ? " — " + esc(o.when) : ""}</dd>
      <dt>Monto</dt><dd><b>${bs(o.amount)}</b></dd>
      ${o.deliveryName ? `<dt>Entrega</dt><dd>${esc(o.deliveryName)}</dd>` : ""}
      <dt>Cliente</dt><dd>${esc(o.buyer.n)} · CI ${esc(o.buyer.ci)}</dd>
      <dt>Celular</dt><dd>${esc(o.buyer.tel)}${o.wa ? ` (WhatsApp +${esc(o.wa)})` : ""}</dd>
      ${o.buyer.em ? `<dt>Correo</dt><dd>${esc(o.buyer.em)}</dd>` : ""}
      <dt>Origen</dt><dd>${esc(o.src)}</dd>
      ${o.ticket ? `<dt>Entrada</dt><dd><a href="/entrada.html?c=${esc(o.ticket.code)}" target="_blank" class="mono">${esc(o.ticket.code)}</a> · ingresos ${o.ticket.checkedIn || 0}/${o.qty}</dd>` : ""}
      ${o.reviewedBy ? `<dt>Validó</dt><dd>${esc(o.reviewedBy)}</dd>` : ""}
      ${o.rejectReason ? `<dt>Motivo</dt><dd>${esc(o.rejectReason)}</dd>` : ""}
    </dl>
    ${recs.length ? `<div class="rimgs" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px">${recs.map((m) => (m.type === "document" ? `<a class="rpdf" href="${media(m.media)}" target="_blank">📄 PDF</a>` : `<img class="rimg" src="${media(m.media)}" alt="Comprobante" onclick="window.open(this.src)">`)).join("")}</div>` : ""}
    <div class="ractions">
      ${o.status !== "aprobada" ? `<button class="b ok" data-approve="${esc(o.id)}" data-amt="${o.amount}">✅ Aprobar</button>` : ""}
      ${o.status !== "aprobada" && o.status !== "rechazada" ? `<button class="b bad" data-reject="${esc(o.id)}">Rechazar</button>` : ""}
      ${["nueva", "esperando_pago", "aprobada"].includes(o.status) ? `<button class="b" data-resend="${esc(o.id)}">Reenviar ${o.status === "aprobada" ? "entrada" : "QR"}</button>` : ""}
      ${o.wa ? `<button class="b" data-openchat="${esc(o.wa)}">💬 Chat</button>` : ""}
    </div>
    <h3 style="margin-top:18px">Historial</h3>
    <ul class="hist">${(o.history || []).map((h) => `<li><time>${fmt(h.at)}</time><span>${esc(h.what)} <small>(${esc(h.by)})</small></span></li>`).join("")}</ul>
  </div>`);
}

/* ---------------- CRM ---------------- */
let CRM = null;
async function loadCRM() {
  CRM = await api("/crm");
  const cs = CRM.customers;
  const src = {};
  cs.forEach((c) => c.sources.forEach((s) => (src[s] = (src[s] || 0) + 1)));
  $("#crmStats").innerHTML = `
    <div class="stat"><small>Contactos</small><b>${cs.length}</b></div>
    <div class="stat"><small>Compradores</small><b>${cs.filter((c) => c.paid).length}</b></div>
    <div class="stat"><small>Interesados podcast</small><b>${CRM.leads.filter((l) => l.interest === "podcast").length}</b></div>
    <div class="stat"><small>Por canal</small><span>${Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)}: <b style="display:inline;font-size:1rem">${v}</b>`).join(" · ") || "—"}</span></div>`;
  drawCRM();
}
$("#cSearch").oninput = () => drawCRM();
function drawCRM() {
  const q = $("#cSearch").value.toLowerCase();
  const rows = CRM.customers.filter((c) => !q || [c.name, c.ci, c.tel, c.email].join(" ").toLowerCase().includes(q));
  $("#crmTable").innerHTML =
    `<thead><tr><th>Nombre</th><th>Contacto</th><th>Compras</th><th>Gastado</th><th>Productos / interés</th><th>Origen</th><th>Último contacto</th></tr></thead><tbody>` +
    (rows.length
      ? rows
          .map(
            (c) => `<tr><td>${esc(c.name)}${c.ci ? `<br><small>CI ${esc(c.ci)}</small>` : ""}</td><td>${esc(c.tel)}${c.email ? `<br><small>${esc(c.email)}</small>` : ""}<br><a class="b wa sm" style="margin-top:4px" href="https://wa.me/${esc(c.wa)}" target="_blank" rel="noopener">WhatsApp</a></td><td>${c.paid}/${c.orders}</td><td>${bs(c.spent)}</td><td>${c.products.map((p) => `<span class="tag">${esc(p)}</span>`).join("")}${c.interests.map((p) => `<span class="tag">⭐ ${esc(p)}</span>`).join("")}</td><td>${c.sources.map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</td><td>${esc(c.last.slice(0, 10))}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="7" class="empty">Sin clientes todavía</td></tr>`) +
    "</tbody>";
}

/* ---------------- QRs ---------------- */
async function loadQR() {
  const list = await api("/qr");
  const t = Date.now();
  $("#qrGrid").innerHTML = list
    .map(
      (q) => `<div class="qri ${q.loaded ? "" : "miss"}">
      <b>${bs(q.amount)}</b><small>${describeAmount(q.amount)}</small>
      ${q.loaded ? `<img src="/api/admin/qr/${q.amount}?t=${t}" alt="QR de ${bs(q.amount)}" data-zoom="/api/admin/qr/${q.amount}?t=${t}">` : `<div class="ph">Falta</div>`}
      <label class="b sm block" style="margin:0">${q.loaded ? "Cambiar" : "Subir QR"}<input type="file" accept="image/png,image/jpeg" data-qr="${q.amount}" hidden></label>
    </div>`,
    )
    .join("");
}
function describeAmount(a) {
  return Object.values(DATA.PRODUCTS)
    .filter((p) => p.price && a % p.price === 0 && a / p.price <= p.maxQty)
    .map((p) => `${a / p.price} ${a === p.price ? p.unit[0] : p.unit[1]}`)
    .join(" · ");
}
$("#qrGrid").onchange = async (e) => {
  const inp = e.target.closest("[data-qr]");
  if (!inp || !inp.files[0]) return;
  try {
    const dataUrl = await toDataURL(inp.files[0], 1600);
    await api("/qr/" + inp.dataset.qr, { dataUrl });
    toast("QR guardado");
    loadQR();
    loadSummary();
  } catch (err) {
    toast(err.message, true);
  }
};
/* Lee una imagen y la achica si es muy grande */
function toDataURL(file, max) {
  return new Promise((res, rej) => {
    if (file.type === "application/pdf") {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      return r.readAsDataURL(file);
    }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.88));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => rej(new Error("No se pudo leer la imagen"));
    img.src = URL.createObjectURL(file);
  });
}

/* ---------------- puerta ---------------- */
$("#doorForm").onsubmit = async (e) => {
  e.preventDefault();
  let code = $("#doorCode").value.trim().toUpperCase();
  const m = code.match(/ST-[A-Z0-9]+/);
  if (m) code = m[0];
  const r = await fetch("/api/tickets/" + encodeURIComponent(code));
  const t = r.ok ? await r.json() : null;
  if (!t) return ($("#doorResult").innerHTML = `<div class="dres badb"><h2>✕ Entrada no válida</h2><p>No existe una compra confirmada con el código ${esc(code)}.</p></div>`);
  const left = t.qty - t.checkedIn;
  $("#doorResult").innerHTML = `<div class="dres ${left > 0 ? "okb" : "badb"}">
    <h2>${left > 0 ? "✓ Entrada válida" : "✕ Ya fue usada"}</h2>
    <p class="big">${esc(t.name)}</p>
    <p>${esc(t.product.t)} · ${t.funcion ? esc(t.funcion.d + " " + t.funcion.h) : esc(t.delivery || "")}</p>
    <p>Ingresaron <b>${t.checkedIn}</b> de <b>${t.qty}</b></p>
    ${t.product.type === "show" && left > 0 ? `<div class="door" style="margin:14px 0 0"><select id="doorN">${Array.from({ length: left }, (_, i) => `<option>${i + 1}</option>`).join("")}</select><button class="b ok" id="doorIn">Registrar ingreso</button></div>` : ""}
  </div>`;
  const b = $("#doorIn");
  if (b)
    b.onclick = async () => {
      try {
        await api(`/tickets/${t.code}/checkin`, { n: +$("#doorN").value, by: ME() });
        toast("Ingreso registrado");
        $("#doorForm").requestSubmit();
      } catch (err) {
        toast(err.message, true);
      }
    };
};

/* ---------------- simulador ---------------- */
let simSig = "";
async function loadSim() {
  const tel = $("#simTel").value.replace(/\D/g, "");
  if (tel.length < 7) return;
  const msgs = await api("/sim/chat/" + tel);
  const sig = tel + msgs.length;
  if (sig === simSig) return;
  simSig = sig;
  $("#simChat").innerHTML = msgs.length ? msgs.map((m) => bubble(m, true)).join("") : `<p class="empty">Sin mensajes. Envía el código de tu orden para empezar.</p>`;
  $("#simChat").scrollTop = 1e9;
}
$("#simTel").oninput = () => {
  simSig = "";
  localStorage.setItem("st_simtel", $("#simTel").value);
  loadSim();
};
$("#simForm").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("#simText").value.trim();
  const file = $("#simFile").files[0];
  if (!text && !file) return;
  try {
    const dataUrl = file ? await toDataURL(file, 1600) : undefined;
    await api("/sim/incoming", { from: $("#simTel").value, name: $("#simName").value, text, dataUrl });
    $("#simText").value = "";
    $("#simFile").value = "";
    simSig = "";
    loadSim();
    loadSummary();
  } catch (err) {
    toast(err.message, true);
  }
};
$("#simFile").onchange = () => $("#simFile").files[0] && $("#simForm").requestSubmit();
$("#simTel").value = localStorage.getItem("st_simtel") || "";

/* ---------------- ciclo ---------------- */
async function refresh() {
  try {
    await loadSummary();
    if (TAB === "receipts") await loadReceipts();
    if (TAB === "chats") await loadChats();
    if (TAB === "orders") await loadOrders();
    if (TAB === "crm") await loadCRM();
    if (TAB === "qr") await loadQR();
    if (TAB === "sim") await loadSim();
  } catch (e) {
    if (e.message !== "Inicia sesión") console.warn(e);
  }
}
let loop;
async function start() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#who").textContent = ME();
  await refresh();
  clearInterval(loop);
  /* se actualiza solo; no recarga listas mientras se escribe */
  loop = setInterval(() => {
    if (!$("#lb").hidden) return loadSummary().catch(() => {});
    if (["orders", "crm", "qr", "door"].includes(TAB)) return loadSummary().catch(() => {});
    refresh();
  }, 5000);
}
fetch("/api/admin/me").then((r) => (r.ok ? start() : showLogin()));
