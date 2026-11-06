/* =====================================================================
   SERVIDOR SOTIRIA  (Node 18+, sin dependencias)
   ---------------------------------------------------------------------
   Ejecutar:   node server/server.js      → http://localhost:3000
               Panel:                      → http://localhost:3000/panel/

   Flujo de compra:
   1. El cliente elige en la web y se crea una orden (estado "nueva").
   2. Escribe al WhatsApp con su código de orden → el sistema responde
      solo con el QR de cobro del monto exacto ("esperando_pago").
   3. Envía la foto o PDF del comprobante → aparece en el panel
      ("en_revision").
   4. El validador lo revisa y pulsa Aprobar → se genera la entrada única
      y se envía sola a ese chat ("aprobada").

   Variables de entorno:
     PORT               puerto (3000)
     ADMIN_PASSWORD     contraseña del panel (¡cámbiala!)
     PUBLIC_URL         dirección pública, p. ej. https://sotiria.tv
     ORDER_HOLD_HOURS   horas que se reservan las entradas sin comprobante (24)
     WA_*               conexión con WhatsApp: ver server/whatsapp.js
   ===================================================================== */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const DATA = require("../js/data.js");
const WA = require("./whatsapp.js");
const { qrPNG } = require("./png.js");

const PORT = +process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");
const DIR = path.join(__dirname, "data");
const MEDIA = path.join(DIR, "media");
const QRDIR = path.join(DIR, "qr");
const DB_FILE = path.join(DIR, "db.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "sotiria";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const HOLD_MS = (+process.env.ORDER_HOLD_HOURS || 24) * 36e5;
const { PRODUCTS, CONTACT, QR_AMOUNTS } = DATA;
[DIR, MEDIA, QRDIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

/* ---------------- base de datos en archivo JSON ---------------- */
let db = { orders: {}, tickets: {}, messages: [], leads: [], qr: {}, chats: {} };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
} catch {}
let saveTimer;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE + ".tmp", JSON.stringify(db));
    fs.renameSync(DB_FILE + ".tmp", DB_FILE);
  }, 100);
};

const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rid = (p, n) => p + "-" + Array.from(crypto.randomBytes(n), (b) => ALPH[b % 32]).join("");
const now = () => new Date().toISOString();
const bs = (n) => "Bs " + n;

/* Celular boliviano → formato de WhatsApp (591 + número) */
function waNumber(tel) {
  const d = String(tel || "").replace(/\D/g, "");
  if (d.length === 8 && /^[67]/.test(d)) return "591" + d;
  return d;
}

const STATUS = {
  nueva: "Nueva (esperando que escriba al WhatsApp)",
  esperando_pago: "QR enviado, esperando pago",
  en_revision: "Comprobante por revisar",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  vencida: "Vencida",
};
const OPEN = ["nueva", "esperando_pago", "en_revision"];

function log(o, what, by = "sistema") {
  (o.history ||= []).push({ at: now(), what, by });
}

function expire(o) {
  if ((o.status === "nueva" || o.status === "esperando_pago") && Date.now() - Date.parse(o.createdAt) > HOLD_MS) {
    o.status = "vencida";
    log(o, "Venció sin comprobante");
    save();
  }
  return o;
}

/* Disponibilidad: cupo − órdenes vigentes */
function availability() {
  const used = {};
  for (const o of Object.values(db.orders)) {
    expire(o);
    if (o.status === "rechazada" || o.status === "vencida") continue;
    const k = o.product + (o.funcion ? ":" + o.funcion : "");
    used[k] = (used[k] || 0) + o.qty;
  }
  const out = {};
  for (const p of Object.values(PRODUCTS)) {
    if (p.type === "show") out[p.id] = Object.fromEntries(p.funciones.map((f) => [f.id, Math.max(0, f.cap - (used[p.id + ":" + f.id] || 0))]));
    else if (p.type === "book") out[p.id] = Math.max(0, p.cap - (used[p.id] || 0));
  }
  return out;
}

function describe(o) {
  const p = PRODUCTS[o.product];
  const f = p.funciones && p.funciones.find((x) => x.id === o.funcion);
  const when = f
    ? new Date(`${f.d}T${f.h}`).toLocaleDateString("es-BO", { weekday: "short", day: "numeric", month: "short" }) + ", " + f.h
    : "";
  return { p, f, when, unit: o.qty === 1 ? p.unit[0] : p.unit[1] };
}

/* ---------------- mensajes de WhatsApp ---------------- */
function addMessage(m) {
  const msg = { id: crypto.randomUUID(), at: now(), ...m };
  db.messages.push(msg);
  const c = (db.chats[m.wa] ||= { wa: m.wa, name: "", unread: 0, lastAt: msg.at });
  c.lastAt = msg.at;
  if (m.name) c.name = m.name;
  if (m.dir === "in") c.unread++;
  save();
  return msg;
}

async function sendText(wa, text, orderId, by = "sistema") {
  const msg = addMessage({ wa, dir: "out", type: "text", text, orderId, by });
  try {
    msg.waMsgId = (await WA.sendText(wa, text)).id;
  } catch (e) {
    msg.error = e.message;
  }
  save();
  return msg;
}

async function sendImage(wa, buffer, mime, caption, orderId, by = "sistema") {
  const file = crypto.randomUUID() + (mime === "image/png" ? ".png" : ".jpg");
  fs.writeFileSync(path.join(MEDIA, file), buffer);
  const msg = addMessage({ wa, dir: "out", type: "image", text: caption, media: file, mime, orderId, by });
  try {
    msg.waMsgId = (await WA.sendImage(wa, buffer, mime, caption)).id;
  } catch (e) {
    msg.error = e.message;
  }
  save();
  return msg;
}

function qrFor(amount) {
  const f = db.qr[amount];
  if (!f || !fs.existsSync(path.join(QRDIR, f))) return null;
  return { buffer: fs.readFileSync(path.join(QRDIR, f)), mime: f.endsWith(".png") ? "image/png" : "image/jpeg" };
}

async function sendPaymentQR(o, by) {
  const { p, when, unit } = describe(o);
  const qr = qrFor(o.amount);
  const text =
    `¡Hola ${o.buyer.n.split(" ")[0]}! 👋\n` +
    `Tu orden *${o.id}*: ${o.qty} ${unit} — ${p.t}${when ? " (" + when + ")" : ""}.\n` +
    `Total a pagar: *${bs(o.amount)}*\n\n` +
    `1️⃣ Descarga este QR y págalo desde la app de tu banco.\n` +
    `2️⃣ Envía aquí la foto o captura del comprobante.\n` +
    `3️⃣ Apenas lo verifiquemos, te llega tu ${p.type === "show" ? "entrada" : "confirmación"} a este chat. ✨`;
  if (qr) await sendImage(o.wa, qr.buffer, qr.mime, text, o.id, by);
  else {
    await sendText(o.wa, text.replace("Descarga este QR", "En un momento te enviamos el QR de pago;"), o.id, by);
    log(o, `⚠ Falta cargar el QR de ${bs(o.amount)} en el panel`);
  }
  if (o.status === "nueva") o.status = "esperando_pago";
  log(o, "QR de pago enviado por WhatsApp", by);
  save();
}

function ticketURL(code) {
  return (PUBLIC_URL || `http://localhost:${PORT}`) + "/entrada.html?c=" + code;
}

async function sendTicket(o, by) {
  const { p, when, unit } = describe(o);
  const t = o.ticket;
  const caption =
    p.type === "show"
      ? `🎟️ *¡Tu entrada está confirmada!*\n\n*${p.t}*\n📅 ${when}\n📍 ${p.venue}\n👥 ${o.qty} ${unit}\n🔑 Código: *${t.code}*\n\n` +
        `Muestra este QR en la puerta (vale para ${o.qty} ${o.qty === 1 ? "persona" : "personas"}).\nVer entrada: ${ticketURL(t.code)}`
      : `📚 *¡Tu compra está confirmada!*\n\n*${p.t}* × ${o.qty}\n🚚 ${o.deliveryName}\n🔑 Código: *${t.code}*\n\n` +
        `Guarda este QR: lo mostrarás al recibir tu libro.\nVer comprobante: ${ticketURL(t.code)}`;
  await sendImage(o.wa, qrPNG(ticketURL(t.code)), "image/png", caption, o.id, by);
}

/* Mensaje recibido de un cliente (WhatsApp real o simulador) */
async function handleIncoming(m) {
  const wa = m.from;
  let media = null;
  if (m.buffer) {
    media = crypto.randomUUID() + "." + (m.mime === "application/pdf" ? "pdf" : m.mime === "image/png" ? "png" : "jpg");
    fs.writeFileSync(path.join(MEDIA, media), m.buffer);
  }
  const prevIn = db.messages.filter((x) => x.wa === wa && x.dir === "in").pop();
  const msg = addMessage({ wa, name: m.name, dir: "in", type: media ? (m.mime === "application/pdf" ? "document" : "image") : "text", text: m.text || "", media, mime: m.mime, waMsgId: m.waMsgId });

  const code = (m.text || "").toUpperCase().match(/ORD-[A-Z0-9]{5,8}/);
  const mine = Object.values(db.orders)
    .map(expire)
    .filter((o) => o.wa === wa || (!o.wa && waNumber(o.buyer.tel) === wa))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  if (code && db.orders[code[0]] && !media) {
    const o = db.orders[code[0]];
    o.wa = wa;
    msg.orderId = o.id;
    if (o.status === "nueva" || o.status === "esperando_pago") await sendPaymentQR(o);
    else if (o.status === "aprobada") await sendTicket(o);
    else if (o.status === "en_revision") await sendText(wa, "Ya recibimos tu comprobante y lo estamos verificando. ¡Gracias por la paciencia! 🙌", o.id);
    else await sendText(wa, `Tu orden ${o.id} ya no está vigente. Puedes hacer un nuevo pedido en ${PUBLIC_URL || "nuestra página"}.`, o.id);
    save();
    return;
  }

  if (media) {
    const byCode = code && db.orders[code[0]];
    const o = byCode && OPEN.includes(byCode.status) ? byCode : mine.find((x) => OPEN.includes(x.status));
    if (o) {
      o.wa = wa;
      msg.orderId = o.id;
      (o.receipts ||= []).push(msg.id);
      const first = o.status !== "en_revision";
      o.status = "en_revision";
      log(o, "Comprobante recibido por WhatsApp", "cliente");
      if (first) await sendText(wa, "✅ ¡Recibimos tu comprobante! Lo estamos verificando y en unos minutos te enviamos tu entrada aquí mismo.", o.id);
      save();
      return;
    }
    msg.flag = "Comprobante sin orden";
    await sendText(wa, `Recibimos tu archivo, pero no encontramos una compra pendiente a este número. Si ya hiciste tu pedido, envíanos tu código de orden (empieza con ORD-).`);
    save();
    return;
  }

  /* Texto sin código: si tiene una orden abierta, lo atiende una persona desde el panel */
  const open = mine.find((x) => OPEN.includes(x.status));
  if (open) {
    msg.orderId = open.id;
    save();
    return;
  }
  const quiet = prevIn && Date.now() - Date.parse(prevIn.at) < 12 * 36e5;
  if (!quiet)
    await sendText(wa, `¡Hola! 👋 Gracias por escribir a SOTIRIA.\nPara comprar entradas o el libro entra a ${PUBLIC_URL || "nuestra página"}; al finalizar te traerá aquí con tu código.\nSi tienes otra consulta, escríbela y te respondemos pronto.`);
}

/* ---------------- sesiones del panel ---------------- */
const sessions = new Map();
const cookieOf = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")));
function isAdmin(req) {
  const s = sessions.get(cookieOf(req).sid);
  return !!s && s > Date.now();
}

/* ---------------- CSV para CRM ---------------- */
const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita fórmulas en Excel
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCSV = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n");

function customers() {
  const map = {};
  const key = (tel) => waNumber(tel);
  for (const o of Object.values(db.orders)) {
    const k = key(o.buyer.tel);
    const c = (map[k] ||= { tel: o.buyer.tel, wa: k, name: o.buyer.n, ci: o.buyer.ci, email: o.buyer.em, orders: 0, paid: 0, spent: 0, products: new Set(), sources: new Set(), interests: new Set(), first: o.createdAt, last: o.createdAt });
    Object.assign(c, { name: o.buyer.n, ci: o.buyer.ci || c.ci, email: o.buyer.em || c.email });
    c.orders++;
    if (o.status === "aprobada") (c.paid++, (c.spent += o.amount), c.products.add(PRODUCTS[o.product].t));
    if (o.src) c.sources.add(o.src);
    if (o.createdAt < c.first) c.first = o.createdAt;
    if (o.createdAt > c.last) c.last = o.createdAt;
  }
  for (const l of db.leads) {
    const k = key(l.tel);
    const c = (map[k] ||= { tel: l.tel, wa: k, name: l.name, ci: "", email: "", orders: 0, paid: 0, spent: 0, products: new Set(), sources: new Set(), interests: new Set(), first: l.at, last: l.at });
    c.interests.add(l.interest);
    if (l.src) c.sources.add(l.src);
    if (!c.name) c.name = l.name;
  }
  return Object.values(map)
    .map((c) => ({ ...c, products: [...c.products], sources: [...c.sources], interests: [...c.interests] }))
    .sort((a, b) => b.last.localeCompare(a.last));
}

/* ---------------- validación de datos del comprador ---------------- */
function cleanBuyer(b = {}) {
  const v = {
    n: String(b.n || "").trim().slice(0, 80),
    ci: String(b.ci || "").trim().slice(0, 20),
    tel: String(b.tel || "").replace(/[^\d+]/g, "").slice(0, 16),
    em: String(b.em || "").trim().slice(0, 120),
    address: String(b.address || "").trim().slice(0, 200),
  };
  if (v.n.length < 3) return [null, "Escribe tu nombre completo"];
  if (!/^\d{5,}/.test(v.ci)) return [null, "Revisa tu CI"];
  if (!/^\+?\d{7,}$/.test(v.tel)) return [null, "Revisa tu número de celular"];
  if (v.em && !/^\S+@\S+\.\S+$/.test(v.em)) return [null, "Revisa tu correo"];
  return [v];
}

const publicOrder = (o) => ({
  id: o.id,
  status: o.status,
  amount: o.amount,
  ticket: o.status === "aprobada" ? { code: o.ticket.code, url: "/entrada.html?c=" + o.ticket.code } : undefined,
  rejectReason: o.status === "rechazada" ? o.rejectReason : undefined,
});

function orderView(o) {
  const { p, when } = describe(o);
  return { ...o, productName: p.t, when, statusName: STATUS[o.status] };
}

/* ================= RUTAS ================= */
const routes = [];
const route = (method, re, fn, opts = {}) => routes.push({ method, re, fn, ...opts });

/* ---------- públicas ---------- */
route("GET", /^\/api\/health$/, () => [200, { ok: true, whatsapp: WA.enabled ? "real" : "simulador" }]);
route("GET", /^\/api\/availability$/, () => [200, availability()]);

route("POST", /^\/api\/orders$/, ({ body }) => {
  const p = PRODUCTS[body.product];
  if (!p || !p.price) return [400, { error: "Producto no disponible" }];
  const qty = Math.floor(+body.qty);
  if (!(qty >= 1 && qty <= p.maxQty)) return [400, { error: `Puedes comprar de 1 a ${p.maxQty}` }];
  const [buyer, err] = cleanBuyer(body.buyer);
  if (err) return [400, { error: err }];
  const av = availability()[p.id];
  let funcion = null,
    deliveryName = null;
  if (p.type === "show") {
    const f = p.funciones.find((x) => x.id === body.funcion);
    if (!f) return [400, { error: "Elige una función" }];
    if (new Date(`${f.d}T${f.h}`) < new Date()) return [400, { error: "Esa función ya pasó" }];
    if (qty > av[f.id]) return [409, { error: av[f.id] ? `Solo quedan ${av[f.id]} entradas para esa función.` : "Función agotada." }];
    funcion = f.id;
  } else {
    const d = p.delivery.find((x) => x.id === body.delivery);
    if (!d) return [400, { error: "Elige cómo recibir el libro" }];
    if (d.needsAddress && buyer.address.length < 5) return [400, { error: "Escribe la dirección de entrega" }];
    if (qty > av) return [409, { error: "No hay suficientes libros disponibles." }];
    deliveryName = d.n + (d.needsAddress ? ": " + buyer.address : "");
  }
  let id;
  do id = rid("ORD", 6);
  while (db.orders[id]);
  const o = {
    id,
    product: p.id,
    funcion,
    qty,
    amount: p.price * qty,
    buyer,
    delivery: body.delivery || null,
    deliveryName,
    src: String(body.src || "directo").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30) || "directo",
    status: "nueva",
    createdAt: now(),
    receipts: [],
  };
  log(o, "Orden creada en la web", "cliente");
  db.orders[id] = o;
  save();
  const { when, unit } = describe(o);
  const text = `Hola, quiero pagar mi orden ${id}: ${qty} ${unit} — ${p.t}${when ? " (" + when + ")" : ""} — ${bs(o.amount)}`;
  return [201, { ...publicOrder(o), waText: text, waLink: `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}` }];
});

route("GET", /^\/api\/orders\/(ORD-[A-Z0-9]+)$/, ({ m }) => {
  const o = db.orders[m[1]];
  return o ? [200, publicOrder(expire(o))] : [404, { error: "Orden no encontrada" }];
});

route("POST", /^\/api\/leads$/, ({ body }) => {
  const tel = String(body.tel || "").replace(/[^\d+]/g, "");
  const name = String(body.name || "").trim().slice(0, 80);
  if (name.length < 2 || !/^\+?\d{7,}$/.test(tel)) return [400, { error: "Escribe tu nombre y un celular válido" }];
  const interest = String(body.interest || "podcast").slice(0, 30);
  if (!db.leads.some((l) => waNumber(l.tel) === waNumber(tel) && l.interest === interest))
    db.leads.push({ name, tel, interest, src: String(body.src || "directo").slice(0, 30), at: now() });
  save();
  return [201, { ok: true }];
});

route("GET", /^\/api\/tickets\/(ST-[A-Z0-9]+)$/, ({ m }) => {
  const o = db.orders[db.tickets[m[1]]];
  if (!o || o.status !== "aprobada") return [404, { valid: false, error: "Entrada no encontrada" }];
  const { p, f } = describe(o);
  return [200, { valid: true, code: o.ticket.code, product: { id: p.id, t: p.t, type: p.type, venue: p.venue, addr: p.addr }, funcion: f || null, qty: o.qty, name: o.buyer.n, delivery: o.deliveryName, checkedIn: o.ticket.checkedIn || 0, issuedAt: o.ticket.issuedAt }];
});

route("GET", /^\/api\/tickets\/(ST-[A-Z0-9]+)\/qr\.png$/, ({ m, res }) => {
  if (!db.tickets[m[1]]) return [404, { error: "No encontrado" }];
  res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" });
  res.end(qrPNG(ticketURL(m[1])));
});

/* ---------- webhook de WhatsApp (Meta) ---------- */
route("GET", /^\/webhook\/whatsapp$/, ({ url, res }) => {
  const q = url.searchParams;
  if (q.get("hub.mode") === "subscribe" && WA.cfg.verifyToken && q.get("hub.verify_token") === WA.cfg.verifyToken) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end(q.get("hub.challenge"));
  }
  return [403, { error: "Token de verificación incorrecto" }];
});

const seenWa = new Set();
route("POST", /^\/webhook\/whatsapp$/, async ({ body, raw, req }) => {
  if (!WA.verifySignature(raw, req.headers["x-hub-signature-256"])) return [401, { error: "Firma no válida" }];
  for (const m of WA.parseWebhook(body)) {
    if (seenWa.has(m.waMsgId)) continue; // Meta puede reenviar el mismo aviso
    seenWa.add(m.waMsgId);
    try {
      if (m.mediaId) Object.assign(m, await WA.downloadMedia(m.mediaId));
      await handleIncoming(m);
    } catch (e) {
      console.error("Error procesando mensaje de WhatsApp:", e.message);
    }
  }
  return [200, { ok: true }];
});

/* ---------- panel (requiere sesión) ---------- */
route("POST", /^\/api\/admin\/login$/, async ({ body, res }) => {
  const ok = String(body.password || "").length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(String(body.password)), Buffer.from(ADMIN_PASSWORD));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700));
    return [401, { error: "Contraseña incorrecta" }];
  }
  const sid = crypto.randomBytes(24).toString("hex");
  sessions.set(sid, Date.now() + 12 * 36e5);
  res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${PUBLIC_URL.startsWith("https") ? "; Secure" : ""}`);
  return [200, { ok: true }];
});
route("POST", /^\/api\/admin\/logout$/, ({ req, res }) => {
  sessions.delete(cookieOf(req).sid);
  res.setHeader("Set-Cookie", "sid=; Path=/; Max-Age=0");
  return [200, { ok: true }];
});

const A = (method, re, fn, opts) => route(method, re, fn, { admin: true, ...opts });

A("GET", /^\/api\/admin\/me$/, () => [200, { ok: true, whatsapp: WA.enabled ? "real" : "simulador" }]);

A("GET", /^\/api\/admin\/summary$/, () => {
  const os = Object.values(db.orders).map(expire);
  const by = Object.fromEntries(Object.keys(STATUS).map((s) => [s, 0]));
  os.forEach((o) => by[o.status]++);
  const approved = os.filter((o) => o.status === "aprobada");
  const sold = {};
  approved.forEach((o) => (sold[o.product] = (sold[o.product] || 0) + o.qty));
  const unread = Object.values(db.chats).reduce((s, c) => s + c.unread, 0);
  const missingQR = QR_AMOUNTS.filter((a) => !qrFor(a));
  return [200, { by, revenue: approved.reduce((s, o) => s + o.amount, 0), sold, unread, missingQR, availability: availability(), leads: db.leads.length, whatsapp: WA.enabled ? "real" : "simulador" }];
});

A("GET", /^\/api\/admin\/orders$/, ({ url }) => {
  const st = url.searchParams.get("status") || "";
  const q = (url.searchParams.get("q") || "").toLowerCase();
  const list = Object.values(db.orders)
    .map(expire)
    .filter((o) => (!st || o.status === st) && (!q || [o.id, o.buyer.n, o.buyer.ci, o.buyer.tel, o.ticket?.code].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(orderView);
  return [200, list];
});

A("GET", /^\/api\/admin\/orders\/(ORD-[A-Z0-9]+)$/, ({ m }) => {
  const o = db.orders[m[1]];
  if (!o) return [404, { error: "Orden no encontrada" }];
  const wa = o.wa || waNumber(o.buyer.tel);
  return [200, { order: orderView(o), messages: db.messages.filter((x) => x.wa === wa).slice(-60) }];
});

A("POST", /^\/api\/admin\/orders\/(ORD-[A-Z0-9]+)\/approve$/, async ({ m, body }) => {
  const o = db.orders[m[1]];
  if (!o) return [404, { error: "Orden no encontrada" }];
  if (o.status === "aprobada") return [409, { error: "Esta orden ya fue aprobada" }];
  if (!o.wa) o.wa = waNumber(o.buyer.tel);
  let code;
  do code = rid("ST", 8);
  while (db.tickets[code]);
  o.ticket = { code, issuedAt: now(), checkedIn: 0 };
  o.status = "aprobada";
  o.reviewedBy = String(body.by || "panel").slice(0, 40);
  db.tickets[code] = o.id;
  log(o, `Pago verificado. Entrada ${code} emitida`, o.reviewedBy);
  save();
  await sendTicket(o, o.reviewedBy);
  const last = db.messages.filter((x) => x.orderId === o.id && x.dir === "out").pop();
  return [200, { ok: true, order: orderView(o), sendError: last?.error }];
});

A("POST", /^\/api\/admin\/orders\/(ORD-[A-Z0-9]+)\/reject$/, async ({ m, body }) => {
  const o = db.orders[m[1]];
  if (!o) return [404, { error: "Orden no encontrada" }];
  if (o.status === "aprobada") return [409, { error: "No se puede rechazar una orden aprobada" }];
  o.status = "rechazada";
  o.rejectReason = String(body.reason || "No pudimos verificar el pago").slice(0, 300);
  log(o, "Rechazada: " + o.rejectReason, String(body.by || "panel").slice(0, 40));
  save();
  if (o.wa) await sendText(o.wa, `Lo sentimos, no pudimos verificar el pago de tu orden ${o.id}.\nMotivo: ${o.rejectReason}\nSi crees que es un error, respóndenos por aquí. 🙏`, o.id, body.by || "panel");
  return [200, { ok: true, order: orderView(o) }];
});

A("POST", /^\/api\/admin\/orders\/(ORD-[A-Z0-9]+)\/resend$/, async ({ m, body }) => {
  const o = db.orders[m[1]];
  if (!o) return [404, { error: "Orden no encontrada" }];
  if (!o.wa) o.wa = waNumber(o.buyer.tel);
  if (o.status === "aprobada") await sendTicket(o, body.by || "panel");
  else if (o.status === "nueva" || o.status === "esperando_pago") await sendPaymentQR(o, body.by || "panel");
  else return [409, { error: "No hay nada que reenviar en este estado" }];
  return [200, { ok: true }];
});

A("GET", /^\/api\/admin\/chats$/, () => {
  const list = Object.values(db.chats)
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .map((c) => {
      const last = db.messages.filter((x) => x.wa === c.wa).pop();
      const o = Object.values(db.orders).filter((x) => x.wa === c.wa).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return { ...c, name: o?.buyer.n || c.name, last: last && { dir: last.dir, type: last.type, text: last.text, at: last.at }, order: o && { id: o.id, status: o.status } };
    });
  return [200, list];
});

A("GET", /^\/api\/admin\/chats\/(\d+)$/, ({ m }) => {
  if (db.chats[m[1]]) db.chats[m[1]].unread = 0;
  save();
  const orders = Object.values(db.orders).filter((o) => o.wa === m[1] || waNumber(o.buyer.tel) === m[1]).map(orderView);
  return [200, { chat: db.chats[m[1]] || { wa: m[1] }, messages: db.messages.filter((x) => x.wa === m[1]), orders }];
});

A("POST", /^\/api\/admin\/chats\/(\d+)\/send$/, async ({ m, body }) => {
  const text = String(body.text || "").trim().slice(0, 2000);
  if (!text) return [400, { error: "Escribe un mensaje" }];
  const msg = await sendText(m[1], text, body.orderId, String(body.by || "panel").slice(0, 40));
  return msg.error ? [502, { error: "WhatsApp: " + msg.error }] : [200, { ok: true }];
});

A("GET", /^\/api\/admin\/media\/([\w-]+\.(?:png|jpg|pdf))$/, ({ m, res }) => {
  const file = path.join(MEDIA, m[1]);
  if (!fs.existsSync(file)) return [404, { error: "No encontrado" }];
  res.writeHead(200, { "Content-Type": m[1].endsWith(".pdf") ? "application/pdf" : m[1].endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "private, max-age=86400" });
  res.end(fs.readFileSync(file));
});

/* QRs de cobro por monto */
A("GET", /^\/api\/admin\/qr$/, () => [200, QR_AMOUNTS.map((a) => ({ amount: a, loaded: !!qrFor(a) }))]);
A("GET", /^\/api\/admin\/qr\/(\d+)$/, ({ m, res }) => {
  const q = qrFor(+m[1]);
  if (!q) return [404, { error: "Sin QR" }];
  res.writeHead(200, { "Content-Type": q.mime, "Cache-Control": "no-store" });
  res.end(q.buffer);
});
A(
  "POST",
  /^\/api\/admin\/qr\/(\d+)$/,
  ({ m, body }) => {
    const amount = +m[1];
    if (!QR_AMOUNTS.includes(amount)) return [400, { error: "Monto no usado en la página" }];
    const d = String(body.dataUrl || "").match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!d) return [400, { error: "Sube una imagen PNG o JPG" }];
    const file = `${amount}.${d[1] === "png" ? "png" : "jpg"}`;
    for (const ext of ["png", "jpg"]) fs.rmSync(path.join(QRDIR, `${amount}.${ext}`), { force: true });
    fs.writeFileSync(path.join(QRDIR, file), Buffer.from(d[2], "base64"));
    db.qr[amount] = file;
    save();
    return [200, { ok: true }];
  },
  { maxBody: 8e6 },
);

/* CRM */
A("GET", /^\/api\/admin\/crm$/, () => [200, { customers: customers(), leads: db.leads }]);
A("GET", /^\/api\/admin\/export\/(ordenes|clientes)\.csv$/, ({ m, res }) => {
  let rows;
  if (m[1] === "ordenes")
    rows = [
      ["Orden", "Fecha", "Estado", "Producto", "Función", "Cantidad", "Monto Bs", "Nombre", "CI", "Celular", "Correo", "Entrega", "Origen", "Entrada", "Validado por"],
      ...Object.values(db.orders)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((o) => {
          const { p, when } = describe(o);
          return [o.id, o.createdAt.slice(0, 16).replace("T", " "), STATUS[o.status], p.t, when, o.qty, o.amount, o.buyer.n, o.buyer.ci, o.buyer.tel, o.buyer.em, o.deliveryName, o.src, o.ticket?.code, o.reviewedBy];
        }),
    ];
  else
    rows = [
      ["Nombre", "CI", "Celular", "Correo", "Compras aprobadas", "Total gastado Bs", "Productos", "Interés", "Origen", "Primer contacto", "Último contacto"],
      ...customers().map((c) => [c.name, c.ci, c.tel, c.email, c.paid, c.spent, c.products.join(" | "), c.interests.join(" | "), c.sources.join(" | "), c.first.slice(0, 10), c.last.slice(0, 10)]),
    ];
  res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${m[1]}-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.end(toCSV(rows));
});

/* Ingreso en puerta */
A("POST", /^\/api\/admin\/tickets\/(ST-[A-Z0-9]+)\/checkin$/, ({ m, body }) => {
  const o = db.orders[db.tickets[m[1]]];
  if (!o) return [404, { error: "Entrada no encontrada" }];
  const t = o.ticket;
  const n = Math.max(1, Math.floor(+body.n || 1));
  if ((t.checkedIn || 0) + n > o.qty) return [409, { error: `Esta entrada ya registró ${t.checkedIn} de ${o.qty} ingresos` }];
  t.checkedIn = (t.checkedIn || 0) + n;
  log(o, `Ingreso registrado (${t.checkedIn}/${o.qty})`, String(body.by || "puerta").slice(0, 40));
  save();
  return [200, { ok: true, checkedIn: t.checkedIn, qty: o.qty }];
});

/* Simulador de WhatsApp (solo sin WhatsApp real) */
A(
  "POST",
  /^\/api\/admin\/sim\/incoming$/,
  async ({ body }) => {
    if (WA.enabled) return [403, { error: "El simulador está desactivado porque WhatsApp real está conectado" }];
    const from = waNumber(body.from);
    if (!/^\d{8,15}$/.test(from)) return [400, { error: "Número no válido" }];
    const msg = { from, name: String(body.name || "").slice(0, 60), text: String(body.text || "").slice(0, 2000) };
    const d = String(body.dataUrl || "").match(/^data:(image\/png|image\/jpeg|application\/pdf);base64,(.+)$/);
    if (d) Object.assign(msg, { mime: d[1], buffer: Buffer.from(d[2], "base64") });
    if (!msg.text && !msg.buffer) return [400, { error: "Mensaje vacío" }];
    await handleIncoming(msg);
    return [200, { ok: true }];
  },
  { maxBody: 8e6 },
);
A("GET", /^\/api\/admin\/sim\/chat\/(\d+)$/, ({ m }) => [200, db.messages.filter((x) => x.wa === waNumber(m[1]))]);

/* ================= SERVIDOR HTTP ================= */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8" };
const PRIVATE = /^\/(server|\.git)(\/|$)/;

function send(res, code, obj) {
  if (res.headersSent) return;
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > max) {
        reject(Object.assign(new Error("too large"), { code: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/webhook/")) {
      const r = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!r) return send(res, 404, { error: "Ruta no encontrada" });
      if (r.admin && !isAdmin(req)) return send(res, 401, { error: "Inicia sesión" });
      try {
        let raw = Buffer.alloc(0),
          body = {};
        if (req.method === "POST") {
          raw = await readBody(req, r.maxBody || 1e5);
          try {
            body = raw.length ? JSON.parse(raw) : {};
          } catch {}
        }
        const out = await r.fn({ m: url.pathname.match(r.re), url, body, raw, req, res });
        if (out) send(res, out[0], out[1]);
      } catch (e) {
        if (e.code === 413) return send(res, 413, { error: "Archivo demasiado grande" });
        console.error(e);
        send(res, 500, { error: "Error interno" });
      }
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || PRIVATE.test(p)) return res.writeHead(404).end("No encontrado");
    fs.readFile(file, (err, buf) => {
      if (err) return res.writeHead(404).end("No encontrado");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(buf);
    });
  })
  .listen(PORT, () => {
    console.log(`SOTIRIA → http://localhost:${PORT}   Panel → http://localhost:${PORT}/panel/`);
    console.log(`WhatsApp: ${WA.enabled ? "CONECTADO (API de Meta)" : "modo SIMULADOR (configura WA_TOKEN y WA_PHONE_ID)"}`);
    if (ADMIN_PASSWORD === "sotiria") console.warn("⚠  Contraseña del panel por defecto: 'sotiria'. Define ADMIN_PASSWORD.");
    const missing = QR_AMOUNTS.filter((a) => !qrFor(a));
    if (missing.length) console.warn(`⚠  Faltan QRs de cobro para: ${missing.map(bs).join(", ")} (cárgalos en el panel)`);
  });
