/* =====================================================================
   SOTIRIA — página pública
   ===================================================================== */
const { PRODUCTS, VIDEOS, GALLERY, CONTACT } = DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bs = (n) => "Bs " + Number(n).toLocaleString("es-BO");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fDate = (f) => new Date(`${f.d}T${f.h}`);
const fLong = (f) => cap(fDate(f).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" })) + " · " + f.h;
const grad = (c) => `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
const img = (src, alt = "") => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.remove()">`;
const OBRA = PRODUCTS.obra,
  LIBRO = PRODUCTS.libro,
  POD = PRODUCTS.podcast;
const upcoming = (p) => (p.funciones || []).filter((f) => fDate(f) > new Date());
const waLink = (text) => `https://wa.me/${CONTACT.whatsapp}${text ? "?text=" + encodeURIComponent(text) : ""}`;

/* ---------- origen de la visita (Facebook, Instagram, TikTok…) para el CRM ---------- */
const params = new URLSearchParams(location.search);
const SRC = (() => {
  let s = params.get("src") || params.get("utm_source");
  if (!s) {
    const r = document.referrer;
    s = /facebook|fb\./.test(r) ? "facebook" : /instagram/.test(r) ? "instagram" : /tiktok/.test(r) ? "tiktok" : /whatsapp|wa\.me/.test(r) ? "whatsapp" : "";
  }
  try {
    if (s) sessionStorage.setItem("st_src", s);
    return s || sessionStorage.getItem("st_src") || "directo";
  } catch {
    return s || "directo";
  }
})();

/* ---------- servidor ---------- */
let ONLINE = false;
async function api(path, body) {
  const r = await fetch("/api" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "No pudimos conectar con el servidor. Intenta de nuevo.");
  return j;
}
const ready = (async () => {
  if (location.protocol === "file:") return;
  try {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 2000);
    ONLINE = (await fetch("/api/health", { signal: ctl.signal })).ok;
  } catch {}
})();

/* ---------- compras guardadas en este dispositivo ---------- */
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
const myOrders = () => store.get("st_orders", []);
function saveOrder(o) {
  store.set("st_orders", [o, ...myOrders().filter((x) => x.id !== o.id)].slice(0, 30));
  updateCount();
}
function updateCount() {
  const n = myOrders().length;
  $("#ordCount").textContent = n;
  $("#ordCount").hidden = !n;
}

/* =====================================================================
   RENDER
   ===================================================================== */
function renderHero() {
  const next = upcoming(OBRA)[0];
  $("#heroTitle").innerHTML = esc(OBRA.t);
  $("#heroLead").textContent = OBRA.s;
  $("#heroPrice").textContent = bs(OBRA.price);
  $("#heroDates").innerHTML = upcoming(OBRA)
    .map((f) => `<li><b>${fDate(f).getDate()}</b><span>${esc(fDate(f).toLocaleDateString("es-BO", { month: "short" }).replace(".", ""))}<br>${f.h}</span></li>`)
    .join("");
  $("#heroArt").innerHTML = `<div class="poster" style="--g:${grad(OBRA.c)}">${img(OBRA.img, "Afiche de " + OBRA.t)}<div class="poster-txt"><small>${esc(OBRA.venue)}</small><b>${esc(OBRA.t)}</b></div></div>`;
  if (!next) {
    $("#heroTag").textContent = "Temporada finalizada";
    $("#heroCd").hidden = true;
  } else $("#heroCd").dataset.cd = `${next.d}T${next.h}`;
  tick();
}
function tick() {
  const el = $("#heroCd");
  if (!el.dataset.cd) return;
  const ms = new Date(el.dataset.cd) - new Date();
  if (ms <= 0) return (el.innerHTML = "<span><b>¡Hoy!</b>es la función</span>");
  const d = Math.floor(ms / 864e5),
    h = Math.floor(ms / 36e5) % 24,
    m = Math.floor(ms / 6e4) % 60;
  el.innerHTML = `<span><b>${d}</b>días</span><span><b>${String(h).padStart(2, "0")}</b>horas</span><span><b>${String(m).padStart(2, "0")}</b>min</span>`;
}
setInterval(tick, 30000);

function renderTrio() {
  const card = (p, cta) => `
    <article class="pcard${p.type === "soon" ? " is-soon" : ""}" style="--g:${grad(p.c)}">
      <a class="pcard-hit" href="#${p.id}" aria-label="${esc(p.tag)}: ${esc(p.t)}"></a>
      <div class="pcard-img">${img(p.img)}${p.type === "soon" ? '<span class="ribbon">Próximamente</span>' : ""}</div>
      <div class="pcard-body">
        <small>${esc(p.tag)}</small>
        <h3>${esc(p.t)}</h3>
        <p>${esc(p.s)}</p>
        <div class="pcard-foot">${cta}</div>
      </div>
    </article>`;
  $("#trio").innerHTML =
    card(OBRA, `<span>Entradas <b>${bs(OBRA.price)}</b></span><button class="btn sm" type="button" data-buy="obra">Comprar</button>`) +
    card(LIBRO, `<span><b>${bs(LIBRO.price)}</b></span><button class="btn sm" type="button" data-buy="libro">Comprar</button>`) +
    card(POD, `<span>Muy pronto</span><a class="btn ghost sm" href="#podcast">Avísame</a>`);
}

function renderObra(av) {
  $("#obraImg").innerHTML = `<div style="--g:${grad(OBRA.c)}">${img(OBRA.img, OBRA.t)}</div>`;
  $("#obraTitle").textContent = OBRA.t;
  $("#obraLong").textContent = OBRA.long;
  $("#obraFacts").innerHTML = `<li><b>Lugar</b>${esc(OBRA.venue)} — ${esc(OBRA.addr)}</li><li><b>Duración</b>${esc(OBRA.dur)}</li><li><b>Edad</b>${esc(OBRA.age)}</li><li><b>Entrada</b>${bs(OBRA.price)} por persona</li>`;
  const fs = upcoming(OBRA);
  $("#obraFuncs").innerHTML = fs.length
    ? fs
        .map((f) => {
          const left = av?.obra?.[f.id];
          const note = left === undefined ? "" : !left ? `<em class="out">Agotado</em>` : left <= 30 ? `<em class="hot">¡Quedan ${left}!</em>` : `<em>Disponible</em>`;
          return `<li><span>${esc(fLong(f))}</span>${note}</li>`;
        })
        .join("")
    : `<li><span>Pronto anunciaremos nuevas funciones.</span></li>`;
}

function renderLibro() {
  $("#libroImg").innerHTML = `<div style="--g:${grad(LIBRO.c)}">${img(LIBRO.img, LIBRO.t)}</div>`;
  $("#libroTitle").textContent = LIBRO.t;
  $("#libroAuthor").textContent = "por " + LIBRO.author;
  $("#libroLong").textContent = LIBRO.long;
  $("#libroPrice").textContent = bs(LIBRO.price);
  $("#libroFacts").innerHTML = LIBRO.delivery.map((d) => `<li><b>✓</b>${esc(d.n)}</li>`).join("");
}

function renderPodcast() {
  $("#podTitle").textContent = POD.t;
  $("#podLong").textContent = POD.long;
  $("#soon").style.setProperty("--g", grad(POD.c));
}

function renderVideos() {
  $("#vids").innerHTML = VIDEOS.map(
    (v, i) => `
    <button class="vid" type="button" data-vid="${i}" style="--g:${grad(v.product ? PRODUCTS[v.product].c : POD.c)}">
      ${img(v.poster)}
      <span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
      <span class="vid-txt"><small>${esc(v.tag)}</small>${esc(v.t)}</span>
    </button>`,
  ).join("");
}

function renderGallery() {
  $("#gal").innerHTML = GALLERY.map((p, i) => `<figure class="g-item gi${i + 1}">${img(p.src, p.alt)}<figcaption><small>${esc(p.tag)}</small>${esc(p.title)}</figcaption></figure>`).join("");
}

/* ---------- podcast: avísame ---------- */
$("#notifyForm").onsubmit = async (ev) => {
  ev.preventDefault();
  const name = $("#nn").value.trim(),
    tel = $("#nt").value.replace(/\s/g, "");
  const bad = [
    ["nn", name.length < 2],
    ["nt", !/^\+?\d{7,}$/.test(tel)],
  ];
  bad.forEach(([k, b]) => $("#" + k).classList.toggle("err", b));
  if (bad.some(([, b]) => b)) return ($("#notifyErr").textContent = "Escribe tu nombre y tu celular.");
  $("#notifyErr").textContent = "";
  const btn = $("#notifyForm button");
  btn.disabled = true;
  try {
    await ready;
    if (ONLINE) await api("/leads", { name, tel, interest: "podcast", src: SRC });
    $("#notifyForm").innerHTML = `<div class="done-small"><b>¡Listo, ${esc(name.split(" ")[0])}! 🎙️</b><p>Te avisaremos por WhatsApp el día del estreno.</p></div>`;
  } catch (e) {
    $("#notifyErr").textContent = e.message;
    btn.disabled = false;
  }
};

/* ---------- menú ---------- */
$("#burger").onclick = () => $("#burger").setAttribute("aria-expanded", document.body.classList.toggle("menu-open"));
$("#nav").addEventListener("click", (ev) => {
  if (ev.target.closest("a")) {
    document.body.classList.remove("menu-open");
    $("#burger").setAttribute("aria-expanded", "false");
  }
});
window.addEventListener("scroll", () => $("#top").classList.toggle("scrolled", scrollY > 10), { passive: true });

/* =====================================================================
   CAPAS (modal / drawer)
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
  l.opener?.focus?.();
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

document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-buy]");
  if (b) return openCheckout(b.dataset.buy, b);
  const v = ev.target.closest("[data-vid]");
  if (v) openVideo(+v.dataset.vid, v);
});

/* =====================================================================
   COMPRA
   ===================================================================== */
let S = null,
  poll = null;
const body = $("#mbody");
const stopPoll = () => clearInterval(poll);
const unitOf = (p, n) => (n === 1 ? p.unit[0] : p.unit[1]);
const total = () => S.p.price * S.qty;

async function openCheckout(pid, opener) {
  const p = PRODUCTS[pid];
  if (!p || !p.price) return;
  stopPoll();
  S = { p, qty: 1, step: 0, funcion: null, delivery: p.delivery?.[0].id || null, buyer: store.get("st_buyer", {}), av: null };
  $(".modal", $("#ov")).style.setProperty("--g", grad(p.c));
  $("#mhead").innerHTML = `<div class="m-img">${img(p.img)}</div><div><small>${esc(p.tag)}${p.venue ? " · " + esc(p.venue) : ""}</small><h2 id="mt">${esc(p.t)}</h2><p>${bs(p.price)} ${p.type === "show" ? "por entrada" : "c/u"}</p></div>`;
  openLayer($("#ov"), opener, () => {
    stopPoll();
    S = null;
  });
  draw();
  await ready;
  try {
    S && ONLINE && (S.av = await api("/availability"));
  } catch {}
  if (!S) return;
  if (p.type === "show") {
    const fs = upcoming(p);
    S.funcion = (fs.find((f) => !S.av || S.av.obra[f.id] > 0) || {}).id || null;
  }
  if (S.step === 0) draw();
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

function maxQty() {
  const p = S.p;
  let left = p.maxQty;
  if (S.av) left = p.type === "show" ? S.av.obra[S.funcion] ?? 0 : S.av[p.id] ?? 0;
  return Math.min(p.maxQty, left);
}

/* Paso 1 */
function stepChoose() {
  const p = S.p;
  let choose = "";
  if (p.type === "show") {
    const fs = upcoming(p);
    if (!fs.length) {
      body.innerHTML = `<p class="about">No hay funciones a la venta por ahora. Muy pronto anunciaremos nuevas fechas.</p>`;
      return;
    }
    choose = `<fieldset class="opts"><legend>Elige la función</legend>${fs
      .map((f) => {
        const left = S.av ? S.av.obra[f.id] : null;
        const note = left === null ? "" : !left ? "Agotado" : left <= 30 ? `¡Quedan ${left}!` : "Disponible";
        return `<label class="opt${left === 0 ? " off" : ""}"><input type="radio" name="fn" value="${f.id}" ${S.funcion === f.id ? "checked" : ""} ${left === 0 ? "disabled" : ""}><span class="o-n">${esc(fLong(f))}</span><span class="o-s${left && left <= 30 ? " hot" : ""}">${note}</span></label>`;
      })
      .join("")}</fieldset>`;
  } else {
    choose = `<fieldset class="opts"><legend>¿Cómo quieres recibirlo?</legend>${p.delivery
      .map((d) => `<label class="opt"><input type="radio" name="dl" value="${d.id}" ${S.delivery === d.id ? "checked" : ""}><span class="o-n">${esc(d.n)}</span></label>`)
      .join("")}</fieldset>`;
  }
  const none = p.type === "show" && !S.funcion;
  body.innerHTML = `
    ${choose}
    ${none ? `<p class="error">Todas las funciones están agotadas.</p>` : `<div class="qty-row"><span>¿Cuántas ${p.unit[1]}?</span><div class="qty"><button type="button" id="qm" aria-label="Quitar">−</button><output id="qv" aria-live="polite">${S.qty}</output><button type="button" id="qp" aria-label="Agregar">+</button></div></div>`}
    <div class="summary"><span id="sumL"></span><b id="tt"></b></div>
    <div class="nav"><span></span><button class="btn" id="nx" type="button" ${none ? "disabled" : ""}>Continuar</button></div>`;
  if (none) return;
  const upd = () => {
    S.qty = Math.max(1, Math.min(S.qty, maxQty() || 1));
    $("#qv").textContent = S.qty;
    $("#sumL").textContent = `${S.qty} ${unitOf(p, S.qty)} × ${bs(p.price)}`;
    $("#tt").textContent = bs(total());
    $("#qm").disabled = S.qty <= 1;
    $("#qp").disabled = S.qty >= maxQty();
  };
  $$('input[name="fn"]', body).forEach((r) => (r.onchange = () => ((S.funcion = r.value), upd())));
  $$('input[name="dl"]', body).forEach((r) => (r.onchange = () => (S.delivery = r.value)));
  $("#qm").onclick = () => (S.qty--, upd());
  $("#qp").onclick = () => (S.qty++, upd());
  upd();
  $("#nx").onclick = () => setStep(1);
}

/* Paso 2 */
function stepBuyer() {
  const u = S.buyer,
    p = S.p;
  const needsAddr = p.type === "book" && p.delivery.find((d) => d.id === S.delivery)?.needsAddress;
  body.innerHTML = `
    <form id="bf" novalidate>
      <label for="bn">Nombre completo</label><input id="bn" autocomplete="name" value="${esc(u.n)}" required>
      <div class="row"><div><label for="bci">CI</label><input id="bci" inputmode="numeric" value="${esc(u.ci)}" required></div>
      <div><label for="btel">Celular con WhatsApp</label><input id="btel" type="tel" autocomplete="tel" placeholder="7XXXXXXX" value="${esc(u.tel)}" required></div></div>
      <label for="bem">Correo <span class="opt-l">(opcional)</span></label><input id="bem" type="email" autocomplete="email" value="${esc(u.em)}">
      ${needsAddr ? `<label for="bad">Dirección de entrega</label><input id="bad" autocomplete="street-address" value="${esc(u.address)}" placeholder="Calle, número, barrio y referencia" required>` : ""}
      <p class="msg tiny">📱 Usa el número de WhatsApp desde el que vas a pagar: ahí te llegará ${p.type === "show" ? "tu entrada" : "tu confirmación"}.</p>
      <p class="error" id="er" role="alert"></p>
      <div class="summary"><span>${S.qty} ${unitOf(p, S.qty)}</span><b>${bs(total())}</b></div>
      <div class="nav"><button class="btn ghost" id="bk" type="button">Atrás</button><button class="btn" type="submit">Continuar al pago</button></div>
    </form>`;
  $("#bk").onclick = () => setStep(0);
  $("#bf").onsubmit = async (ev) => {
    ev.preventDefault();
    const v = { n: $("#bn").value.trim(), ci: $("#bci").value.trim(), tel: $("#btel").value.replace(/\s/g, ""), em: $("#bem").value.trim(), address: needsAddr ? $("#bad").value.trim() : "" };
    const bad = [];
    if (v.n.length < 3) bad.push("bn");
    if (!/^\d{5,}[A-Za-z0-9-]*$/.test(v.ci)) bad.push("bci");
    if (!/^\+?\d{7,}$/.test(v.tel)) bad.push("btel");
    if (v.em && !/^\S+@\S+\.\S+$/.test(v.em)) bad.push("bem");
    if (needsAddr && v.address.length < 5) bad.push("bad");
    $$("input", $("#bf")).forEach((i) => {
      i.classList.toggle("err", bad.includes(i.id));
      i.setAttribute("aria-invalid", bad.includes(i.id));
    });
    if (bad.length) {
      $("#er").textContent = "Revisa los campos marcados.";
      return $("#" + bad[0]).focus();
    }
    S.buyer = v;
    store.set("st_buyer", { ...v, address: v.address || u.address });
    const btn = $('#bf button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Creando tu pedido…";
    try {
      await ready;
      if (ONLINE) {
        S.order = await api("/orders", { product: p.id, funcion: S.funcion, qty: S.qty, delivery: S.delivery, buyer: v, src: SRC });
      } else {
        /* sin servidor: el pedido se arma igual y se envía por WhatsApp */
        const f = p.funciones?.find((x) => x.id === S.funcion);
        const id = "WEB-" + Date.now().toString(36).toUpperCase().slice(-6);
        const text = `Hola, quiero comprar: ${S.qty} ${unitOf(p, S.qty)} — ${p.t}${f ? " (" + fLong(f) + ")" : ""} — ${bs(total())}. Pedido ${id}. Nombre: ${v.n}, CI ${v.ci}`;
        S.order = { id, status: "nueva", amount: total(), waText: text, waLink: waLink(text), offline: true };
      }
      saveOrder({ id: S.order.id, product: p.id, funcion: S.funcion, qty: S.qty, amount: S.order.amount, waLink: S.order.waLink, at: Date.now(), offline: !!S.order.offline, status: S.order.status });
      setStep(2);
    } catch (e) {
      $("#er").textContent = e.message;
      btn.disabled = false;
      btn.textContent = "Continuar al pago";
    }
  };
}

/* Paso 3: pagar por WhatsApp + seguimiento en vivo */
const TRACK = [
  ["nueva", "Escríbenos por WhatsApp", "Toca el botón verde y envía el mensaje que ya está escrito."],
  ["esperando_pago", "Paga el QR", "Te enviamos el QR por el monto exacto. Descárgalo y págalo desde la app de tu banco."],
  ["en_revision", "Envía el comprobante", "Manda la foto o captura del comprobante al mismo chat. Lo estamos verificando."],
  ["aprobada", "Recibe tu entrada", "Te llega tu entrada única con QR por WhatsApp."],
];
function stepPay() {
  const o = S.order,
    p = S.p;
  if (p.type === "book") TRACK[3][1] = "Recibe tu confirmación";
  body.innerHTML = `
    <div class="paybox">
      <p class="paylabel">Tu código de pedido</p>
      <p class="paycode">${esc(o.id)}</p>
      <p class="payamt">Total a pagar: <b>${bs(o.amount)}</b></p>
      <a class="btn wa block" href="${esc(o.waLink)}" target="_blank" rel="noopener" id="waBtn">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z"/></svg>
        Abrir WhatsApp y recibir mi QR
      </a>
      <p class="msg tiny center">Se abrirá WhatsApp con tu pedido ya escrito: solo tócale <b>Enviar</b>.</p>
    </div>
    <ol class="track" id="track"></ol>
    ${o.offline ? `<p class="msg tiny center">Te responderemos por WhatsApp con el QR y tu entrada.</p>` : `<p class="msg tiny center" id="live"><span class="dot"></span> Esta pantalla se actualiza sola. Puedes cerrarla: tu pedido queda en <b>Mis compras</b>.</p>`}
    <p class="error" id="er" role="alert"></p>`;
  renderTrack(o.status);
  if (!o.offline) {
    stopPoll();
    poll = setInterval(checkStatus, 4000);
  }
}
function renderTrack(status) {
  const order = TRACK.map((t) => t[0]);
  let idx = order.indexOf(status);
  if (status === "nueva" && $("#waBtn")?.dataset.clicked) idx = 0;
  $("#track").innerHTML = TRACK.map(
    ([k, t, d], i) => `<li class="${i < idx ? "is-done" : i === idx ? "is-now" : ""}"><span>${i < idx ? "✓" : i + 1}</span><div><b>${t}</b><p>${d}</p></div></li>`,
  ).join("");
}
async function checkStatus() {
  if (!S || !S.order) return stopPoll();
  try {
    const r = await api("/orders/" + S.order.id);
    if (!S) return;
    updateStored(r);
    if (r.status === "aprobada") {
      stopPoll();
      S.order = { ...S.order, ...r };
      setStep(3);
      burst();
    } else if (r.status === "rechazada" || r.status === "vencida") {
      stopPoll();
      $("#track").innerHTML = "";
      $("#er").innerHTML =
        r.status === "rechazada"
          ? `No pudimos verificar tu pago. ${esc(r.rejectReason || "")}<br>Escríbenos por WhatsApp si crees que es un error.`
          : "Tu pedido venció porque no recibimos el comprobante a tiempo. Puedes hacer uno nuevo.";
    } else renderTrack(r.status);
  } catch {}
}
function updateStored(r) {
  const all = myOrders();
  const o = all.find((x) => x.id === r.id);
  if (o) {
    o.status = r.status;
    if (r.ticket) o.ticket = r.ticket;
    store.set("st_orders", all);
  }
}

/* Paso 4 */
function stepDone() {
  const o = S.order,
    p = S.p;
  body.innerHTML = `
    <div class="done">
      <svg class="ok" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg>
      <h3>¡Pago verificado, ${esc(S.buyer.n.split(" ")[0])}!</h3>
      <p class="msg">${p.type === "show" ? "Tu entrada" : "Tu confirmación"} ya está en tu WhatsApp. También la tienes aquí:</p>
    </div>
    <div class="ticket-mini">
      <img src="/api/tickets/${esc(o.ticket.code)}/qr.png" alt="QR de ${esc(o.ticket.code)}" width="150" height="150">
      <div><small>Código</small><strong>${esc(o.ticket.code)}</strong><p>${S.qty} ${unitOf(p, S.qty)} · ${esc(p.t)}</p><a class="btn sm" href="${esc(o.ticket.url)}" target="_blank" rel="noopener">Ver ${p.type === "show" ? "entrada" : "comprobante"}</a></div>
    </div>`;
}

/* ---------- Mis compras ---------- */
const ST_NAME = { nueva: "Falta escribir al WhatsApp", esperando_pago: "Esperando tu pago", en_revision: "Verificando tu comprobante", aprobada: "¡Confirmada!", rechazada: "Pago no verificado", vencida: "Vencida" };
async function openOrders(opener) {
  renderOrders();
  openLayer($("#tk"), opener);
  await ready;
  if (!ONLINE) return;
  await Promise.all(myOrders().filter((o) => !o.offline && o.status !== "aprobada" && o.status !== "vencida").map((o) => api("/orders/" + o.id).then(updateStored).catch(() => {})));
  renderOrders();
}
$("#openOrders").onclick = (ev) => openOrders(ev.currentTarget);
function renderOrders() {
  const all = myOrders();
  if (!all.length) {
    $("#tkList").innerHTML = `<div class="empty-tk"><p>Aún no tienes compras en este dispositivo.</p><button class="btn" type="button" data-buy="obra">Comprar entradas</button></div>`;
    return;
  }
  $("#tkList").innerHTML =
    all
      .map((o) => {
        const p = PRODUCTS[o.product];
        const f = p.funciones?.find((x) => x.id === o.funcion);
        const act =
          o.status === "aprobada" && o.ticket
            ? `<a class="btn sm" href="${esc(o.ticket.url)}" target="_blank" rel="noopener">Ver ${p.type === "show" ? "entrada" : "comprobante"}</a>`
            : o.status === "nueva" || o.status === "esperando_pago" || o.offline
              ? `<a class="btn wa sm" href="${esc(o.waLink)}" target="_blank" rel="noopener">Abrir WhatsApp</a>`
              : "";
        return `<article class="oitem" style="--g:${grad(p.c)}"><div><small>${esc(o.id)}</small><h3>${esc(p.t)}</h3><p>${o.qty} ${unitOf(p, o.qty)}${f ? " · " + esc(fLong(f)) : ""} · ${bs(o.amount)}</p><span class="pill s-${esc(o.status)}">${esc(o.offline ? "Pedido enviado por WhatsApp" : ST_NAME[o.status] || o.status)}</span></div>${act}</article>`;
      })
      .join("") + `<p class="msg tiny">Tus compras se guardan en este dispositivo. Tu entrada también llega a tu WhatsApp.</p>`;
}

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
    : `<video src="${esc(v.src)}" poster="${esc(v.poster)}" controls autoplay playsinline></video>`;
  const vid = $("#player video");
  if (vid) vid.onerror = () => ($("#player").innerHTML = `<div class="v-err"><p>No pudimos cargar este video.</p><a class="btn ghost sm" href="${esc(v.src)}" target="_blank" rel="noopener">Abrir en otra pestaña</a></div>`);
  const p = v.product && PRODUCTS[v.product];
  $("#vbar").innerHTML = `<div><small>${esc(v.tag)}</small><h3>${esc(v.t)}</h3></div>${p && p.price ? `<button class="btn sm" type="button" id="vbuy">${p.type === "show" ? "Comprar entradas" : "Comprar el libro"}</button>` : ""}`;
  if (p && p.price) $("#vbuy").onclick = (e) => (e.stopPropagation(), closeLayer($("#vo")), openCheckout(p.id));
  openLayer($("#vo"), opener, () => ($("#player").innerHTML = ""));
}

/* ---------- confeti ---------- */
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

/* ---------- inicio ---------- */
$("#yr").textContent = new Date().getFullYear();
$("#waFoot").href = waLink("Hola, tengo una consulta");
renderHero();
renderTrio();
renderObra();
renderLibro();
renderPodcast();
renderVideos();
renderGallery();
updateCount();
document.addEventListener("click", (ev) => {
  const w = ev.target.closest("#waBtn");
  if (w) w.dataset.clicked = "1";
});
ready.then(async () => {
  if (!ONLINE) $("#modeBadge").textContent = "· Sin servidor: los pedidos se envían directo por WhatsApp.";
  else
    try {
      renderObra(await api("/availability"));
    } catch {}
  /* enlace directo desde redes: ?p=obra o ?p=libro abre la compra; ?p=podcast va a la sección */
  const p = params.get("p");
  if (p === "podcast") $("#podcast").scrollIntoView();
  else if (PRODUCTS[p]?.price) openCheckout(p);
});
