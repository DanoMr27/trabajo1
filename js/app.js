/* =====================================================================
   SOTIRIA — lógica de la página
   ===================================================================== */
const { PRODUCTS, VIDEOS, CONTACT } = DATA;
const OBRA = PRODUCTS.obra,
  LIBRO = PRODUCTS.libro,
  POD = PRODUCTS.podcast;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bs = (n) => "Bs " + Number(n).toLocaleString("es-BO");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fDate = (f) => new Date(`${f.d}T${f.h}`);
const fLong = (f) => cap(fDate(f).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" })) + " · " + f.h;
const grad = (c) => `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
const img = (src, alt, cls = "") => `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.remove()">`;
const unit = (p, n) => p.unit[n === 1 ? 0 : 1];
const waNumber = "+" + CONTACT.whatsapp;
const upcoming = () => OBRA.funciones.filter((f) => fDate(f) > new Date()).sort((a, b) => fDate(a) - fDate(b));

function qrSVG(text, label) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: label || "Código QR" });
}

/* ---------------- almacenamiento local ---------------- */
const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
/* Solo acepta una lista de pedidos válidos: versiones anteriores de la página
   guardaban "st_orders" con otro formato (un objeto), y eso rompía la compra. */
const myOrders = () => {
  const v = store.get("st_orders", []);
  return Array.isArray(v) ? v.filter((o) => o && typeof o === "object" && o.code) : [];
};
function saveOrder(o) {
  store.set("st_orders", [o, ...myOrders().filter((x) => x.code !== o.code)].slice(0, 30));
  updateCount();
}
function updateCount() {
  const n = myOrders().length;
  $("#ordCount").textContent = n;
  $("#ordCount").hidden = !n;
}

/* ---------------- de qué red social viene ---------------- */
const params = new URLSearchParams(location.search);
const SOURCE = (() => {
  const src = params.get("src") || params.get("utm_source");
  const campaign = params.get("utm_campaign") || params.get("c") || "";
  if (src) sessionStorage.setItem("st_src", JSON.stringify({ src, campaign }));
  try {
    return JSON.parse(sessionStorage.getItem("st_src")) || { src: document.referrer ? new URL(document.referrer).hostname : "directo", campaign: "" };
  } catch {
    return { src: "directo", campaign: "" };
  }
})();

/* ---------------- servidor ---------------- */
let SERVER = false;
let AVAIL = null;
async function api(path, opts = {}) {
  const r = await fetch("/api" + path, { headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No pudimos conectar. Intenta de nuevo.");
  return j;
}
async function detectServer() {
  if (location.protocol === "file:") return false;
  try {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 2000);
    const r = await fetch("/api/health", { signal: ctl.signal });
    return r.ok && (await r.json()).ok === true;
  } catch {
    return false;
  }
}
async function loadAvailability() {
  if (!SERVER) return;
  try {
    AVAIL = await api("/availability"); // la usa el modal de compra (cupos por función)
  } catch {}
}

/* =====================================================================
   RENDER
   ===================================================================== */
function renderHero() {
  $("#heroBg").innerHTML = img(OBRA.img, "");
  $("#heroBg").style.setProperty("--g", grad(OBRA.c));
  $("#heroTag").textContent = `${OBRA.tag} · En cartelera`;
  $("#heroTitle").textContent = OBRA.t;
  $("#heroLead").textContent = OBRA.long;
  const next = upcoming();
  $("#heroMeta").innerHTML = `
    <li><b>${next.length ? next.map((f) => esc(fLong(f))).join("<br>") : "Próximamente"}</b><span>${next.length > 1 ? `${next.length} funciones` : "Función"}</span></li>
    <li><b>${esc(OBRA.venue)}</b><span>${esc(OBRA.addr)}</span></li>
    <li><b>${bs(OBRA.price)}</b><span>por entrada</span></li>`;
  $("#heroBuy").textContent = `Comprar entradas · ${bs(OBRA.price)}`;
  if (!next.length) $("#heroBuy").disabled = true;
  $("#tape").innerHTML = Array(2)
    .fill(["✺ Entradas a " + bs(OBRA.price), "✺ Pago con QR", "✺ Tu entrada llega por WhatsApp", "✺ " + OBRA.t, "✺ El libro ya está a la venta", "✺ Podcast: muy pronto"].map((t) => `<span>${esc(t)}</span>`).join(""))
    .map((h) => `<div>${h}${h}</div>`)
    .join("");
  tickCd();
}
function tickCd() {
  const f = upcoming()[0];
  const el = $("#heroCd");
  if (!f) return (el.innerHTML = "");
  const ms = fDate(f) - new Date();
  const d = Math.floor(ms / 864e5),
    h = Math.floor(ms / 36e5) % 24,
    m = Math.floor(ms / 6e4) % 60;
  el.innerHTML = `<small>Faltan</small><span><b>${d}</b>días</span><span><b>${String(h).padStart(2, "0")}</b>horas</span><span><b>${String(m).padStart(2, "0")}</b>min</span>`;
}
setInterval(tickCd, 30000);

const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
const ICON = {
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
};

function renderBook() {
  const b = LIBRO;
  $("#bookBox").style.setProperty("--g", grad(b.c));
  $("#bookBox").innerHTML = `
    <div class="book-art"><div class="book-cover">${img(b.img, "Portada de " + b.t)}<span class="spine"></span></div></div>
    <div class="book-copy">
      <span class="kicker">${esc(b.tag)}</span>
      <h2>${esc(b.t)}</h2>
      <p class="by">por ${esc(b.author)}</p>
      <p>${esc(b.long)}</p>
      <ul class="ticks">${b.delivery.map((d) => `<li>${esc(d.n)}</li>`).join("")}</ul>
      <div class="book-buy"><span class="price">${bs(b.price)}<small>por libro</small></span><button class="btn book-btn" type="button" data-buy="libro">${ICON.book}Comprar el libro</button></div>
    </div>`;
}

function renderSoon() {
  $("#soonBox").style.setProperty("--g", grad(POD.c));
  $("#soonTitle").textContent = POD.t;
  $("#soonText").textContent = POD.long;
  $("#soonArt").innerHTML = img(POD.img, "") + `<div class="eq" aria-hidden="true">${"<i></i>".repeat(14)}</div>`;
}

function renderVideos() {
  $("#vids").innerHTML = VIDEOS.map((v, i) => {
    const style = `style="--g:${grad((PRODUCTS[v.product] || POD).c)}"`;
    const txt = `<span class="vid-txt"><small>${esc(v.tag)}</small>${esc(v.t)}</span>`;
    /* sin video todavía: solo la imagen, sin reproducir */
    if (!v.src) return `<div class="vid soon-vid" ${style}>${img(v.poster, "")}${txt}</div>`;
    return `
    <button class="vid" type="button" data-vid="${i}" ${style}>
      ${img(v.poster, "")}
      <span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
      ${txt}
    </button>`;
  }).join("");
}

/* ---------------- menú móvil ---------------- */
$("#burger").onclick = () => {
  const open = document.body.classList.toggle("menu-open");
  $("#burger").setAttribute("aria-expanded", open);
};
$("#nav").addEventListener("click", (ev) => {
  if (ev.target.closest("a")) {
    document.body.classList.remove("menu-open");
    $("#burger").setAttribute("aria-expanded", "false");
  }
});
window.addEventListener("scroll", () => $("#top").classList.toggle("scrolled", scrollY > 10), { passive: true });

document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-buy]");
  if (b) return openCheckout(b.dataset.buy, b, b.dataset.f);
  const vid = ev.target.closest("[data-vid]");
  if (vid) return openVideo(+vid.dataset.vid, vid);
  const ord = ev.target.closest("[data-track]");
  if (ord) {
    const o = myOrders().find((x) => x.code === ord.dataset.track);
    if (o) (closeLayer($("#tk")), resumeOrder(o, ord));
  }
});

/* =====================================================================
   VENTANAS (modal / drawer) con manejo de foco
   ===================================================================== */
const layers = [];
function openLayer(el, opener, onClose) {
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("open"));
  document.body.classList.add("locked");
  layers.push({ el, opener, onClose });
  setTimeout(() => $(".close", el)?.focus(), 30);
}
function closeLayer(el) {
  const i = layers.findIndex((l) => l.el === el);
  if (i < 0) return;
  const [l] = layers.splice(i, 1);
  el.classList.remove("open");
  setTimeout(() => (el.hidden = true), 200);
  if (!layers.length) document.body.classList.remove("locked");
  l.onClose && l.onClose();
  l.opener && l.opener.focus && l.opener.focus();
}
document.addEventListener("keydown", (ev) => {
  if (!layers.length) return;
  const top = layers[layers.length - 1].el;
  if (ev.key === "Escape") return closeLayer(top);
  if (ev.key === "Tab") {
    const f = $$('button, [href], input, select, textarea, video, iframe, [tabindex]:not([tabindex="-1"])', top).filter((x) => !x.disabled && x.offsetParent);
    if (!f.length) return;
    if (ev.shiftKey && document.activeElement === f[0]) (ev.preventDefault(), f[f.length - 1].focus());
    else if (!ev.shiftKey && document.activeElement === f[f.length - 1]) (ev.preventDefault(), f[0].focus());
  }
});
["ov", "vo", "tk"].forEach((id) => {
  const el = $("#" + id);
  el.addEventListener("mousedown", (ev) => ev.target === el && closeLayer(el));
  $("#" + id + "Close").onclick = () => closeLayer(el);
});

/* =====================================================================
   COMPRA
   ===================================================================== */
let S = null;
let poll = null;
const stopPoll = () => clearInterval(poll);
const body = $("#mbody");

function openCheckout(pid, opener, funcion) {
  const p = PRODUCTS[pid];
  if (!p || !p.price) return;
  stopPoll();
  const saved = store.get("st_buyer", {});
  const fs = upcoming();
  S = {
    p,
    step: 0,
    qty: 1,
    funcion: funcion || (fs.find((f) => !AVAIL || AVAIL.obra[f.id] > 0) || {}).id || null,
    delivery: p.delivery ? p.delivery[0].id : null,
    buyer: { n: saved.n || "", ci: saved.ci || "", em: saved.em || "", addr: "" },
    order: null,
  };
  head(p);
  openLayer($("#ov"), opener, () => {
    stopPoll();
    S = null;
  });
  draw();
  loadAvailability().then(() => S && S.step === 0 && draw());
}

function head(p) {
  $(".modal", $("#ov")).style.setProperty("--g", grad(p.c));
  $("#mhead").innerHTML = `
    <div class="m-img">${img(p.img, "")}</div>
    <div><small>${esc(p.tag)}${p.venue ? " · " + esc(p.venue) : ""}</small><h2 id="mt">${esc(p.t)}</h2><p>${bs(p.price)} ${p.type === "show" ? "por entrada" : "c/u"}</p></div>`;
}

function setStep(n) {
  S.step = n;
  draw();
}
function draw() {
  if (!S) return;
  $$("#progress li").forEach((li, i) => {
    li.classList.toggle("on", i <= S.step);
    li.toggleAttribute("aria-current", i === S.step);
  });
  body.classList.remove("in");
  void body.offsetWidth;
  body.classList.add("in");
  [stepChoose, stepBuyer, stepPay, stepDone][S.step]();
}
const total = () => S.p.price * S.qty;
const maxQty = () => {
  if (!AVAIL) return S.p.maxQty;
  const left = S.p.id === "obra" ? AVAIL.obra[S.funcion] ?? 0 : AVAIL.libro;
  return Math.max(0, Math.min(S.p.maxQty, left));
};
function detalle() {
  const f = S.p.id === "obra" && OBRA.funciones.find((x) => x.id === S.funcion);
  return `${S.qty} ${unit(S.p, S.qty)} · ${S.p.t}` + (f ? ` · ${fLong(f)}` : "");
}

/* Paso 1: función / entrega y cantidad */
function stepChoose() {
  const p = S.p;
  let opts = "";
  if (p.id === "obra") {
    opts = `<fieldset class="zones"><legend>Elige la función</legend>${OBRA.funciones
      .slice()
      .sort((a, b) => fDate(a) - fDate(b))
      .map((f) => {
        const past = fDate(f) < new Date();
        const left = AVAIL ? AVAIL.obra[f.id] : null;
        const off = past || left === 0;
        const note = past ? "Finalizada" : left === 0 ? "Agotado" : left != null && left <= 30 ? `¡Quedan ${left}!` : "Disponible";
        return `<label class="zone${off ? " off" : ""}"><input type="radio" name="opt" value="${f.id}" ${S.funcion === f.id ? "checked" : ""} ${off ? "disabled" : ""}>
          <span class="z-n">${esc(fLong(f))}</span><span class="z-s${left != null && left <= 30 && !off ? " hot" : ""}">${note}</span><span class="z-p">${bs(p.price)}</span></label>`;
      })
      .join("")}</fieldset>`;
  } else {
    opts = `<p class="about">${esc(p.s)}</p><fieldset class="zones"><legend>¿Cómo lo recibes?</legend>${p.delivery
      .map((d) => `<label class="zone"><input type="radio" name="opt" value="${d.id}" ${S.delivery === d.id ? "checked" : ""}><span class="z-n">${esc(d.n)}</span></label>`)
      .join("")}</fieldset>`;
  }
  body.innerHTML = `
    ${opts}
    <div class="qty-row"><span>Cantidad de ${esc(p.unit[1])}</span><div class="qty"><button type="button" id="qm" aria-label="Quitar una">−</button><output id="qv" aria-live="polite">${S.qty}</output><button type="button" id="qp" aria-label="Agregar una">+</button></div></div>
    <p class="msg tiny" id="qnote"></p>
    <div class="summary"><span>Total</span><b id="tt">${bs(total())}</b></div>
    <div class="nav"><span></span><button class="btn" id="nx" type="button">Continuar</button></div>`;
  const upd = () => {
    const mx = maxQty();
    S.qty = Math.max(1, Math.min(S.qty, mx || 1));
    $("#qv").textContent = S.qty;
    $("#tt").textContent = bs(total());
    $("#qm").disabled = S.qty <= 1;
    $("#qp").disabled = S.qty >= mx;
    $("#qnote").textContent = S.qty >= S.p.maxQty ? `Máximo ${S.p.maxQty} por pedido.` : "";
    $("#nx").disabled = !mx || (p.id === "obra" && !S.funcion);
  };
  $$('input[name="opt"]', body).forEach(
    (r) =>
      (r.onchange = () => {
        if (p.id === "obra") S.funcion = r.value;
        else S.delivery = r.value;
        upd();
      }),
  );
  $("#qm").onclick = () => (S.qty--, upd());
  $("#qp").onclick = () => (S.qty++, upd());
  upd();
  $("#nx").onclick = () => setStep(1);
}

/* Paso 2: datos */
function stepBuyer() {
  const u = S.buyer;
  const isObra = S.p.id === "obra";
  const needsAddr = !isObra && S.p.delivery.find((d) => d.id === S.delivery)?.needsAddress;
  body.innerHTML = `
    <form id="bf" novalidate>
      <label for="bn">Nombre completo</label><input id="bn" autocomplete="name" value="${esc(u.n)}" required>
      ${isObra ? `<label for="bci">CI / Documento <small>(para validar tu entrada en la puerta)</small></label><input id="bci" inputmode="numeric" value="${esc(u.ci)}" required>` : ""}
      ${needsAddr ? `<label for="baddr">Dirección de envío</label><input id="baddr" autocomplete="street-address" value="${esc(u.addr)}" placeholder="Barrio, calle, número, referencia" required>` : ""}
      <label for="bem">Correo <small>(opcional)</small></label><input id="bem" type="email" autocomplete="email" value="${esc(u.em)}">
      <p class="error" id="er" role="alert"></p>
      <div class="summary"><span>${esc(detalle())}</span><b>${bs(total())}</b></div>
      <div class="nav"><button class="btn ghost" id="bk" type="button">Atrás</button><button class="btn" type="submit">Ir a pagar</button></div>
    </form>`;
  $("#bk").onclick = () => setStep(0);
  $("#bf").onsubmit = (ev) => {
    ev.preventDefault();
    const v = { n: $("#bn").value.trim(), ci: $("#bci")?.value.trim() || "", em: $("#bem").value.trim(), addr: $("#baddr")?.value.trim() || "" };
    const bad = [];
    if (v.n.length < 3 || !v.n.includes(" ")) bad.push("bn");
    if (isObra && !/^\d{5,}[A-Za-z0-9-]*$/.test(v.ci)) bad.push("bci");
    if (needsAddr && v.addr.length < 5) bad.push("baddr");
    if (v.em && !/^\S+@\S+\.\S+$/.test(v.em)) bad.push("bem");
    ["bn", "bci", "baddr", "bem"].forEach((k) => {
      const el = $("#" + k);
      if (!el) return;
      el.classList.toggle("err", bad.includes(k));
      el.setAttribute("aria-invalid", bad.includes(k));
    });
    if (bad.length) {
      $("#er").textContent = bad.includes("bn") && v.n && !v.n.includes(" ") ? "Escribe tu nombre y apellido." : "Revisa los campos marcados.";
      $("#" + bad[0]).focus();
      return;
    }
    S.buyer = v;
    store.set("st_buyer", { n: v.n, ci: v.ci, em: v.em });
    setStep(2);
  };
}

/* Paso 3: pago por WhatsApp */
async function stepPay() {
  if (!S.order) {
    body.innerHTML = `<div class="loading">Preparando tu pedido…</div>`;
    try {
      if (SERVER) {
        const o = await api("/orders", { method: "POST", body: { product: S.p.id, funcion: S.funcion, delivery: S.delivery, qty: S.qty, buyer: S.buyer, source: SOURCE } });
        if (!S) return;
        S.order = o;
      } else {
        S.order = localOrder();
      }
      saveOrder({ code: S.order.code, key: S.order.key || null, product: S.p.id, detalle: S.order.detalle, amount: S.order.amount, waLink: S.order.waLink, at: Date.now() });
    } catch (e) {
      if (!S) return;
      body.innerHTML = `<p class="error">${esc(e.message)}</p><div class="nav"><button class="btn ghost" id="bk" type="button">Atrás</button><button class="btn" id="rt" type="button">Reintentar</button></div>`;
      $("#bk").onclick = () => setStep(0);
      $("#rt").onclick = () => stepPay();
      loadAvailability();
      return;
    }
  }
  renderPay();
  if (SERVER && S.order.key) startPoll();
}

function localOrder() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = "ST-" + Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => abc[b % 32]).join("");
  const d = detalle();
  const extra = [S.buyer.n, S.buyer.ci && "CI " + S.buyer.ci, S.buyer.addr && "Envío: " + S.buyer.addr].filter(Boolean).join(" · ");
  const text = `Hola, quiero pagar mi pedido ${code}: ${d} — Bs ${total()}\n${extra}`;
  return { code, detalle: d, amount: total(), status: "nuevo", waLink: `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}` };
}

const TRACK = [
  ["nuevo", "Envía tu pedido por WhatsApp", "Toca el botón verde y envía el mensaje que ya está escrito."],
  ["qr_enviado", "Paga el QR que te enviamos", "Descarga la imagen del QR y págala desde la app de tu banco."],
  ["comprobante", "Envía tu comprobante", "Manda la foto del comprobante en el mismo chat. Lo validamos enseguida."],
  ["pagado", "Recibe tu entrada", "Te enviamos tu entrada única por WhatsApp."],
];
const trackIdx = (s) => ({ nuevo: 0, esperando_qr: 1, qr_enviado: 1, comprobante: 2, pagado: 3 })[s] ?? 0;

function renderPay() {
  const o = S.order;
  const i = trackIdx(o.status);
  const ended = o.status === "vencido" || o.status === "cancelado";
  body.innerHTML = `
    <div class="pay-head">
      <div><small>Tu pedido</small><strong class="code">${esc(o.code)}</strong></div>
      <div class="amt"><small>Total a pagar</small><b>${bs(o.amount)}</b></div>
    </div>
    <p class="msg">${esc(o.detalle)}</p>
    ${ended ? `<p class="error">Este pedido ${o.status === "vencido" ? "venció" : "fue cancelado"}. Puedes hacer uno nuevo.</p>` : ""}
    ${o.rejected ? `<p class="warn">⚠ No pudimos validar tu comprobante: ${esc(o.rejected)}. Envíalo de nuevo en el chat.</p>` : ""}
    <a class="btn wa block${i > 0 ? " ghost-wa" : ""}" href="${esc(o.waLink)}" target="_blank" rel="noopener" id="waBtn">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>
      ${i > 0 ? "Volver al chat de WhatsApp" : "Abrir WhatsApp y pedir mi QR"}
    </a>
    <p class="msg tiny center">¿No se abrió? Escribe al <b>${esc(waNumber)}</b> con tu código <b>${esc(o.code)}</b>.</p>
    <ol class="track">${TRACK.map(([, t, d], k) => `<li class="${k < i ? "done" : k === i && !ended ? "now" : ""}"><span></span><div><b>${t}</b><p>${d}</p></div></li>`).join("")}</ol>
    ${SERVER ? `<p class="msg tiny center live-note"><i class="dot"></i> Esta pantalla se actualiza sola. También puedes cerrarla: tu pedido queda en <b>Mis pedidos</b>.</p>` : `<p class="msg tiny center">Guarda tu código. Cuando validemos tu pago te enviamos la entrada por WhatsApp.</p>`}
    <div class="nav"><button class="btn ghost" id="cl" type="button">Cerrar</button><span></span></div>`;
  $("#cl").onclick = () => closeLayer($("#ov"));
}

function startPoll() {
  stopPoll();
  const check = async () => {
    if (!S || !S.order) return stopPoll();
    try {
      const o = await api(`/orders/${S.order.code}?k=${S.order.key}`);
      if (!S) return;
      const changed = o.status !== S.order.status || o.rejected !== S.order.rejected;
      S.order = { ...S.order, ...o };
      if (o.status === "pagado") {
        stopPoll();
        setStep(3);
        burst();
      } else if (changed && S.step === 2) renderPay();
      if (["vencido", "cancelado"].includes(o.status)) stopPoll();
    } catch {}
  };
  poll = setInterval(check, 4000);
  check();
}

/* Paso 4: listo */
function stepDone() {
  const o = S.order;
  const isObra = S.p.id === "obra";
  body.innerHTML = `
    <div class="done">
      <svg class="ok" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg>
      <h3>¡Pago confirmado${S.buyer.n ? ", " + esc(S.buyer.n.split(" ")[0]) : ""}!</h3>
      <p class="msg">${isObra ? "Tu entrada única ya está en tu WhatsApp. También puedes verla aquí:" : "Te escribimos por WhatsApp para coordinar la entrega."}</p>
    </div>
    ${
      isObra && o.ticket
        ? `<div class="mini-ticket"><div class="t-qr">${qrSVG(o.ticket.link, "QR de tu entrada")}</div><div><small>Código</small><strong>${esc(o.ticket.code)}</strong><p>${esc(o.detalle)}</p><a class="btn sm" href="${esc(o.ticket.link)}" target="_blank" rel="noopener">Abrir mi entrada</a></div></div>`
        : `<div class="summary"><span>${esc(o.detalle)}</span><b>${bs(o.amount)}</b></div>`
    }
    <div class="nav"><span></span><button class="btn" id="cl" type="button">Cerrar</button></div>`;
  $("#cl").onclick = () => closeLayer($("#ov"));
}

/* Retomar un pedido desde "Mis pedidos" */
function resumeOrder(saved, opener) {
  const p = PRODUCTS[saved.product];
  stopPoll();
  S = { p, step: 2, qty: 1, buyer: store.get("st_buyer", {}), order: { ...saved, status: saved.status || "nuevo" } };
  head(p);
  openLayer($("#ov"), opener, () => {
    stopPoll();
    S = null;
  });
  draw();
}

/* ---------------- Mis pedidos ---------------- */
$("#openOrders").onclick = async (ev) => {
  renderOrders();
  openLayer($("#tk"), ev.currentTarget);
  if (!SERVER) return;
  const list = myOrders();
  await Promise.all(
    list.filter((o) => o.key).map(async (o) => {
      try {
        Object.assign(o, await api(`/orders/${o.code}?k=${o.key}`));
      } catch {}
    }),
  );
  store.set("st_orders", list);
  renderOrders();
};
function renderOrders() {
  const all = myOrders();
  if (!all.length) {
    $("#tkList").innerHTML = `<div class="empty-tk"><p>Aún no tienes pedidos.</p><button class="btn" type="button" data-buy="obra">Comprar entradas</button></div>`;
    return;
  }
  $("#tkList").innerHTML =
    all
      .map(
        (o) => `
    <article class="ord st-${esc(o.status || "nuevo")}">
      <div class="ord-top"><strong>${esc(o.code)}</strong><span class="pill">${esc(o.label || (SERVER ? "Consultando…" : "Pedido enviado"))}</span></div>
      <p>${esc(o.detalle)}</p>
      <div class="ord-foot"><b>${bs(o.amount)}</b>
      ${o.ticket?.link ? `<a class="btn sm" href="${esc(o.ticket.link)}" target="_blank" rel="noopener">Ver entrada</a>` : o.status === "pagado" ? `<span class="pill ok">Confirmado</span>` : `<button class="btn sm" type="button" data-track="${esc(o.code)}">Seguir pedido</button>`}</div>
    </article>`,
      )
      .join("") + `<p class="msg tiny">Tus pedidos se guardan en este dispositivo. Las entradas también te llegan por WhatsApp.</p>`;
}

/* ---------------- Podcast: avísame ---------------- */
$("#leadForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const name = $("#ln").value.trim(),
    phone = $("#lp").value.replace(/\D/g, "");
  $("#ln").classList.toggle("err", name.length < 2);
  $("#lp").classList.toggle("err", phone.length < 7);
  if (name.length < 2 || phone.length < 7) return ($("#leadErr").textContent = "Escribe tu nombre y tu número de WhatsApp.");
  $("#leadErr").textContent = "";
  const btn = $("#leadForm button");
  btn.disabled = true;
  try {
    if (SERVER) await api("/leads", { method: "POST", body: { name, phone, interest: "podcast", source: SOURCE.src } });
    else window.open(`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(`Hola, soy ${name}. Avísenme cuando salga el podcast 🎙️`)}`, "_blank", "noopener");
    $("#leadForm").outerHTML = `<p class="thanks">¡Listo, ${esc(name.split(" ")[0])}! Te avisaremos por WhatsApp el día del estreno. 🎙️</p>`;
  } catch (e) {
    $("#leadErr").textContent = e.message;
    btn.disabled = false;
  }
};

/* =====================================================================
   VIDEOS
   ===================================================================== */
function youtubeId(url) {
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m && m[1];
}
function openVideo(i, opener) {
  const v = VIDEOS[i];
  const yt = youtubeId(v.src);
  $("#player").innerHTML = yt
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0" title="${esc(v.t)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
    : `<video src="${esc(v.src)}" poster="${esc(v.poster)}" controls autoplay playsinline preload="metadata"></video>`;
  const vid = $("#player video");
  /* el reproductor toma la forma del video (horizontal o vertical) */
  $("#player").style.aspectRatio = "";
  if (vid) vid.onloadedmetadata = () => vid.videoWidth && ($("#player").style.aspectRatio = `${vid.videoWidth} / ${vid.videoHeight}`);
  if (vid) vid.onerror = () => ($("#player").innerHTML = `<div class="v-err"><p>No pudimos cargar este video.</p><a class="btn ghost sm" href="${esc(v.src)}" target="_blank" rel="noopener">Abrir en otra pestaña</a></div>`);
  const p = PRODUCTS[v.product];
  const canBuy = p && p.price && (p.id !== "obra" || upcoming().length);
  $("#vbar").innerHTML = `<div><small>${esc(v.tag)}</small><h3>${esc(v.t)}</h3></div>${canBuy ? `<button class="btn sm" type="button" id="vbuy">${p.id === "obra" ? "Comprar entradas" : "Comprar el libro"}</button>` : ""}`;
  if (canBuy) $("#vbuy").onclick = () => (closeLayer($("#vo")), openCheckout(p.id));
  openLayer($("#vo"), opener, () => ($("#player").innerHTML = ""));
}

/* al reproducir un video, se pausan los demás de la página */
document.addEventListener(
  "play",
  (ev) => $$("video").forEach((v) => v !== ev.target && !v.paused && v.pause()),
  true,
);

/* ---------------- confeti ---------------- */
function burst() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("div");
  c.className = "confetti";
  const k = ["#ff4f6d", "#ffb547", "#8b6cff", "#3dd6c6", "#ffffff"];
  for (let i = 0; i < 48; i++) {
    const s = document.createElement("i");
    s.style.cssText = `left:${Math.random() * 100}%;background:${k[i % 5]};animation-delay:${Math.random() * 0.5}s;animation-duration:${2 + Math.random() * 1.6}s;--x:${(Math.random() - 0.5) * 180}px`;
    c.appendChild(s);
  }
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 4500);
}

/* ---------------- inicio ---------------- */
$("#yr").textContent = new Date().getFullYear();
$("#footWa").href = `https://wa.me/${CONTACT.whatsapp}`;
renderHero();
renderBook();
renderSoon();
renderVideos();
updateCount();
detectServer().then(async (ok) => {
  SERVER = ok;
  if (!ok) $("#modeBadge").textContent = "· Vista sin servidor: los pedidos se envían por WhatsApp y se validan a mano.";
  await loadAvailability();
  /* Enlaces directos desde redes: ?p=obra o ?p=libro abre la compra */
  const want = params.get("p");
  if (PRODUCTS[want]?.price) openCheckout(want);
  else if (want === "podcast") $("#podcast").scrollIntoView();
});
