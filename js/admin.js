/* =====================================================================
   SOTIRIA — panel de validación, chats y CRM
   ===================================================================== */
const { PRODUCTS, QR_AMOUNTS } = DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bs = (n) => "Bs " + Number(n || 0).toLocaleString("es-BO");
const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(t).toLocaleDateString("es-BO", { day: "numeric", month: "short" });
};
const when = (t) => (t ? new Date(t).toLocaleString("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const phoneFmt = (p) => (p ? "+" + String(p).replace(/^(591)(\d+)/, "$1 $2") : "—");
const STATUS = {
  nuevo: "Esperando WhatsApp",
  esperando_qr: "Falta enviar QR",
  qr_enviado: "Esperando comprobante",
  comprobante: "Pendiente",
  pagado: "Pagado",
  vencido: "Vencido",
  cancelado: "Cancelado",
};
const roleTxt = (r) => (r === "validator" ? " (validador)" : r === "admin" ? " (administrador)" : "");
/* Pasos del historial que no son estados del pedido */
const HIST = { entrada_enviada: "Entrada enviada", envio_fallido: "Envío fallido", ingreso: "Ingreso", reactivado: "Reactivado" };
/* label: estado que calcula el servidor (p. ej. "Entrada enviada" o "Pagado · entrada sin enviar") */
const pill = (s, label) => `<span class="st st-${s}${/sin enviar/.test(label || "") ? " st-warn" : ""}">${esc(label || STATUS[s] || s)}</span>`;
const REASONS = ["El pago no llegó a la cuenta", "El monto no coincide", "No se ve el comprobante completo", "El comprobante ya fue usado en otro pedido", "La fecha del comprobante no corresponde"];

let ME = null;
let TAB = "proofs";
let SUM = null;
let lastPending = -1;

async function api(path, opts = {}) {
  const r = await fetch("/api/admin" + path, { headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401 && path !== "/login") {
    showLogin();
    throw new Error("Tu sesión terminó");
  }
  const j = await r.json().catch(() => null);
  /* Sin respuesta JSON = la página no la está sirviendo nuestro servidor
     (p. ej. Live Server de VS Code o el archivo abierto con doble clic). */
  if (!j) throw new Error("No se encontró el servidor del panel. Ejecuta «node server/server.js» y abre http://localhost:3000/admin.html");
  if (!r.ok) throw new Error(j.error || "Error de conexión");
  return j;
}
function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (bad ? " bad" : "");
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.className = "toast"), 3200);
}
const media = (id) => `/api/admin/media/${encodeURIComponent(id)}`;
function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* =====================================================================
   SESIÓN
   ===================================================================== */
/* Roles: "admin" (acceso completo) y "validator" (solo comprobantes).
   Ocultar pestañas es solo comodidad: el servidor responde 403 a todo
   lo que el validador no puede usar. */
const ROLE_INFO = {
  admin: { title: "Entrar como Administrador", tag: "🛡️ Administrador · acceso completo" },
  validator: { title: "Entrar como Validador", tag: "🧾 Validador · solo comprobantes" },
};
let PICKED = "admin";
const isValidator = () => ME?.role === "validator";

/* Al salir (o al vencer la sesión) se vuelve a la elección de rol y se
   borra lo que estaba en pantalla */
function showLogin() {
  ME = null;
  SUM = null;
  lastPending = -1;
  proofsKey = "";
  $("#view").innerHTML = "";
  $("#kpis").innerHTML = "";
  $("#app").hidden = true;
  $("#login").hidden = true;
  $("#roles").hidden = false;
  document.title = "Panel | SOTIRIA";
  setTimeout(() => $(`.role-card[data-role="${localStorage.getItem("st_admin_role") || "admin"}"]`)?.focus(), 50);
}
function pickRole(role) {
  PICKED = role;
  localStorage.setItem("st_admin_role", role);
  $("#roles").hidden = true;
  $("#login").hidden = false;
  $("#lgTitle").textContent = ROLE_INFO[role].title;
  $("#lgRole").textContent = ROLE_INFO[role].tag;
  $("#lgErr").textContent = "";
  $("#lgPw").value = "";
  $("#lgName").value = localStorage.getItem("st_admin_name_" + role) || localStorage.getItem("st_admin_name") || "";
  setTimeout(() => ($("#lgName").value ? $("#lgPw") : $("#lgName")).focus(), 50);
}
$("#roles").onclick = (ev) => {
  const c = ev.target.closest("[data-role]");
  if (c) pickRole(c.dataset.role);
};
$("#lgBack").onclick = showLogin;
$("#loginForm").onsubmit = async (ev) => {
  ev.preventDefault();
  $("#lgErr").textContent = "";
  try {
    await api("/login", { method: "POST", body: { name: $("#lgName").value, password: $("#lgPw").value, role: PICKED } });
    localStorage.setItem("st_admin_name_" + PICKED, $("#lgName").value.trim());
    $("#lgPw").value = "";
    start();
  } catch (e) {
    $("#lgErr").textContent = e.message;
  }
};
$("#logout").onclick = async () => {
  await api("/logout", { method: "POST" }).catch(() => {});
  showLogin();
};

async function start() {
  try {
    ME = await api("/me");
  } catch {
    if (location.protocol === "file:") $("#lgErr").textContent = "Abre el panel desde el servidor: http://localhost:3000/admin.html";
    return showLogin();
  }
  $("#roles").hidden = true;
  $("#login").hidden = true;
  $("#app").hidden = false;
  const v = isValidator();
  document.body.classList.toggle("role-validator", v);
  $("#meName").textContent = (v ? "🧾 " : "👤 ") + ME.name + (v ? " · Validador" : "");
  /* El validador solo ve "Comprobantes" */
  $$("#tabs [data-tab]").forEach((b) => (b.hidden = v ? b.dataset.tab !== "proofs" : b.id === "tabSim" ? ME.wa : false));
  $("#simBanner").hidden = v || ME.wa;
  $("#kpis").hidden = v;
  TAB = "proofs";
  const want = location.hash.slice(1);
  if ($(`[data-tab="${want}"]`) && !$(`[data-tab="${want}"]`).hidden) TAB = want;
  await refreshSummary();
  show(TAB);
}

/* =====================================================================
   RESUMEN Y AVISOS
   ===================================================================== */
async function refreshSummary() {
  try {
    SUM = await api("/summary");
  } catch {
    return;
  }
  if (isValidator()) return notifyPending(); // el validador solo recibe el número de pendientes
  const f = SUM.funciones;
  $("#kpis").innerHTML = `
    <div class="kpi ${SUM.pending ? "alert" : ""}"><small>Por validar</small><b>${SUM.pending}</b></div>
    <div class="kpi"><small>Esperando comprobante</small><b>${SUM.waitingProof}</b></div>
    <div class="kpi"><small>Ventas de hoy</small><b>${bs(SUM.revenueToday)}</b></div>
    <div class="kpi"><small>Total vendido</small><b>${bs(SUM.revenue)}</b><span>${SUM.ticketsSold} entradas · ${SUM.booksSold} libros</span></div>
    ${f
      .map((x) => {
        const pct = Math.min(100, Math.round((x.sold / x.cap) * 100));
        const hpct = Math.min(100 - pct, Math.round((x.held / x.cap) * 100));
        return `<div class="kpi cap"><small>${esc(x.label)}</small><b>${x.sold}<span>/${x.cap}</span></b><div class="bar"><i style="width:${pct}%"></i><u style="width:${hpct}%"></u></div><span>${x.held} reservadas · ${x.checkedIn} ingresaron</span></div>`;
      })
      .join("")}`;
  const b = (id, n) => {
    $(id).textContent = n;
    $(id).hidden = !n;
  };
  b("#bChats", SUM.unread);
  b("#bQR", SUM.missingQR.length);
  notifyPending();
}
/* Badge, título de la pestaña y aviso visual/sonoro (ambos roles) */
function notifyPending() {
  $("#bProofs").textContent = SUM.pending;
  $("#bProofs").hidden = !SUM.pending;
  document.title = (SUM.pending ? `(${SUM.pending}) ` : "") + "Panel | SOTIRIA";
  if (lastPending >= 0 && SUM.pending > lastPending) {
    beep();
    toast("🧾 Llegó un comprobante nuevo");
    if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification("SOTIRIA: comprobante nuevo", { body: "Hay un pago por validar." });
  }
  lastPending = SUM.pending;
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g).connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.14);
      o.start(ctx.currentTime + i * 0.15);
      o.stop(ctx.currentTime + i * 0.15 + 0.15);
    });
  } catch {}
}
document.addEventListener("click", () => "Notification" in window && Notification.permission === "default" && Notification.requestPermission(), { once: true });

setInterval(async () => {
  if ($("#app").hidden) return;
  await refreshSummary();
  if (TAB === "proofs" && !$("#dlg").classList.contains("open") && !document.activeElement?.closest("#view")) renderProofs(true);
  if (TAB === "chats") refreshChat(true);
  if (TAB === "sim") refreshSim();
}, 5000);

/* =====================================================================
   PESTAÑAS
   ===================================================================== */
$("#tabs").onclick = (ev) => {
  const b = ev.target.closest("[data-tab]");
  if (b) show(b.dataset.tab);
};
function show(tab) {
  if (isValidator()) tab = "proofs";
  TAB = tab;
  history.replaceState(null, "", "#" + tab);
  $$("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  ({ proofs: renderProofs, stats: renderStats, orders: renderOrders, chats: renderChats, crm: renderCRM, qr: renderQR, door: renderDoor, sim: renderSim })[tab]();
}

/* =====================================================================
   COMPROBANTES POR VALIDAR
   ===================================================================== */
let proofsKey = "";
async function renderProofs(silent) {
  if (!silent) $("#view").innerHTML = `<div class="loading">Cargando…</div>`;
  let list;
  try {
    list = await api("/orders?status=comprobante");
  } catch (e) {
    return !silent && ($("#view").innerHTML = `<p class="error">${esc(e.message)}</p>`);
  }
  const key = list.map((o) => o.id + o.updatedAt + o.proofs.length).join();
  if (silent && key === proofsKey) return;
  proofsKey = key;
  const needQR = SUM?.needQR ? `<p class="warn">⚠ Hay ${SUM.needQR} pedido(s) esperando un QR que no está cargado. Ve a <a href="#qr" data-go="qr">QR de cobro</a>.</p>` : "";
  $("#view").innerHTML = `
    <div class="v-head"><h2>Comprobantes por validar</h2><p class="msg">Antes de aprobar, <b>revisa en la app del banco que el dinero llegó a la cuenta</b>. Una captura se puede falsificar.</p></div>
    ${needQR}
    ${list.length ? `<div class="proofs">${list.map(proofCard).join("")}</div>` : `<div class="empty"><p>🎉 No hay comprobantes pendientes.</p><p class="msg">Esta pantalla se actualiza sola cada 5 segundos.</p></div>`}`;
}
function proofCard(o) {
  const last = o.proofs[o.proofs.length - 1];
  return `
  <article class="proof" data-id="${o.id}">
    <div class="proof-img">
      ${last ? (last.mime === "application/pdf" ? `<a class="pdf" href="${media(last.id)}" target="_blank">📄 Ver PDF</a>` : `<img src="${media(last.id)}" alt="Comprobante de ${esc(o.buyer.n)}" data-zoom>`) : "<p>Sin imagen</p>"}
      ${o.proofs.length > 1 ? `<div class="thumbs">${o.proofs.map((p) => (p.mime === "application/pdf" ? "" : `<img src="${media(p.id)}" alt="" data-zoom>`)).join("")}</div>` : ""}
    </div>
    <div class="proof-info">
      <div class="p-top"><strong class="code">${esc(o.id)}</strong><span class="msg">recibido ${ago(o.proofAt)}</span></div>
      <p class="p-amt">${bs(o.amount)}</p>
      <p>${esc(o.detalle)}</p>
      <dl class="p-dl">
        <div><dt>Nombre</dt><dd>${esc(o.buyer.n)}</dd></div>
        ${o.buyer.ci ? `<div><dt>CI</dt><dd>${esc(o.buyer.ci)}</dd></div>` : ""}
        <div><dt>WhatsApp</dt><dd>${esc(phoneFmt(o.phone))}${o.waName && o.waName !== o.buyer.n ? ` <small>(${esc(o.waName)})</small>` : ""}</dd></div>
        ${o.buyer.addr ? `<div><dt>Envío</dt><dd>${esc(o.buyer.addr)}</dd></div>` : ""}
      </dl>
      ${o.dupWarning?.length ? `<p class="warn">⚠ Esta misma imagen se envió en: ${o.dupWarning.map(esc).join(", ")}</p>` : ""}
      ${o.rejections?.length ? `<p class="msg tiny">Rechazado antes ${o.rejections.length} vez/veces: “${esc(o.rejections[o.rejections.length - 1].reason)}”</p>` : ""}
      <div class="p-act">
        <button class="btn ok-b" type="button" data-approve="${o.id}">✓ ${isValidator() ? "Validar" : "Aprobar"} y enviar ${o.product === "obra" ? "entrada" : "confirmación"}</button>
        <button class="btn ghost" type="button" data-reject="${o.id}">Rechazar</button>
        ${isValidator() ? "" : `<button class="link" type="button" data-chat="${esc(o.phone || "")}">Ver chat</button>`}
      </div>
    </div>
  </article>`;
}

/* acciones comunes */
document.addEventListener("click", async (ev) => {
  const t = ev.target;
  const z = t.closest("[data-zoom]");
  if (z) return zoom(z.src);
  const go = t.closest("[data-go]");
  if (go) return (ev.preventDefault(), closeDlg(), show(go.dataset.go));
  const ap = t.closest("[data-approve]");
  if (ap) return approve(ap.dataset.approve, ap);
  const rj = t.closest("[data-reject]");
  if (rj) return rejectDlg(rj.dataset.reject);
  const ch = t.closest("[data-chat]");
  if (ch && ch.dataset.chat) return (closeDlg(), (CHAT = ch.dataset.chat), show("chats"));
  const od = t.closest("[data-order]");
  if (od) return orderDlg(od.dataset.order);
});

async function approve(id, btn) {
  if (!confirm(`¿Confirmas que el pago del pedido ${id} llegó a la cuenta?\n\nSe enviará la entrada al cliente por WhatsApp.`)) return;
  btn.disabled = true;
  try {
    const r = await api(`/orders/${id}/approve`, { method: "POST" });
    if (r.ticketSent && r.ticketSent.ok === false) toast(`⚠ ${id} ${isValidator() ? "validado" : "aprobado"}, pero WhatsApp no aceptó el envío: ${r.ticketSent.error || "error"}. Avisa al administrador para reenviarla.`, true);
    else toast(`✓ ${id} ${isValidator() ? "validado" : "aprobado"}. Entrada enviada.`);
    closeDlg();
    await refreshSummary();
    show(TAB);
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
  }
}

function rejectDlg(id) {
  openDlg(`
    <h2 id="dlgTitle">Rechazar comprobante ${esc(id)}</h2>
    <p class="msg">El cliente recibirá el motivo por WhatsApp y podrá enviar otro comprobante.</p>
    <div class="reasons">${REASONS.map((r, i) => `<label class="zone"><input type="radio" name="rr" value="${esc(r)}" ${i === 0 ? "checked" : ""}><span class="z-n">${esc(r)}</span></label>`).join("")}
      <label class="zone"><input type="radio" name="rr" value="otro"><span class="z-n">Otro motivo</span></label></div>
    <textarea id="rrTxt" rows="2" placeholder="Escribe el motivo" hidden></textarea>
    <div class="nav"><button class="btn ghost" type="button" id="rrNo">Volver</button><button class="btn danger" type="button" id="rrOk">Rechazar y avisar</button></div>`);
  $$('input[name="rr"]').forEach((r) => (r.onchange = () => ($("#rrTxt").hidden = r.value !== "otro")));
  $("#rrNo").onclick = closeDlg;
  $("#rrOk").onclick = async () => {
    const v = $('input[name="rr"]:checked').value;
    const reason = v === "otro" ? $("#rrTxt").value.trim() : v;
    if (!reason) return $("#rrTxt").focus();
    $("#rrOk").disabled = true;
    try {
      await api(`/orders/${id}/reject`, { method: "POST", body: { reason } });
      toast(`${id}: rechazo enviado al cliente.`);
      closeDlg();
      await refreshSummary();
      show(TAB);
    } catch (e) {
      toast(e.message, true);
      $("#rrOk").disabled = false;
    }
  };
}

/* =====================================================================
   PEDIDOS
   ===================================================================== */
const OF = { status: "", q: "" };
async function renderOrders() {
  $("#view").innerHTML = `
    <div class="v-head row-head"><h2>Pedidos</h2>
      <div class="tools">
        <input id="oq" type="search" placeholder="Buscar código, nombre, CI o número" value="${esc(OF.q)}">
        <select id="os"><option value="">Todos los estados</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${OF.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <a class="btn ghost sm" href="/api/admin/export/pedidos.csv">⬇ Excel (CSV)</a>
      </div>
    </div>
    <div id="otable"><div class="loading">Cargando…</div></div>`;
  let h;
  $("#oq").oninput = (e) => {
    OF.q = e.target.value;
    clearTimeout(h);
    h = setTimeout(loadOrders, 250);
  };
  $("#os").onchange = (e) => ((OF.status = e.target.value), loadOrders());
  loadOrders();
}
async function loadOrders() {
  try {
    const list = await api(`/orders?status=${OF.status}&q=${encodeURIComponent(OF.q)}`);
    $("#otable").innerHTML = list.length
      ? `<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Detalle</th><th>Monto</th><th>Estado</th><th>Origen</th><th>Actualizado</th></tr></thead><tbody>
        ${list
          .map(
            (o) => `<tr data-order="${o.id}" tabindex="0"><td><b class="code">${o.id}</b></td><td>${esc(o.buyer.n)}<br><small>${esc(phoneFmt(o.phone))}</small></td><td>${esc(o.detalle)}</td><td>${bs(o.amount)}</td><td>${pill(o.status, o.label)}${o.product === "libro" && o.status === "pagado" ? `<br><small>${o.delivered ? "📦 Entregado" : "Por entregar"}</small>` : ""}</td><td><small>${esc(o.source?.src || "")}</small></td><td><small>${ago(o.updatedAt)}</small></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<div class="empty"><p>No hay pedidos con ese filtro.</p></div>`;
  } catch (e) {
    $("#otable").innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
}
document.addEventListener("keydown", (e) => e.key === "Enter" && e.target.matches("tr[data-order]") && orderDlg(e.target.dataset.order));

async function orderDlg(id) {
  let o;
  try {
    o = await api("/orders/" + id);
  } catch (e) {
    return toast(e.message, true);
  }
  const open = !["pagado", "cancelado"].includes(o.status);
  openDlg(`
    <div class="od-head"><h2 id="dlgTitle"><span class="code">${o.id}</span></h2>${pill(o.status, o.label)}</div>
    ${o.ticketSent && o.ticketSent.ok === false ? `<p class="warn">⚠ WhatsApp no aceptó el envío ${o.product === "obra" ? "de la entrada" : "de la confirmación"}: ${esc(o.ticketSent.error || "")}. Usa <b>Reenviar</b>; si pasaron más de 24 h, pide al cliente que escriba primero.</p>` : ""}
    <p class="p-amt">${bs(o.amount)}</p><p>${esc(o.detalle)}</p>
    <dl class="p-dl">
      <div><dt>Nombre</dt><dd>${esc(o.buyer.n)}</dd></div>
      ${o.buyer.ci ? `<div><dt>CI</dt><dd>${esc(o.buyer.ci)}</dd></div>` : ""}
      <div><dt>WhatsApp</dt><dd>${esc(phoneFmt(o.phone))}</dd></div>
      ${o.buyer.em ? `<div><dt>Correo</dt><dd>${esc(o.buyer.em)}</dd></div>` : ""}
      ${o.buyer.addr ? `<div><dt>Dirección</dt><dd>${esc(o.buyer.addr)}</dd></div>` : ""}
      <div><dt>Origen</dt><dd>${esc(o.source?.src || "")}${o.source?.campaign ? " · " + esc(o.source.campaign) : ""}</dd></div>
      ${o.ticket ? `<div><dt>Entrada</dt><dd>${o.ticketLink ? `<a href="${esc(o.ticketLink)}" target="_blank">${esc(o.ticket.code)}</a> · ingresaron ${o.ticket.checkedIn}/${o.qty}` : esc(o.ticket.code)}</dd></div>` : ""}
      ${o.validatedBy ? `<div><dt>Validado por</dt><dd>${esc(o.validatedBy)}${roleTxt(o.validatedRole)} · ${when(o.paidAt)}</dd></div>` : ""}
    </dl>
    ${o.proofs.length ? `<h3 class="h3">Comprobantes</h3><div class="thumbs big">${o.proofs.map((p) => (p.mime === "application/pdf" ? `<a class="pdf" href="${media(p.id)}" target="_blank">📄 PDF</a>` : `<img src="${media(p.id)}" alt="Comprobante" data-zoom>`)).join("")}</div>` : ""}
    <h3 class="h3">Historial</h3>
    <ul class="hist">${o.history.slice().reverse().map((h) => `<li><small>${when(h.at)}</small> <b>${esc(HIST[h.s] || STATUS[h.s] || h.s)}</b> · ${esc(h.by)}${roleTxt(h.role)}${h.note ? ` — ${esc(h.note)}` : ""}</li>`).join("")}</ul>
    <div class="od-act">
      ${open ? `<button class="btn ok-b" type="button" data-approve="${o.id}">✓ Aprobar pago</button>` : ""}
      ${o.status === "comprobante" ? `<button class="btn ghost" type="button" data-reject="${o.id}">Rechazar comprobante</button>` : ""}
      ${o.status === "pagado" && o.ticket ? `<button class="btn ${o.ticketSent && o.ticketSent.ok === false ? "" : "ghost"}" type="button" id="odTk">Reenviar ${o.product === "obra" ? "entrada" : "confirmación"}</button>` : ""}
      ${open && o.phone ? `<button class="btn ghost" type="button" id="odQR">${o.status === "nuevo" || o.status === "esperando_qr" ? "Enviar QR" : "Reenviar QR"}</button>` : ""}
      ${o.product === "libro" && o.status === "pagado" ? `<button class="btn ghost" type="button" id="odDel">${o.delivered ? "Marcar como NO entregado" : "📦 Marcar entregado"}</button>` : ""}
      ${o.phone ? `<button class="btn ghost" type="button" data-chat="${esc(o.phone)}">Ver chat</button>` : ""}
      ${open ? `<button class="link danger-l" type="button" id="odCancel">Cancelar pedido</button>` : ""}
    </div>`);
  const act = (sel, path, body, msg) =>
    $(sel) &&
    ($(sel).onclick = async () => {
      if (path === "cancel" && !confirm(`¿Cancelar el pedido ${o.id}? Se liberan sus ${o.qty} cupos.`)) return;
      $(sel).disabled = true;
      try {
        await api(`/orders/${o.id}/${path}`, { method: "POST", body });
        toast(msg);
        await refreshSummary();
        orderDlg(o.id);
        if (TAB === "orders") loadOrders();
      } catch (e) {
        toast(e.message, true);
        $(sel).disabled = false;
      }
    });
  act("#odQR", "send-qr", {}, "QR enviado por WhatsApp");
  act("#odTk", "resend-ticket", {}, "Enviada de nuevo por WhatsApp");
  act("#odDel", "delivered", { value: !o.delivered }, "Actualizado");
  act("#odCancel", "cancel", {}, "Pedido cancelado");
}

/* =====================================================================
   CHATS
   ===================================================================== */
let CHAT = null;
let chatKey = "";
async function renderChats() {
  $("#view").innerHTML = `
    <div class="v-head"><h2>Chats de WhatsApp</h2></div>
    <div class="chats"><div class="c-list" id="clist"><div class="loading">Cargando…</div></div><div class="c-pane" id="cpane"><div class="empty"><p>Elige una conversación.</p></div></div></div>`;
  chatKey = "";
  refreshChat();
}
async function refreshChat(silent) {
  let list;
  try {
    list = await api("/chats");
  } catch {
    return;
  }
  $("#clist").innerHTML = list.length
    ? list
        .map(
          (c) => `<button type="button" class="c-item${c.phone === CHAT ? " on" : ""}" data-phone="${c.phone}">
      <span class="c-name">${esc(c.name || phoneFmt(c.phone))}${c.unread ? `<b class="badge">${c.unread}</b>` : ""}</span>
      <span class="c-last">${c.last.dir === "out" ? "Tú: " : ""}${c.last.media && !c.last.text ? "📷 Imagen" : esc((c.last.text || "").slice(0, 60))}</span>
      <span class="c-meta">${c.order ? pill(c.order.status, c.order.label) : ""}<small>${ago(c.last.at)}</small></span></button>`,
        )
        .join("")
    : `<div class="empty"><p>Todavía no hay mensajes.</p></div>`;
  $$("#clist [data-phone]").forEach((b) => (b.onclick = () => ((CHAT = b.dataset.phone), (chatKey = ""), refreshChat())));
  if (CHAT) loadConversation(silent);
}
async function loadConversation(silent) {
  let d;
  try {
    d = await api("/chats/" + CHAT);
  } catch {
    return;
  }
  const key = d.messages.length + ":" + d.orders.map((o) => o.status).join();
  if (silent && key === chatKey) return;
  chatKey = key;
  const draft = $("#cmsg")?.value || "";
  const openOrders = d.orders.filter((o) => !["pagado", "cancelado"].includes(o.status));
  $("#cpane").innerHTML = `
    <div class="c-head"><div><b>${esc(d.orders[0]?.buyer.n || phoneFmt(CHAT))}</b><small>${esc(phoneFmt(CHAT))}</small></div>
      <div class="c-orders">${d.orders.slice(0, 3).map((o) => `<button type="button" class="chip-o" data-order="${o.id}">${o.id} ${pill(o.status, o.label)}</button>`).join("")}</div></div>
    <div class="msgs" id="msgs">${d.messages.map((m) => bubble(m, openOrders)).join("")}</div>
    <form class="composer" id="cform"><textarea id="cmsg" rows="1" placeholder="Escribe un mensaje…">${esc(draft)}</textarea><button class="btn" type="submit">Enviar</button></form>`;
  const box = $("#msgs");
  box.scrollTop = box.scrollHeight;
  $("#cform").onsubmit = async (ev) => {
    ev.preventDefault();
    const text = $("#cmsg").value.trim();
    if (!text) return;
    try {
      await api(`/chats/${CHAT}/send`, { method: "POST", body: { text } });
      $("#cmsg").value = "";
      chatKey = "";
      loadConversation();
    } catch (e) {
      toast(e.message, true);
    }
  };
  $("#cmsg").onkeydown = (e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), $("#cform").requestSubmit());
  $$("[data-attach]").forEach(
    (sel) =>
      (sel.onchange = async () => {
        if (!sel.value) return;
        try {
          await api(`/orders/${sel.value}/attach`, { method: "POST", body: { messageId: sel.dataset.attach } });
          toast(`Comprobante asociado a ${sel.value}`);
          chatKey = "";
          refreshSummary();
          loadConversation();
        } catch (e) {
          toast(e.message, true);
        }
      }),
  );
}
function bubble(m, openOrders) {
  const img = m.media ? `<img src="${media(m.media)}" alt="Imagen" data-zoom onerror="this.outerHTML='📄 Archivo'">` : "";
  const attach =
    m.dir === "in" && m.media && !m.orderId && openOrders.length
      ? `<select class="attach" data-attach="${m.id}"><option value="">Asociar a pedido…</option>${openOrders.map((o) => `<option value="${o.id}">${o.id} · ${bs(o.amount)}</option>`).join("")}</select>`
      : "";
  return `<div class="b ${m.dir}">${img}${m.text ? `<p>${esc(m.text).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>` : ""}${attach}<small>${when(m.at)}${m.by ? " · " + esc(m.by) : ""}${m.orderId ? " · " + esc(m.orderId) : ""}${m.state === "error" ? ` · <span class="bad">no enviado: ${esc(m.error)}</span>` : ""}</small></div>`;
}

/* =====================================================================
   CLIENTES (CRM)
   ===================================================================== */
async function renderCRM() {
  $("#view").innerHTML = `
    <div class="v-head row-head"><h2>Clientes</h2>
      <div class="tools"><input id="cq" type="search" placeholder="Buscar nombre, número, CI o correo">
      <a class="btn ghost sm" href="/api/admin/export/clientes.csv">⬇ Clientes (CSV)</a><a class="btn ghost sm" href="/api/admin/export/pedidos.csv">⬇ Pedidos (CSV)</a></div></div>
    <div id="ctable"><div class="loading">Cargando…</div></div>`;
  let list;
  try {
    list = await api("/crm");
  } catch (e) {
    return ($("#ctable").innerHTML = `<p class="error">${esc(e.message)}</p>`);
  }
  const src = {};
  list.forEach((c) => c.sources.forEach((s) => (src[s] = (src[s] || 0) + 1)));
  const draw = (q) => {
    q = (q || "").toLowerCase();
    const rows = list.filter((c) => !q || [c.name, c.phone, c.ci, c.email].join(" ").toLowerCase().includes(q));
    $("#ctable").innerHTML = `
      <div class="src-row">${Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="chip-s">${esc(k)} <b>${n}</b></span>`).join("")}</div>
      ${
        rows.length
          ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>WhatsApp</th><th>CI</th><th>Interés</th><th>Origen</th><th>Pedidos</th><th>Compró</th><th>Último contacto</th></tr></thead><tbody>
        ${rows.map((c) => `<tr><td><b>${esc(c.name || "—")}</b>${c.email ? `<br><small>${esc(c.email)}</small>` : ""}</td><td>${c.phone ? `<button class="link" type="button" data-chat="${esc(c.phone)}">${esc(phoneFmt(c.phone))}</button>` : "—"}</td><td>${esc(c.ci)}</td><td>${c.interests.map((i) => `<span class="tag t-${esc(i)}">${esc(i)}</span>`).join(" ")}</td><td><small>${esc(c.sources.join(", "))}</small></td><td>${c.paid}/${c.orders}</td><td>${bs(c.spent)}${c.tickets ? `<br><small>${c.tickets} entradas</small>` : ""}${c.books ? `<br><small>${c.books} libros</small>` : ""}</td><td><small>${ago(c.last)}</small></td></tr>`).join("")}
        </tbody></table></div>`
          : `<div class="empty"><p>Sin clientes todavía.</p></div>`
      }`;
  };
  $("#cq").oninput = (e) => draw(e.target.value);
  draw();
}

/* =====================================================================
   QR DE COBRO
   ===================================================================== */
async function renderQR() {
  let list;
  try {
    list = await api("/qr");
  } catch (e) {
    return ($("#view").innerHTML = `<p class="error">${esc(e.message)}</p>`);
  }
  const prodFor = (a) => Object.values(PRODUCTS).filter((p) => p.price && a % p.price === 0 && a / p.price <= p.maxQty).map((p) => `${a / p.price} ${p.unit[a / p.price === 1 ? 0 : 1]}`);
  $("#view").innerHTML = `
    <div class="v-head"><h2>QR de cobro</h2>
      <p class="msg">Genera en la app de tu banco un <b>QR de cobro con monto fijo</b> por cada monto de abajo, con la <b>vigencia más larga</b> posible y que acepte <b>varios pagos</b>. Descarga cada imagen y súbela aquí. El sistema enviará el QR correcto a cada cliente según lo que compró.</p></div>
    <div class="qr-grid">${list
      .map(
        (q) => `
      <div class="qr-card ${q.ok ? "ok" : "miss"}">
        <div class="qr-img">${q.ok ? `<img src="/api/admin/qr/${q.amount}?t=${Date.now()}" alt="QR de Bs ${q.amount}" data-zoom>` : "<span>Falta</span>"}</div>
        <b>${bs(q.amount)}</b><small>${esc(prodFor(q.amount).join(" · "))}</small>
        <label class="btn sm ${q.ok ? "ghost" : ""} up">${q.ok ? "Reemplazar" : "Subir QR"}<input type="file" accept="image/png,image/jpeg,image/webp" data-up="${q.amount}" hidden></label>
        ${q.ok ? `<button class="link danger-l" type="button" data-del="${q.amount}">Quitar</button>` : ""}
      </div>`,
      )
      .join("")}</div>`;
  $$("[data-up]").forEach(
    (inp) =>
      (inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        if (f.size > 8e6) return toast("La imagen pesa más de 8 MB", true);
        try {
          await api("/qr/" + inp.dataset.up, { method: "POST", body: { dataUrl: await fileToDataUrl(f) } });
          toast(`QR de ${bs(inp.dataset.up)} guardado`);
          await refreshSummary();
          renderQR();
        } catch (e) {
          toast(e.message, true);
        }
      }),
  );
  $$("[data-del]").forEach(
    (b) =>
      (b.onclick = async () => {
        if (!confirm(`¿Quitar el QR de ${bs(b.dataset.del)}?`)) return;
        await api(`/qr/${b.dataset.del}/delete`, { method: "POST" });
        await refreshSummary();
        renderQR();
      }),
  );
}

/* =====================================================================
   PUERTA
   ===================================================================== */
function renderDoor() {
  $("#view").innerHTML = `
    <div class="v-head"><h2>Control de puerta</h2>
      <p class="msg">Lo más rápido: con la sesión del panel abierta en tu celular, <b>escanea el QR de la entrada con la cámara</b>. Se abre la entrada con el botón <b>Registrar ingreso</b>. También puedes escribir el código:</p></div>
    <form class="door-form" id="dform"><input id="dcode" placeholder="SOT-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters"><button class="btn" type="submit">Buscar</button></form>
    <div id="dres"></div>`;
  $("#dcode").focus();
  $("#dform").onsubmit = async (ev) => {
    ev.preventDefault();
    let c = $("#dcode").value.trim().toUpperCase();
    const m = /SOT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/.exec(c);
    if (!m) return ($("#dres").innerHTML = `<p class="error">Código no válido.</p>`);
    c = m[0];
    const r = await fetch("/api/tickets/" + c);
    const t = await r.json();
    if (!r.ok) return ($("#dres").innerHTML = `<div class="door-card bad"><p class="big">✗ ${esc(t.error || "Entrada no encontrada")}</p></div>`);
    const left = t.qty - t.checkedIn;
    $("#dres").innerHTML = `<div class="door-card ${left > 0 && t.valid ? "" : "bad"}">
      <p class="big">${left > 0 && t.valid ? "✓ Entrada válida" : "✗ Entrada ya usada"}</p>
      <p><b>${esc(t.nombre)}</b> · CI ${esc(t.ci)}</p><p>${esc(t.fecha)}</p><p>Ingresaron <b>${t.checkedIn}</b> de <b>${t.qty}</b></p>
      ${left > 0 && t.valid ? `<button class="btn ok-b" type="button" id="dck">Registrar ingreso (${left} ${left === 1 ? "queda" : "quedan"})</button>` : ""}</div>`;
    if ($("#dck"))
      $("#dck").onclick = async () => {
        try {
          const j = await api(`/tickets/${c}/checkin`, { method: "POST" });
          toast(`✓ Ingreso ${j.checkedIn} de ${j.qty}`);
          $("#dform").requestSubmit();
        } catch (e) {
          toast(e.message, true);
        }
      };
  };
}

/* =====================================================================
   SIMULADOR DE WHATSAPP (para probar sin la API de Meta)
   ===================================================================== */
const SIM = { phone: localStorage.getItem("st_sim_phone") || "59171234567", name: localStorage.getItem("st_sim_name") || "Cliente de prueba" };
let simKey = "";
function renderSim() {
  simKey = "";
  $("#view").innerHTML = `
    <div class="v-head"><h2>Simulador de WhatsApp</h2>
      <p class="msg">Aquí eres el <b>cliente</b>. Haz un pedido en la <a href="./" target="_blank">página</a>, copia el mensaje que te abre WhatsApp (o solo el código <b>ST-…</b>), pégalo aquí y envíalo. Después sube cualquier imagen como “comprobante” y valídala en <b>Comprobantes</b>.</p></div>
    <div class="sim">
      <div class="sim-cfg">
        <label for="simP">Número del cliente</label><input id="simP" value="${esc(SIM.phone)}" inputmode="tel">
        <label for="simN">Nombre en WhatsApp</label><input id="simN" value="${esc(SIM.name)}">
        <p class="msg tiny">Cambia el número para simular a otro cliente.</p>
      </div>
      <div class="phone">
        <div class="ph-top">SOTIRIA <small>${esc(phoneFmt(SIM.phone))} escribiendo a ventas</small></div>
        <div class="ph-msgs" id="simMsgs"></div>
        <form class="ph-bar" id="simForm">
          <label class="ph-clip" title="Enviar imagen (comprobante)">📎<input type="file" id="simFile" accept="image/*,application/pdf" hidden></label>
          <input id="simTxt" placeholder="Mensaje" autocomplete="off">
          <button type="submit" aria-label="Enviar">➤</button>
        </form>
      </div>
    </div>`;
  const keep = () => {
    SIM.phone = $("#simP").value.replace(/\D/g, "");
    SIM.name = $("#simN").value;
    localStorage.setItem("st_sim_phone", SIM.phone);
    localStorage.setItem("st_sim_name", SIM.name);
  };
  $("#simP").onchange = () => (keep(), renderSim());
  $("#simN").onchange = keep;
  const send = async (body) => {
    keep();
    try {
      await api("/sim/incoming", { method: "POST", body: { from: SIM.phone, name: SIM.name, ...body } });
      simKey = "";
      await refreshSim();
      refreshSummary();
    } catch (e) {
      toast(e.message, true);
    }
  };
  $("#simForm").onsubmit = (ev) => {
    ev.preventDefault();
    const text = $("#simTxt").value.trim();
    if (!text) return;
    $("#simTxt").value = "";
    send({ text });
  };
  $("#simFile").onchange = async () => {
    const f = $("#simFile").files[0];
    if (f) send({ dataUrl: await fileToDataUrl(f), text: "" });
    $("#simFile").value = "";
  };
  refreshSim();
}
async function refreshSim() {
  if (!$("#simMsgs")) return;
  let d;
  try {
    d = await api("/sim/" + SIM.phone);
  } catch {
    return;
  }
  const key = d.messages.length + "";
  if (key === simKey) return;
  simKey = key;
  $("#simMsgs").innerHTML = d.messages.length
    ? d.messages
        .map((m) => {
          const img = m.media ? `<img src="${media(m.media)}" alt="" data-zoom onerror="this.outerHTML='📄'">` : "";
          return `<div class="pb ${m.dir === "in" ? "me" : "them"}">${img}${m.text ? `<p>${esc(m.text).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>').replace(/\n/g, "<br>")}</p>` : ""}<small>${new Date(m.at).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}</small></div>`;
        })
        .join("")
    : `<p class="ph-empty">Pega aquí el mensaje de tu pedido (ej.: “Hola, quiero pagar mi pedido ST-ABCDE…”).</p>`;
  $("#simMsgs").scrollTop = $("#simMsgs").scrollHeight;
}

/* =====================================================================
   VENTANAS
   ===================================================================== */
function openDlg(html) {
  $("#dlgBody").innerHTML = html;
  const d = $("#dlg");
  d.hidden = false;
  requestAnimationFrame(() => d.classList.add("open"));
}
function closeDlg() {
  const d = $("#dlg");
  d.classList.remove("open");
  setTimeout(() => (d.hidden = true), 180);
}
$("#dlgClose").onclick = closeDlg;
$("#dlg").addEventListener("mousedown", (e) => e.target.id === "dlg" && closeDlg());
function zoom(src) {
  $("#lbImg").src = src;
  $("#lb").hidden = false;
}
$("#lb").onclick = () => ($("#lb").hidden = true);
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("#lb").hidden) $("#lb").hidden = true;
  else if (!$("#dlg").hidden) closeDlg();
});

start();
