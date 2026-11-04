/* =====================================================================
   SOTIRIA Tickets — lógica de la página
   ===================================================================== */
const { CATEGORIES, VENUES, EVENTS, VIDEOS, GALLERY, CONTACT } = DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bs = (n) => "Bs " + (Math.round(n * 100) / 100).toLocaleString("es-BO");
const evDate = (e) => new Date(`${e.d}T${e.h}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtLong = (e) => cap(evDate(e).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long" })) + " · " + e.h;
const dayMon = (e) => {
  const d = evDate(e);
  return { day: d.getDate(), mon: d.toLocaleDateString("es-BO", { month: "short" }).replace(".", ""), wd: d.toLocaleDateString("es-BO", { weekday: "short" }).replace(".", "") };
};
const venueOf = (e) => VENUES.find((v) => v.id === e.venue);
const minPrice = (e) => Math.min(...e.zones.map((z) => z.p));
const grad = (c) => `linear-gradient(135deg, ${c[0]}, ${c[1]})`;
const eventColors = (e) => venueOf(e)?.c || ["#ff4f6d", "#8b6cff"];
/* si una imagen falla, queda el degradado del fondo */
const img = (src, alt, cls = "") => `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" onerror="this.remove()">`;

function qrSVG(text, label) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: label || "Código QR" });
}
function qrDataURL(text) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createDataURL(8, 4);
}

const now = new Date();
const UPCOMING = EVENTS.filter((e) => evDate(e) > now).sort((a, b) => evDate(a) - evDate(b));

/* ---------------- almacenamiento local de entradas ---------------- */
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
const myTickets = () => store.get("st_tickets", []);
function saveTicket(t) {
  const all = myTickets().filter((x) => x.code !== t.code);
  all.unshift(t);
  store.set("st_tickets", all);
  updateCount();
}
function updateCount() {
  const n = myTickets().length;
  const el = $("#tkCount");
  el.textContent = n;
  el.hidden = !n;
}

/* =====================================================================
   RENDER DEL CATÁLOGO
   ===================================================================== */
const F = { q: "", cat: "all", venue: "all", date: "all", sort: "date" };

function renderStats() {
  $("#stats").innerHTML = `
    <li><b>${UPCOMING.length}</b><span>funciones</span></li>
    <li><b>${VENUES.length}</b><span>teatros y salas</span></li>
    <li><b>QR</b><span>pago al instante</span></li>`;
}

/* Carrusel de destacados */
let featIdx = 0,
  featTimer;
function renderFeature() {
  const list = UPCOMING.filter((e) => e.featured);
  const items = list.length ? list : UPCOMING.slice(0, 3);
  if (!items.length) return ($("#feature").hidden = true);
  const e = items[featIdx % items.length];
  const v = venueOf(e);
  $("#feature").innerHTML = `
    <article class="feat-card" style="--g:${grad(eventColors(e))}">
      <div class="feat-img">${img(e.img, e.t)}<span class="badge">${CATEGORIES[e.cat].i} ${CATEGORIES[e.cat].n}</span></div>
      <div class="feat-body">
        <small>Destacado · ${esc(v.n)}</small>
        <h3>${esc(e.t)}</h3>
        <p>${esc(fmtLong(e))}</p>
        <div class="cd" data-cd="${e.d}T${e.h}"></div>
        <div class="feat-foot"><span>desde <b>${bs(minPrice(e))}</b></span><button class="btn" type="button" data-buy="${e.id}">Comprar</button></div>
      </div>
    </article>
    <div class="dots" role="tablist" aria-label="Eventos destacados">${items
      .map((x, i) => `<button type="button" role="tab" aria-label="${esc(x.t)}" aria-selected="${i === featIdx % items.length}" data-feat="${i}"></button>`)
      .join("")}</div>`;
  tickCountdowns();
  clearTimeout(featTimer);
  featTimer = setTimeout(() => {
    featIdx++;
    renderFeature();
  }, 7000);
}
$("#feature").addEventListener("click", (ev) => {
  const d = ev.target.closest("[data-feat]");
  if (d) {
    featIdx = +d.dataset.feat;
    renderFeature();
  }
});

function tickCountdowns() {
  $$("[data-cd]").forEach((el) => {
    const ms = new Date(el.dataset.cd) - new Date();
    if (ms <= 0) return (el.textContent = "¡Es hoy!");
    const d = Math.floor(ms / 864e5),
      h = Math.floor(ms / 36e5) % 24,
      m = Math.floor(ms / 6e4) % 60;
    el.innerHTML = `<span><b>${d}</b>días</span><span><b>${String(h).padStart(2, "0")}</b>horas</span><span><b>${String(m).padStart(2, "0")}</b>min</span>`;
  });
}
setInterval(tickCountdowns, 30000);

function renderChips() {
  const counts = {};
  UPCOMING.forEach((e) => (counts[e.cat] = (counts[e.cat] || 0) + 1));
  const chips = [["all", "Todo", "✦", UPCOMING.length], ...Object.entries(CATEGORIES).filter(([k]) => counts[k]).map(([k, c]) => [k, c.n, c.i, counts[k]])];
  $("#chips").innerHTML = chips
    .map(([k, n, i, c]) => `<button type="button" class="chip${F.cat === k ? " on" : ""}" data-cat="${k}" aria-pressed="${F.cat === k}"><span aria-hidden="true">${i}</span>${esc(n)}<small>${c}</small></button>`)
    .join("");
}

function renderVenueFilter() {
  $("#fVenue").innerHTML =
    `<option value="all">Todos los teatros</option>` + VENUES.map((v) => `<option value="${v.id}">${esc(v.n)}</option>`).join("");
}

function matchesDate(e) {
  const t = evDate(e),
    day = 864e5;
  if (F.date === "week") return t - now <= 7 * day;
  if (F.date === "month") return t - now <= 30 * day;
  if (F.date === "weekend") {
    const fri = new Date(now);
    fri.setHours(0, 0, 0, 0);
    const wd = now.getDay(); // 0 = domingo … 6 = sábado
    fri.setDate(fri.getDate() + (wd === 6 ? -1 : wd === 0 ? -2 : 5 - wd));
    const mon = new Date(fri.getTime() + 3 * day);
    return t >= fri && t < mon;
  }
  return true;
}

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function filtered() {
  const q = norm(F.q.trim());
  let list = UPCOMING.filter(
    (e) =>
      (F.cat === "all" || e.cat === F.cat) &&
      (F.venue === "all" || e.venue === F.venue) &&
      matchesDate(e) &&
      (!q || norm([e.t, e.s, venueOf(e).n, CATEGORIES[e.cat].n].join(" ")).includes(q)),
  );
  if (F.sort === "price") list = [...list].sort((a, b) => minPrice(a) - minPrice(b));
  if (F.sort === "name") list = [...list].sort((a, b) => a.t.localeCompare(b.t, "es"));
  return list;
}

function eventCard(e) {
  const v = venueOf(e),
    dm = dayMon(e);
  return `
  <article class="ev" style="--g:${grad(eventColors(e))}">
    <button class="ev-hit" type="button" data-buy="${e.id}" aria-label="Ver entradas para ${esc(e.t)}"></button>
    <div class="ev-img">${img(e.img, "")}
      <span class="date"><b>${dm.day}</b>${esc(dm.mon)}</span>
      <span class="badge">${CATEGORIES[e.cat].i} ${esc(CATEGORIES[e.cat].n)}</span>
    </div>
    <div class="ev-body">
      <p class="ev-venue">${esc(v.n)}${v.own ? ' <span class="own">Sala propia</span>' : ""}</p>
      <h3>${esc(e.t)}</h3>
      <p class="ev-meta">${esc(dm.wd)} ${dm.day} ${esc(dm.mon)} · ${e.h} · ${esc(e.age)}</p>
      <p class="ev-desc">${esc(e.s)}</p>
      <div class="ev-foot"><span>desde <b>${bs(minPrice(e))}</b></span><span class="btn sm">Entradas</span></div>
    </div>
  </article>`;
}

function renderEvents() {
  const list = filtered();
  $("#events").innerHTML = list.map(eventCard).join("");
  $("#empty").hidden = !!list.length;
  const parts = [];
  if (F.cat !== "all") parts.push(CATEGORIES[F.cat].n);
  if (F.venue !== "all") parts.push(VENUES.find((v) => v.id === F.venue).n);
  if (F.q) parts.push(`“${F.q}”`);
  $("#resultsLabel").textContent =
    `${list.length} ${list.length === 1 ? "función" : "funciones"}` + (parts.length ? " · " + parts.join(" · ") : " disponibles");
}

function renderVenues() {
  $("#venues").innerHTML = VENUES.map((v) => {
    const n = UPCOMING.filter((e) => e.venue === v.id).length;
    return `
    <article class="venue" style="--g:${grad(v.c)}">
      <div class="venue-img">${img(v.img, "")}</div>
      <div class="venue-body">
        <h3>${esc(v.n)}</h3>
        <p>${esc(v.addr)}<br>Capacidad: ${v.cap.toLocaleString("es-BO")} personas</p>
        <button class="link" type="button" data-venue="${v.id}">${n} ${n === 1 ? "función" : "funciones"} →</button>
      </div>
    </article>`;
  }).join("");
}

function renderVideos() {
  $("#vids").innerHTML = VIDEOS.map(
    (v, i) => `
    <button class="vid" type="button" data-vid="${i}" style="--g:${grad(v.event ? eventColors(EVENTS.find((e) => e.id === v.event)) : ["#ff4f6d", "#8b6cff"])}">
      ${img(v.poster, "")}
      <span class="play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
      <span class="vid-txt"><small>${esc(v.tag)}</small>${esc(v.t)}</span>
    </button>`,
  ).join("");
}

function renderGallery() {
  $("#gal").innerHTML = GALLERY.map(
    (p, i) => `
    <figure class="g-item gi${i + 1}">
      ${img(p.src, p.alt)}
      <figcaption><small>${esc(p.tag)}</small>${esc(p.title)}</figcaption>
    </figure>`,
  ).join("");
}

/* ---------------- eventos de filtros ---------------- */
function applyFilters(scroll) {
  renderChips();
  renderEvents();
  if (scroll) $("#eventos").scrollIntoView({ behavior: "smooth" });
}
$("#chips").addEventListener("click", (ev) => {
  const c = ev.target.closest("[data-cat]");
  if (!c) return;
  F.cat = c.dataset.cat;
  applyFilters();
});
$("#fVenue").onchange = (ev) => ((F.venue = ev.target.value), applyFilters());
$("#fDate").onchange = (ev) => ((F.date = ev.target.value), applyFilters());
$("#fSort").onchange = (ev) => ((F.sort = ev.target.value), applyFilters());
$("#search").onsubmit = (ev) => {
  ev.preventDefault();
  F.q = $("#q").value;
  applyFilters(true);
};
$("#q").addEventListener("input", (ev) => {
  F.q = ev.target.value;
  renderEvents();
});
$("#clearFilters").onclick = () => {
  Object.assign(F, { q: "", cat: "all", venue: "all", date: "all" });
  $("#q").value = "";
  $("#fVenue").value = "all";
  $("#fDate").value = "all";
  applyFilters();
};
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-buy]");
  if (b) return openCheckout(+b.dataset.buy, b);
  const v = ev.target.closest("[data-venue]");
  if (v) {
    F.venue = v.dataset.venue;
    $("#fVenue").value = F.venue;
    applyFilters(true);
  }
  const vid = ev.target.closest("[data-vid]");
  if (vid) openVideo(+vid.dataset.vid, vid);
});

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
let S = null; // estado de la compra en curso
let pollTimer = null,
  expTimer = null;
const stopTimers = () => (clearInterval(pollTimer), clearInterval(expTimer));
const body = $("#mbody");

function openCheckout(id, opener) {
  const ev = EVENTS.find((e) => e.id === id);
  if (!ev) return;
  stopTimers();
  S = { ev, zone: null, qty: 1, step: 0, pay: "qr", buyer: store.get("st_buyer", {}), avail: null, order: null };
  const v = venueOf(ev);
  $(".modal", $("#ov")).style.setProperty("--g", grad(eventColors(ev)));
  $("#mhead").innerHTML = `
    <div class="m-img">${img(ev.img, "")}</div>
    <div><small>${CATEGORIES[ev.cat].i} ${esc(CATEGORIES[ev.cat].n)} · ${esc(v.n)}</small><h2 id="mt">${esc(ev.t)}</h2><p>${esc(fmtLong(ev))}</p></div>`;
  openLayer($("#ov"), opener, () => {
    stopTimers();
    S = null;
  });
  draw();
  Payments.availability(id).then((a) => {
    if (!S || S.ev.id !== id) return;
    S.avail = a;
    S.zone = ev.zones.find((z) => a[z.id] > 0)?.id || null;
    if (S.step === 0) draw();
  });
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
  [stepZones, stepBuyer, stepPay, stepDone][S.step]();
}

const total = () => (S.zone ? S.ev.zones.find((z) => z.id === S.zone).p * S.qty : 0);
const zoneName = () => S.ev.zones.find((z) => z.id === S.zone)?.n || "";

/* Paso 1: zona y cantidad */
function stepZones() {
  const e = S.ev,
    v = venueOf(e);
  if (!S.avail) {
    body.innerHTML = `<p class="about">${esc(e.long || e.s)}</p><div class="loading">Consultando disponibilidad…</div>`;
    return;
  }
  const soldOut = e.zones.every((z) => !S.avail[z.id]);
  body.innerHTML = `
    <p class="about">${esc(e.long || e.s)}</p>
    <ul class="facts"><li><b>Lugar</b>${esc(v.n)} — ${esc(v.addr)}</li><li><b>Duración</b>${esc(e.dur)}</li><li><b>Edad</b>${esc(e.age)}</li></ul>
    <fieldset class="zones"><legend>Elige tu zona</legend>
      ${e.zones
        .map((z) => {
          const left = S.avail[z.id];
          const note = !left ? "Agotado" : left <= 20 ? `¡Quedan ${left}!` : "Disponible";
          return `<label class="zone${!left ? " off" : ""}">
            <input type="radio" name="zone" value="${z.id}" ${S.zone === z.id ? "checked" : ""} ${!left ? "disabled" : ""}>
            <span class="z-n">${esc(z.n)}</span><span class="z-s${left && left <= 20 ? " hot" : ""}">${note}</span><span class="z-p">${bs(z.p)}</span>
          </label>`;
        })
        .join("")}
    </fieldset>
    ${
      soldOut
        ? `<p class="error">Esta función está agotada.</p>`
        : `<div class="qty-row"><span>Cantidad</span><div class="qty"><button type="button" id="qm" aria-label="Quitar una">−</button><output id="qv" aria-live="polite">${S.qty}</output><button type="button" id="qp" aria-label="Agregar una">+</button></div></div>`
    }
    <div class="summary"><span>Total</span><b id="tt">${bs(total())}</b></div>
    <div class="nav"><span></span><button class="btn" id="nx" type="button" ${soldOut ? "disabled" : ""}>Continuar</button></div>`;
  if (soldOut) return;
  const maxQty = () => Math.min(10, S.avail[S.zone] || 0);
  const upd = () => {
    S.qty = Math.max(1, Math.min(S.qty, maxQty()));
    $("#qv").textContent = S.qty;
    $("#tt").textContent = bs(total());
    $("#qm").disabled = S.qty <= 1;
    $("#qp").disabled = S.qty >= maxQty();
  };
  $$('input[name="zone"]', body).forEach((r) => (r.onchange = () => ((S.zone = r.value), upd())));
  $("#qm").onclick = () => (S.qty--, upd());
  $("#qp").onclick = () => (S.qty++, upd());
  upd();
  $("#nx").onclick = () => setStep(1);
}

/* Paso 2: datos del comprador */
function stepBuyer() {
  const u = S.buyer;
  body.innerHTML = `
    <form id="bf" novalidate>
      <label for="bn">Nombre completo</label><input id="bn" autocomplete="name" value="${esc(u.n)}" required>
      <div class="row"><div><label for="bci">CI / Documento</label><input id="bci" inputmode="numeric" value="${esc(u.ci)}" required></div>
      <div><label for="btel">Celular</label><input id="btel" type="tel" autocomplete="tel" placeholder="7XXXXXXX" value="${esc(u.tel)}" required></div></div>
      <label for="bem">Correo (te enviaremos la entrada)</label><input id="bem" type="email" autocomplete="email" value="${esc(u.em)}" required>
      <p class="error" id="er" role="alert"></p>
      <div class="summary"><span>${S.qty} × ${esc(zoneName())}</span><b>${bs(total())}</b></div>
      <div class="nav"><button class="btn ghost" id="bk" type="button">Atrás</button><button class="btn" type="submit">Ir a pagar</button></div>
    </form>`;
  $("#bk").onclick = () => setStep(0);
  $("#bf").onsubmit = (ev) => {
    ev.preventDefault();
    const v = { n: $("#bn").value.trim(), ci: $("#bci").value.trim(), tel: $("#btel").value.replace(/\s/g, ""), em: $("#bem").value.trim() };
    const bad = [];
    if (v.n.length < 3) bad.push("bn");
    if (!/^\d{5,}[A-Za-z0-9-]*$/.test(v.ci)) bad.push("bci");
    if (!/^\+?\d{7,}$/.test(v.tel)) bad.push("btel");
    if (!/^\S+@\S+\.\S+$/.test(v.em)) bad.push("bem");
    ["bn", "bci", "btel", "bem"].forEach((k) => {
      $("#" + k).classList.toggle("err", bad.includes(k));
      $("#" + k).setAttribute("aria-invalid", bad.includes(k));
    });
    if (bad.length) {
      $("#er").textContent = "Revisa los campos marcados.";
      $("#" + bad[0]).focus();
      return;
    }
    S.buyer = v;
    store.set("st_buyer", v);
    S.order = null;
    setStep(2);
  };
}

/* Paso 3: pago */
function stepPay() {
  stopTimers();
  body.innerHTML = `
    <div class="summary"><span>${S.qty} × ${esc(zoneName())}</span><b>${bs(total())}</b></div>
    <div class="tabs" role="tablist">
      <button type="button" role="tab" data-m="qr" aria-selected="${S.pay === "qr"}">${icon("qr")} Pagar con QR</button>
      <button type="button" role="tab" data-m="card" aria-selected="${S.pay === "card"}">${icon("card")} Tarjeta</button>
    </div>
    <div id="pm"></div>
    <p class="error" id="er" role="alert"></p>
    <div class="nav" id="pnav"><button class="btn ghost" id="bk" type="button">Atrás</button><span></span></div>`;
  $$(".tabs button", body).forEach(
    (b) =>
      (b.onclick = () => {
        if (S.pay === b.dataset.m) return;
        S.pay = b.dataset.m;
        S.order = null;
        stepPay();
      }),
  );
  $("#bk").onclick = () => (stopTimers(), setStep(1));
  S.pay === "qr" ? payQR() : payCard();
}

function icon(n) {
  if (n === "qr")
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3zM14 19h2M19 14h2"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>`;
}

async function payQR() {
  const pm = $("#pm");
  pm.innerHTML = `<div class="loading">Generando tu QR de pago…</div>`;
  try {
    if (!S.order || S.order.method === "card" || Date.now() > S.order.qr?.expiresAt) {
      const o = await Payments.createOrder({ eventId: S.ev.id, zone: S.zone, qty: S.qty, buyer: S.buyer, method: "qr" });
      if (!S) return;
      S.order = { ...o, method: "qr" };
    }
  } catch (e) {
    pm.innerHTML = "";
    $("#er").textContent = e.message;
    return;
  }
  const o = S.order;
  const qrImg = o.qr.image ? `<img src="${esc(o.qr.image)}" alt="Código QR de pago">` : qrSVG(o.qr.payload, "Código QR de pago");
  const dl = o.qr.image || qrDataURL(o.qr.payload);
  pm.innerHTML = `
    <div class="qrpay">
      <div class="qr-frame">${qrImg}<i class="scan"></i></div>
      <div class="qr-info">
        <p class="status" id="qst"><span class="dot"></span>Esperando tu pago</p>
        <p class="amount">${bs(o.amount)}</p>
        <ol class="howto"><li>Abre la app de tu banco.</li><li>Elige <b>Pagar con QR</b> y escanea este código.</li><li>Confirma el pago. Te daremos tu entrada al instante.</li></ol>
        <p class="exp">El QR vence en <b id="qexp">--:--</b></p>
        <a class="btn ghost sm" href="${esc(dl)}" download="QR-${esc(o.id)}.png">Descargar QR</a>
        <p class="msg tiny">¿Compras desde el celular? Descarga el QR y súbelo desde la app de tu banco.</p>
        <p class="msg tiny">Orden <b>${esc(o.id)}</b></p>
      </div>
    </div>`;
  if (Payments.canSimulate) {
    $("#pnav span").outerHTML = `<button class="btn" id="sim" type="button" title="Solo para pruebas">Simular pago recibido</button>`;
    $("#sim").onclick = async () => {
      $("#sim").disabled = true;
      try {
        const r = await Payments.simulatePaid(o.id);
        handleStatus(r);
      } catch (e) {
        $("#er").textContent = e.message;
        $("#sim").disabled = false;
      }
    };
  }
  const exp = () => {
    const ms = o.qr.expiresAt - Date.now();
    if (ms <= 0) {
      stopTimers();
      $("#qst").innerHTML = "QR vencido";
      $("#qst").className = "status bad";
      $(".qrpay").classList.add("expired");
      $("#pnav").lastElementChild.outerHTML = `<button class="btn" id="renew" type="button">Generar nuevo QR</button>`;
      $("#renew").onclick = () => ((S.order = null), stepPay());
      return;
    }
    $("#qexp").textContent = `${Math.floor(ms / 6e4)}:${String(Math.floor(ms / 1e3) % 60).padStart(2, "0")}`;
  };
  exp();
  expTimer = setInterval(exp, 1000);
  pollTimer = setInterval(async () => {
    try {
      handleStatus(await Payments.status(o.id));
    } catch {}
  }, PAY_CONFIG.pollMs);
}

function handleStatus(r) {
  if (!S || !r) return;
  if (r.status === "paid" && r.ticket) {
    stopTimers();
    finish(r.ticket);
  } else if (r.status === "failed") {
    stopTimers();
    $("#er").textContent = "El pago fue rechazado. Intenta de nuevo.";
    S.order = null;
  }
}

function payCard() {
  $("#pm").innerHTML = `
    <form id="cf" novalidate>
      <div class="cc" id="cc"><div class="cc-f"><i class="cc-chip"></i><div class="cc-num" id="pn">•••• •••• •••• ••••</div><div class="cc-r"><span id="ph">NOMBRE APELLIDO</span><span id="pe">MM/AA</span></div></div><div class="cc-b"><i></i><span>CVV <b id="pc">•••</b></span></div></div>
      <label for="cn">Número de tarjeta</label><input id="cn" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" autocomplete="cc-number">
      <label for="ch">Nombre en la tarjeta</label><input id="ch" autocomplete="cc-name">
      <div class="row"><div><label for="ex">Vence</label><input id="ex" inputmode="numeric" maxlength="5" placeholder="MM/AA" autocomplete="cc-exp"></div>
      <div><label for="cv">CVV</label><input id="cv" inputmode="numeric" maxlength="4" autocomplete="cc-csc"></div></div>
      <p class="msg tiny">🔒 Los datos de tu tarjeta no se guardan en esta página.</p>
      <button type="submit" hidden></button>
    </form>`;
  $("#pnav span").outerHTML = `<button class="btn" id="paycard" type="button">Pagar ${bs(total())}</button>`;
  const cn = $("#cn"),
    ex = $("#ex");
  cn.oninput = () => (cn.value = cn.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "));
  ex.oninput = () => {
    const v = ex.value.replace(/\D/g, "").slice(0, 4);
    ex.value = v.length > 2 ? v.slice(0, 2) + "/" + v.slice(2) : v;
  };
  const up = () => {
    $("#pn").textContent = cn.value.replace(/\D/g, "").padEnd(16, "•").replace(/(.{4})(?=.)/g, "$1 ");
    $("#ph").textContent = $("#ch").value.toUpperCase() || "NOMBRE APELLIDO";
    $("#pe").textContent = ex.value || "MM/AA";
    $("#pc").textContent = $("#cv").value.replace(/./g, "•") || "•••";
  };
  ["cn", "ch", "ex", "cv"].forEach((k) => {
    $("#" + k).addEventListener("input", up);
    $("#" + k).addEventListener("focus", () => $("#cc").classList.toggle("flip", k === "cv"));
  });
  const go = async () => {
    const n = cn.value.replace(/\s/g, ""),
      e = ex.value,
      cv = $("#cv").value;
    const [mm, yy] = e.split("/").map(Number);
    const expired = !mm || new Date(2000 + yy, mm) <= new Date();
    if (!luhn(n) || $("#ch").value.trim().length < 3 || !/^(0[1-9]|1[0-2])\/\d\d$/.test(e) || expired || !/^\d{3,4}$/.test(cv)) {
      $("#er").textContent = "Revisa los datos de la tarjeta.";
      return;
    }
    $("#er").textContent = "";
    const btn = $("#paycard");
    btn.disabled = true;
    btn.textContent = "Procesando…";
    try {
      const o = await Payments.createOrder({ eventId: S.ev.id, zone: S.zone, qty: S.qty, buyer: S.buyer, method: "card" });
      const r = await Payments.payCard(o.id, { number: n, name: $("#ch").value.trim(), exp: e });
      if (r.status === "paid") return finish(r.ticket);
      throw new Error("El pago fue rechazado.");
    } catch (err) {
      if (!S) return;
      $("#er").textContent = err.message;
      btn.disabled = false;
      btn.textContent = `Pagar ${bs(total())}`;
    }
  };
  $("#paycard").onclick = go;
  $("#cf").onsubmit = (ev) => (ev.preventDefault(), go());
}

function luhn(n) {
  if (!/^\d{13,19}$/.test(n)) return false;
  let s = 0,
    d = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let x = +n[i];
    if (d && (x *= 2) > 9) x -= 9;
    s += x;
    d = !d;
  }
  return s % 10 === 0;
}

function finish(ticket) {
  saveTicket(ticket);
  S.ticket = ticket;
  setStep(3);
  burst();
}

/* Paso 4: entrada emitida */
function stepDone() {
  const t = S.ticket;
  body.innerHTML = `
    <div class="done">
      <svg class="ok" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg>
      <h3>¡Listo, ${esc(t.buyer.n.split(" ")[0])}! Tu entrada está confirmada.</h3>
      <p class="msg">Guardamos tu entrada en <b>Mis entradas</b> y te la enviaremos a ${esc(t.buyer.em)}.</p>
    </div>
    ${ticketHTML(t)}
    <div class="nav"><button class="btn ghost" type="button" data-print="${esc(t.code)}">Imprimir / PDF</button><button class="btn" id="seeTk" type="button">Ver mis entradas</button></div>`;
  $("#seeTk").onclick = () => {
    closeLayer($("#ov"));
    openTickets();
  };
}

/* ---------------- entradas ---------------- */
function ticketHTML(t) {
  const e = EVENTS.find((x) => x.id === t.eventId);
  if (!e) return "";
  const v = venueOf(e);
  const z = e.zones.find((z) => z.id === t.zone);
  return `
  <div class="ticket" style="--g:${grad(eventColors(e))}">
    <div class="t-main">
      <small>${esc(v.n)}</small>
      <h4>${esc(e.t)}</h4>
      <p>${esc(fmtLong(e))}</p>
      <dl><div><dt>Zona</dt><dd>${esc(z ? z.n : t.zone)}</dd></div><div><dt>Entradas</dt><dd>${t.qty}</dd></div><div><dt>Total</dt><dd>${bs(t.amount)}</dd></div></dl>
      <p class="t-who">${esc(t.buyer.n)} · CI ${esc(t.buyer.ci)}</p>
    </div>
    <div class="t-stub">
      <div class="t-qr">${qrSVG(t.code, "QR de la entrada " + t.code)}</div>
      <strong>${esc(t.code)}</strong>
      <small>${t.method === "qr" ? "Pagado con QR" : "Pagado con tarjeta"}</small>
    </div>
  </div>`;
}

function openTickets(opener) {
  renderTickets();
  openLayer($("#tk"), opener);
}
$("#openTickets").onclick = (ev) => openTickets(ev.currentTarget);

function renderTickets() {
  const all = myTickets();
  if (!all.length) {
    $("#tkList").innerHTML = `<div class="empty-tk"><p>Aún no tienes entradas.</p><a class="btn" href="#eventos" id="goEv">Ver funciones</a></div>`;
    $("#goEv").onclick = () => closeLayer($("#tk"));
    return;
  }
  const up = all.filter((t) => {
    const e = EVENTS.find((x) => x.id === t.eventId);
    return e && evDate(e) > new Date(Date.now() - 6 * 36e5);
  });
  const past = all.filter((t) => !up.includes(t));
  $("#tkList").innerHTML =
    (up.length ? `<h3 class="tk-h">Próximas</h3>` + up.map((t) => ticketHTML(t) + `<div class="tk-act"><button class="link" type="button" data-print="${esc(t.code)}">Imprimir / guardar PDF</button></div>`).join("") : "") +
    (past.length ? `<h3 class="tk-h">Pasadas</h3><div class="past">${past.map(ticketHTML).join("")}</div>` : "") +
    `<p class="msg tiny">Las entradas se guardan en este dispositivo. Tu correo también recibe una copia.</p>`;
}

document.addEventListener("click", (ev) => {
  const p = ev.target.closest("[data-print]");
  if (!p) return;
  const t = myTickets().find((x) => x.code === p.dataset.print);
  if (!t) return;
  $("#printArea").innerHTML = ticketHTML(t);
  window.print();
});

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
  if (vid)
    vid.onerror = () =>
      ($("#player").innerHTML = `<div class="v-err"><p>No pudimos cargar este video.</p><a class="btn ghost sm" href="${esc(v.src)}" target="_blank" rel="noopener">Abrir en otra pestaña</a></div>`);
  const ev = v.event && UPCOMING.find((e) => e.id === v.event);
  $("#vbar").innerHTML = `<div><small>${esc(v.tag)}</small><h3>${esc(v.t)}</h3></div>${ev ? `<button class="btn sm" type="button" data-buy="${ev.id}" id="vbuy">Entradas para ${esc(ev.t)}</button>` : ""}`;
  if (ev) $("#vbuy").onclick = (e) => (e.stopPropagation(), closeLayer($("#vo")), openCheckout(ev.id));
  openLayer($("#vo"), opener, () => ($("#player").innerHTML = ""));
}

/* =====================================================================
   VENDE CON NOSOTROS → WhatsApp
   ===================================================================== */
$("#sellMail").href = "mailto:" + CONTACT.email;
$("#sellMail").textContent = CONTACT.email;
$("#sellForm").onsubmit = (ev) => {
  ev.preventDefault();
  const f = { v: $("#sv").value.trim(), n: $("#sn").value.trim(), t: $("#st").value.trim(), m: $("#sm").value.trim() };
  const bad = [["sv", f.v.length < 2], ["sn", f.n.length < 2], ["st", !/^\+?[\d\s]{7,}$/.test(f.t)]];
  bad.forEach(([k, b]) => $("#" + k).classList.toggle("err", b));
  if (bad.some(([, b]) => b)) return ($("#sellErr").textContent = "Completa los campos marcados.");
  $("#sellErr").textContent = "";
  const text = `Hola, quiero vender entradas con SOTIRIA Tickets.\n\nEspacio: ${f.v}\nNombre: ${f.n}\nCelular: ${f.t}${f.m ? "\nEventos: " + f.m : ""}`;
  window.open(`https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
};

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
renderStats();
renderFeature();
renderChips();
renderVenueFilter();
renderEvents();
renderVenues();
renderVideos();
renderGallery();
updateCount();
Payments.init().then((m) => {
  if (m === "demo") $("#modeBadge").textContent = "· Modo demostración: los pagos son simulados.";
});
