/* =====================================================================
   SERVIDOR SOTIRIA  (Node 18+, sin dependencias)
   ---------------------------------------------------------------------
   Ejecutar:   node server/server.js      → http://localhost:3000
   Panel:      http://localhost:3000/admin.html

   Flujo de compra:
   1. En la página el cliente elige obra/libro y cantidad → se crea el
      pedido (ST-XXXXX) y se abre WhatsApp con un mensaje ya escrito.
   2. Al llegar ese mensaje, el sistema responde solo con el QR de
      cobro del monto exacto (imágenes cargadas en el panel).
   3. El cliente envía la foto del comprobante a ese chat → aparece en
      el panel, en "Comprobantes por validar".
   4. Quien valida revisa la cuenta del banco y pulsa "Aprobar": se
      genera la entrada única y se envía sola a ese chat.

   Variables de entorno (todas opcionales):
     PORT             puerto (3000)
     PUBLIC_URL       dirección pública de la web, para los enlaces que
                      se envían por WhatsApp (https://tudominio.com)
     ADMIN_PASSWORD   contraseña del panel (o: node server/set-password.js)
     WA_TOKEN, WA_PHONE_ID, WA_VERIFY_TOKEN, WA_APP_SECRET
                      WhatsApp Business real (ver WHATSAPP.md). Sin ellas
                      se usa el simulador del panel.
   ===================================================================== */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const DATA = require("../js/data.js");
const WA = require("./whatsapp.js");
const TX = require("./textos.js");
const { qrPNG } = require("./png.js");

const PORT = +process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");
const DIR = __dirname;
const DB_FILE = path.join(DIR, "db.json");
const ADMIN_FILE = path.join(DIR, "admin.json");
const UPLOADS = path.join(DIR, "uploads");
const QR_DIR = path.join(DIR, "qr-cobro");
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const HOURS_NO_CONTACT = 2; // pedido sin mensaje de WhatsApp → vence
const HOURS_NO_PROOF = 24; // QR enviado sin comprobante → vence
const SESSION_HOURS = 12;
const { PRODUCTS, CONTACT, QR_AMOUNTS } = DATA;

fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(QR_DIR, { recursive: true });

/* =====================================================================
   BASE DE DATOS (archivo JSON). Para mucho volumen: pasar a PostgreSQL.
   ===================================================================== */
let db = { orders: {}, messages: [], media: {}, leads: [], seen: {}, greeted: {} };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
} catch {}

/* Pedidos de versiones anteriores de la página (sin "product" válido) rompen el
   panel. Se apartan a db-legacy.json (no se borran) y se quitan de la base activa. */
{
  const legacy = Object.entries(db.orders || {}).filter(([, o]) => !o || !PRODUCTS[o.product]);
  if (legacy.length || db.tickets) {
    const LEGACY_FILE = path.join(DIR, "db-legacy.json");
    let old = {};
    try {
      old = JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8"));
    } catch {}
    old.orders = { ...(old.orders || {}), ...Object.fromEntries(legacy) };
    if (db.tickets) old.tickets = { ...(old.tickets || {}), ...db.tickets };
    fs.writeFileSync(LEGACY_FILE, JSON.stringify(old));
    for (const [id] of legacy) delete db.orders[id];
    delete db.tickets;
    fs.writeFileSync(DB_FILE, JSON.stringify(db));
    console.log(`Se apartaron ${legacy.length} pedidos de una versión anterior → server/db-legacy.json`);
  }
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + ".tmp";
    fs.writeFile(tmp, JSON.stringify(db), (e) => !e && fs.rename(tmp, DB_FILE, () => {}));
  }, 80);
}

const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rnd = (n) => Array.from(crypto.randomBytes(n), (b) => ABC[b % 32]).join("");
const now = () => Date.now();

/* =====================================================================
   PEDIDOS
   ===================================================================== */
const STATUS = {
  nuevo: "Esperando mensaje de WhatsApp",
  esperando_qr: "Falta enviar el QR",
  qr_enviado: "QR enviado, esperando comprobante",
  comprobante: "Comprobante por validar",
  pagado: "Pagado",
  vencido: "Vencido",
  cancelado: "Cancelado",
};
const ACTIVE = ["nuevo", "esperando_qr", "qr_enviado", "comprobante", "pagado"];

const fechaLarga = (d, h) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) + (h ? ` · ${h}` : "");
const funcionOf = (o) => (o.product === "obra" ? PRODUCTS.obra.funciones.find((f) => f.id === o.funcion) : null);
function detalle(o) {
  const p = PRODUCTS[o.product];
  const u = p.unit[o.qty === 1 ? 0 : 1];
  const f = funcionOf(o);
  return `${o.qty} ${u} · ${p.t}` + (f ? ` · ${fechaLarga(f.d, f.h)}` : "");
}
const firstName = (o) => (o.buyer?.n || o.waName || "").split(" ")[0] || "";

function touch(o, s, by, note) {
  o.status = s;
  o.updatedAt = now();
  o.history.push({ at: o.updatedAt, s, by: by || "sistema", note: note || "" });
  save();
}

function expire(o) {
  const t = now();
  if (o.status === "nuevo" && t - o.createdAt > HOURS_NO_CONTACT * 36e5) touch(o, "vencido", "sistema", "Sin mensaje de WhatsApp");
  if (o.status === "qr_enviado" && t - (o.qrSentAt || o.createdAt) > HOURS_NO_PROOF * 36e5) touch(o, "vencido", "sistema", "Sin comprobante");
  return o;
}
const allOrders = () => Object.values(db.orders).map(expire);

function used(product, funcion) {
  return allOrders()
    .filter((o) => o.product === product && (!funcion || o.funcion === funcion) && ACTIVE.includes(o.status))
    .reduce((s, o) => s + o.qty, 0);
}
function availability() {
  return {
    obra: Object.fromEntries(PRODUCTS.obra.funciones.map((f) => [f.id, Math.max(0, f.cap - used("obra", f.id))])),
    libro: Math.max(0, PRODUCTS.libro.cap - used("libro")),
  };
}

function waLink(o) {
  const text = `Hola, quiero pagar mi pedido ${o.id}: ${detalle(o)} — Bs ${o.amount}`;
  return `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(text)}`;
}
const ticketLink = (o) => `${PUBLIC_URL}/entrada.html?c=${o.ticket.code}`;

function publicOrder(o) {
  return {
    code: o.id,
    status: o.status,
    label: STATUS[o.status],
    amount: o.amount,
    detalle: detalle(o),
    waLink: waLink(o),
    rejected: o.status === "qr_enviado" && !!o.rejections?.length ? o.rejections[o.rejections.length - 1].reason : null,
    ticket: o.status === "pagado" && o.ticket ? { code: o.ticket.code, link: o.product === "obra" ? ticketLink(o) : null } : null,
  };
}

/* =====================================================================
   ARCHIVOS (comprobantes, QR de cobro, entradas)
   ===================================================================== */
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
function saveMedia(buffer, mime, kind) {
  const id = crypto.randomUUID();
  const file = "uploads/" + id + (EXT[mime] || ".bin");
  fs.writeFileSync(path.join(DIR, file), buffer);
  db.media[id] = { file, mime, size: buffer.length, sha: crypto.createHash("sha256").update(buffer).digest("hex"), kind, at: now() };
  save();
  return id;
}
function qrFile(amount) {
  for (const ext of [".png", ".jpg", ".webp"]) {
    const f = path.join(QR_DIR, amount + ext);
    if (fs.existsSync(f)) return { file: f, rel: "qr-cobro/" + amount + ext, mime: ext === ".png" ? "image/png" : ext === ".jpg" ? "image/jpeg" : "image/webp" };
  }
  return null;
}
function parseDataUrl(s) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(s || ""));
  if (!m || !EXT[m[1]]) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

/* =====================================================================
   WHATSAPP: enviar y registrar
   ===================================================================== */
function logMsg(m) {
  const msg = { id: crypto.randomUUID(), at: now(), ...m };
  db.messages.push(msg);
  save();
  return msg;
}

async function sendText(phone, text, extra = {}) {
  const msg = logMsg({ phone, dir: "out", type: "text", text, ...extra });
  try {
    await WA.sendText(phone, text);
    msg.state = "enviado";
  } catch (e) {
    msg.state = "error";
    msg.error = e.message;
    console.error("WhatsApp:", e.message);
  }
  save();
  return msg;
}
async function sendImage(phone, buffer, mime, caption, mediaId, extra = {}) {
  const msg = logMsg({ phone, dir: "out", type: "image", text: caption, media: mediaId, ...extra });
  try {
    await WA.sendImage(phone, buffer, mime, caption);
    msg.state = "enviado";
  } catch (e) {
    msg.state = "error";
    msg.error = e.message;
    console.error("WhatsApp:", e.message);
  }
  save();
  return msg;
}

/* Envía el QR de cobro del monto exacto */
async function sendQR(o, by) {
  const vars = { first: firstName(o), code: o.id, detalle: detalle(o), amount: o.amount, isBook: o.product === "libro" };
  let q = qrFile(o.amount);
  if (!q && !WA.enabled) {
    /* Simulador: si aún no subiste los QR reales, se usa uno de prueba */
    const buf = qrPNG(`QR DE PRUEBA · SOTIRIA · Bs ${o.amount}`, 8);
    const rel = `qr-cobro/prueba-${o.amount}.png`;
    fs.writeFileSync(path.join(DIR, rel), buf);
    q = { file: path.join(DIR, rel), rel, mime: "image/png" };
  }
  if (!q) {
    o.needsQR = true;
    touch(o, "esperando_qr", by, `Falta cargar el QR de Bs ${o.amount}`);
    await sendText(o.phone, TX.qrPendiente(vars), { orderId: o.id });
    return false;
  }
  const mid = "qr-" + o.amount;
  db.media[mid] = { file: q.rel, mime: q.mime, kind: "qr", at: now() };
  await sendImage(o.phone, fs.readFileSync(q.file), q.mime, TX.qr(vars), mid, { orderId: o.id });
  o.needsQR = false;
  o.qrSentAt = now();
  touch(o, "qr_enviado", by, `QR de Bs ${o.amount} enviado`);
  return true;
}

/* Procesa un mensaje entrante (de Meta o del simulador) */
async function handleIncoming(m) {
  if (m.waMsgId && db.messages.some((x) => x.waMsgId === m.waMsgId)) return; // duplicado
  const phone = String(m.from).replace(/\D/g, "");
  let mediaId = null;
  if (m.buffer) mediaId = saveMedia(m.buffer, m.mime, "entrante");
  const msg = logMsg({ phone, name: m.name || "", dir: "in", type: mediaId ? "image" : "text", text: m.text || "", media: mediaId, waMsgId: m.waMsgId, filename: m.filename });

  const code = /\bST-?([A-Z0-9]{5})\b/i.exec(m.text || "");
  let o = code && db.orders["ST-" + code[1].toUpperCase()];
  if (o) {
    expire(o);
    o.phone = phone;
    o.waName = m.name || o.waName;
    msg.orderId = o.id;
    if (o.status === "nuevo" || o.status === "vencido") {
      if (o.status === "vencido") o.history.push({ at: now(), s: "reactivado", by: "cliente", note: "Volvió a escribir" });
      if (!mediaId) return void (await sendQR(o));
    }
    if (o.status === "pagado" && !mediaId) {
      return void (await sendText(phone, `Tu pedido *${o.id}* ya está confirmado ✅` + (o.ticket && o.product === "obra" ? `\nTu entrada: ${ticketLink(o)}` : ""), { orderId: o.id }));
    }
  }

  if (mediaId) {
    /* Comprobante: va al pedido del código o al último pedido abierto de ese número */
    o =
      o ||
      allOrders()
        .filter((x) => x.phone === phone && !["pagado", "cancelado"].includes(x.status))
        .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!o) return void (await sendText(phone, TX.comprobanteSinPedido()));
    return void (await attachProof(o, msg, "cliente"));
  }

  const open = allOrders().some((x) => x.phone === phone && !["cancelado", "vencido"].includes(x.status));
  if (!o && !open && now() - (db.greeted[phone] || 0) > 12 * 36e5) {
    db.greeted[phone] = now();
    await sendText(phone, TX.bienvenida(PUBLIC_URL));
  }
}

async function attachProof(o, msg, by) {
  msg.orderId = o.id;
  o.proofs = [...new Set([...(o.proofs || []), msg.media])];
  const sha = db.media[msg.media]?.sha;
  const dups = allOrders().filter((x) => x.id !== o.id && (x.proofs || []).some((p) => db.media[p]?.sha === sha));
  if (dups.length) o.dupWarning = [...new Set([...(o.dupWarning || []), ...dups.map((d) => d.id)])];
  o.proofAt = now();
  touch(o, "comprobante", by, "Comprobante recibido");
  await sendText(o.phone, TX.comprobanteRecibido({ code: o.id, isBook: o.product === "libro" }), { orderId: o.id });
}

/* Aprobar: genera la entrada única y la envía por WhatsApp */
async function approve(o, by) {
  if (o.status === "pagado") return;
  o.ticket = { code: `SOT-${rnd(4)}-${rnd(4)}-${rnd(4)}`, issuedAt: now(), checkedIn: 0 };
  o.paidAt = now();
  o.validatedBy = by;
  touch(o, "pagado", by, "Pago validado");
  if (!o.phone) return;
  const vars = { first: firstName(o), code: o.id, detalle: detalle(o), amount: o.amount, ticketCode: o.ticket.code };
  if (o.product === "obra") {
    const f = funcionOf(o);
    const png = qrPNG(ticketLink(o), 10);
    const mid = saveMedia(png, "image/png", "entrada");
    const caption = TX.entrada({ ...vars, titulo: PRODUCTS.obra.t, fecha: fechaLarga(f.d, f.h), lugar: `${PRODUCTS.obra.venue}, ${PRODUCTS.obra.addr}`, detalle: `${o.qty} ${PRODUCTS.obra.unit[o.qty === 1 ? 0 : 1]}`, link: ticketLink(o) });
    await sendImage(o.phone, png, "image/png", caption, mid, { orderId: o.id });
  } else {
    const d = PRODUCTS.libro.delivery.find((x) => x.id === o.delivery);
    await sendText(o.phone, TX.libroConfirmado({ ...vars, entrega: d ? d.n : "", envio: !!d?.needsAddress }), { orderId: o.id });
  }
}

async function reject(o, reason, by) {
  o.rejections = [...(o.rejections || []), { at: now(), by, reason }];
  o.qrSentAt = now(); // le damos otras 24 h para reenviar
  touch(o, "qr_enviado", by, "Comprobante rechazado: " + reason);
  if (o.phone) await sendText(o.phone, TX.rechazo({ code: o.id, motivo: reason }), { orderId: o.id });
}

/* =====================================================================
   PANEL: contraseña y sesiones
   ===================================================================== */
const sessions = new Map(); // token → { exp, name }
const loginFails = new Map(); // ip → { n, until }

function credential() {
  if (process.env.ADMIN_PASSWORD) return { plain: process.env.ADMIN_PASSWORD };
  try {
    return JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
  } catch {
    return null;
  }
}
function writeCredential(pw) {
  const salt = crypto.randomBytes(16);
  fs.writeFileSync(ADMIN_FILE, JSON.stringify({ salt: salt.toString("hex"), hash: crypto.scryptSync(pw, salt, 64).toString("hex"), updatedAt: new Date().toISOString() }, null, 2));
}
function checkPassword(pw) {
  const c = credential();
  if (!c || typeof pw !== "string" || !pw) return false;
  let a, b;
  if (c.plain != null) {
    a = crypto.createHash("sha256").update(c.plain).digest();
    b = crypto.createHash("sha256").update(pw).digest();
  } else {
    a = Buffer.from(c.hash, "hex");
    b = crypto.scryptSync(pw, Buffer.from(c.salt, "hex"), a.length);
  }
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function adminOf(req) {
  const t = cookies(req).st_admin;
  const s = t && sessions.get(t);
  if (s && s.exp > now()) return s;
  if (t) sessions.delete(t);
  return null;
}
function sessionCookie(req, token, maxAge) {
  const https = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
  return `st_admin=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${https ? "; Secure" : ""}`;
}
const ipOf = (req) => (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;

/* Límite simple de pedidos por IP */
const hits = new Map();
function limited(req, key, max) {
  const k = key + ipOf(req);
  const h = (hits.get(k) || []).filter((t) => now() - t < 36e5);
  h.push(now());
  hits.set(k, h);
  return h.length > max;
}

/* =====================================================================
   CRM
   ===================================================================== */
function customers() {
  const map = new Map();
  const get = (phone, ci) => {
    const k = phone || "ci:" + (ci || "?");
    if (!map.has(k)) map.set(k, { key: k, phone: phone || "", name: "", ci: "", email: "", address: "", sources: new Set(), interests: new Set(), orders: 0, paid: 0, spent: 0, tickets: 0, books: 0, first: Infinity, last: 0 });
    return map.get(k);
  };
  for (const o of allOrders()) {
    if (o.status === "nuevo" && !o.phone) continue; // nunca escribió
    const c = get(o.phone, o.buyer?.ci);
    c.name = o.buyer?.n || c.name || o.waName || "";
    c.ci = o.buyer?.ci || c.ci;
    c.email = o.buyer?.em || c.email;
    c.address = o.buyer?.addr || c.address;
    if (o.source?.src) c.sources.add(o.source.src);
    c.interests.add(o.product);
    c.orders++;
    if (o.status === "pagado") {
      c.paid++;
      c.spent += o.amount;
      if (o.product === "obra") c.tickets += o.qty;
      else c.books += o.qty;
    }
    c.first = Math.min(c.first, o.createdAt);
    c.last = Math.max(c.last, o.updatedAt);
  }
  for (const l of db.leads) {
    const c = get(l.phone);
    c.name = c.name || l.name;
    if (l.source) c.sources.add(l.source);
    c.interests.add(l.interest);
    c.first = Math.min(c.first, l.at);
    c.last = Math.max(c.last, l.at);
  }
  return [...map.values()]
    .map((c) => ({ ...c, sources: [...c.sources], interests: [...c.interests], first: c.first === Infinity ? null : c.first }))
    .sort((a, b) => b.last - a.last);
}

function csv(rows, cols) {
  const q = (v) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.map((c) => q(c[0])).join(";"), ...rows.map((r) => cols.map((c) => q(c[1](r))).join(";"))].join("\r\n");
}
const fmtTs = (t) => (t ? new Date(t - 4 * 36e5).toISOString().slice(0, 16).replace("T", " ") : "");

function adminOrder(o) {
  return {
    ...o,
    label: STATUS[o.status],
    detalle: detalle(o),
    proofs: (o.proofs || []).map((id) => ({ id, mime: db.media[id]?.mime })),
    ticketLink: o.ticket && o.product === "obra" ? ticketLink(o) : null,
    hasQR: !!qrFile(o.amount),
  };
}

function summary() {
  const list = allOrders();
  const paid = list.filter((o) => o.status === "pagado");
  const today = new Date(now() - 4 * 36e5).toISOString().slice(0, 10);
  const isToday = (t) => new Date(t - 4 * 36e5).toISOString().slice(0, 10) === today;
  const by = (s) => list.filter((o) => o.status === s).length;
  return {
    wa: WA.enabled,
    pending: by("comprobante"),
    needQR: by("esperando_qr"),
    waitingProof: by("qr_enviado"),
    revenue: paid.reduce((s, o) => s + o.amount, 0),
    revenueToday: paid.filter((o) => isToday(o.paidAt)).reduce((s, o) => s + o.amount, 0),
    ticketsSold: paid.filter((o) => o.product === "obra").reduce((s, o) => s + o.qty, 0),
    booksSold: paid.filter((o) => o.product === "libro").reduce((s, o) => s + o.qty, 0),
    funciones: PRODUCTS.obra.funciones.map((f) => ({
      ...f,
      label: fechaLarga(f.d, f.h),
      sold: list.filter((o) => o.funcion === f.id && o.status === "pagado").reduce((s, o) => s + o.qty, 0),
      held: list.filter((o) => o.funcion === f.id && ["nuevo", "esperando_qr", "qr_enviado", "comprobante"].includes(o.status)).reduce((s, o) => s + o.qty, 0),
      checkedIn: list.filter((o) => o.funcion === f.id && o.ticket).reduce((s, o) => s + o.ticket.checkedIn, 0),
    })),
    missingQR: QR_AMOUNTS.filter((a) => !qrFile(a)),
    leads: db.leads.length,
    unread: chats().reduce((s, c) => s + c.unread, 0),
  };
}

/* =====================================================================
   ESTADÍSTICAS (adaptadas del panel del propietario de Jerold27).
   Todas las fechas en hora de Bolivia.
   ===================================================================== */
const TZ_OFFSET_H = process.env.TZ_OFFSET_H != null ? +process.env.TZ_OFFSET_H : -4;
const DAY = 864e5;
const OFF = TZ_OFFSET_H * 36e5;
const localDay = (ts) => Math.floor((ts + OFF) / DAY);
const dayStart = (d) => d * DAY - OFF;
const dayKey = (d) => new Date(d * DAY).toISOString().slice(0, 10);
const weekdayOf = (ts) => (new Date(ts + OFF).getUTCDay() + 6) % 7; // 0 = lunes
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const SOURCE_NAMES = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", directo: "Directo", whatsapp: "WhatsApp" };

function stats(range) {
  const t = now();
  const end = t + 1;
  const today = localDay(t);
  const lt = new Date(t + OFF);
  const empty = () => ({ revenue: 0, units: 0, tickets: 0, books: 0, orders: 0 });
  const add = (g, o) => {
    g.revenue += o.amount;
    g.units += o.qty;
    if (o.product === "obra") g.tickets += o.qty;
    else g.books += o.qty;
    g.orders++;
    return g;
  };
  const paid = allOrders().filter((o) => o.status === "pagado" && o.paidAt);
  const between = (a, b) => paid.filter((o) => o.paidAt >= a && o.paidAt < b);
  const sum = (list) => list.reduce(add, empty());

  /* Cada período se compara con el mismo tramo del período anterior */
  const startDay = dayStart(today);
  const startWeek = dayStart(today - weekdayOf(t));
  const startMonth = Date.UTC(lt.getUTCFullYear(), lt.getUTCMonth(), 1) - OFF;
  const prevMonth = Date.UTC(lt.getUTCFullYear(), lt.getUTCMonth() - 1, 1) - OFF;
  const period = (start, prevStart) => ({ ...sum(between(start, end)), prev: sum(between(prevStart, Math.min(prevStart + (end - start), start))) });
  const kpis = { day: period(startDay, startDay - DAY), week: period(startWeek, startWeek - 7 * DAY), month: period(startMonth, prevMonth) };

  const trend = [];
  for (let d = today - 29; d <= today; d++) trend.push({ day: dayKey(d), ...sum(between(dayStart(d), dayStart(d + 1))) });

  const RANGES = { day: startDay, week: startWeek, month: startMonth, d30: dayStart(today - 29), d90: dayStart(today - 89), all: 0 };
  const r = Object.hasOwn(RANGES, range) ? range : "month";
  const sel = between(RANGES[r], end);
  const group = (keys, keyOf, nameOf) => {
    const m = new Map(keys.map((k) => [k, empty()]));
    for (const o of sel) {
      const k = keyOf(o);
      if (k == null) continue;
      if (!m.has(k)) m.set(k, empty());
      add(m.get(k), o);
    }
    return [...m].map(([id, g]) => ({ id, name: nameOf(id), ...g }));
  };
  const fn = (id) => {
    const f = PRODUCTS.obra.funciones.find((x) => x.id === id);
    return f ? fechaLarga(f.d, f.h) : id;
  };

  return {
    generatedAt: new Date(t).toISOString(),
    tzOffset: TZ_OFFSET_H,
    range: r,
    demo: paid.some((o) => o.demo),
    kpis,
    trend,
    total: sum(sel),
    byProduct: group(["obra", "libro"], (o) => o.product, (id) => (id === "obra" ? "Entradas de la obra" : "Libro")),
    byFuncion: group(PRODUCTS.obra.funciones.map((f) => f.id), (o) => (o.product === "obra" ? o.funcion : null), fn),
    bySource: group([], (o) => o.source?.src || "directo", (id) => SOURCE_NAMES[id] || id),
    byWeekday: group([0, 1, 2, 3, 4, 5, 6], (o) => weekdayOf(o.paidAt), (i) => WEEKDAYS[i]),
    byValidator: group([], (o) => o.validatedBy || "—", (id) => id),
    recent: [...sel]
      .sort((a, b) => b.paidAt - a.paidAt)
      .slice(0, 12)
      .map((o) => ({ paidAt: o.paidAt, code: o.id, detalle: detalle(o), qty: o.qty, amount: o.amount, source: SOURCE_NAMES[o.source?.src] || o.source?.src || "", buyer: o.buyer?.n || "", by: o.validatedBy || "" })),
  };
}

function chats() {
  const map = new Map();
  for (const m of db.messages) {
    const c = map.get(m.phone) || { phone: m.phone, name: "", last: null, unread: 0 };
    if (m.dir === "in") {
      c.name = m.name || c.name;
      if (m.at > (db.seen[m.phone] || 0)) c.unread++;
    }
    c.last = m;
    map.set(m.phone, c);
  }
  const ord = allOrders();
  return [...map.values()]
    .map((c) => {
      const o = ord.filter((x) => x.phone === c.phone).sort((a, b) => b.createdAt - a.createdAt)[0];
      return { ...c, name: o?.buyer?.n || c.name, order: o ? { id: o.id, status: o.status, label: STATUS[o.status] } : null };
    })
    .sort((a, b) => b.last.at - a.last.at);
}

/* =====================================================================
   RUTAS
   ===================================================================== */
const routes = [];
const route = (method, re, fn, opts = {}) => routes.push({ method, re, fn, ...opts });
const A = { admin: true };

/* ---------- públicas ---------- */
route("GET", /^\/api\/health$/, () => [200, { ok: true, wa: WA.enabled, whatsapp: CONTACT.whatsapp }]);
route("GET", /^\/api\/availability$/, () => [200, availability()]);

route("POST", /^\/api\/orders$/, (m, b, req) => {
  if (limited(req, "o", 30)) return [429, { error: "Demasiados pedidos seguidos. Intenta en un rato." }];
  const p = PRODUCTS[b.product];
  if (!p || !p.price) return [400, { error: "Producto no válido" }];
  const qty = Math.floor(+b.qty);
  if (!(qty >= 1 && qty <= p.maxQty)) return [400, { error: `Cantidad no válida (1 a ${p.maxQty})` }];
  const buyer = b.buyer || {};
  const n = String(buyer.n || "").trim().slice(0, 80);
  if (n.length < 3) return [400, { error: "Escribe tu nombre completo" }];
  const o = {
    id: "",
    key: crypto.randomBytes(16).toString("hex"),
    product: p.id,
    funcion: null,
    delivery: null,
    qty,
    amount: p.price * qty, // el precio SIEMPRE lo calcula el servidor
    buyer: { n, ci: String(buyer.ci || "").trim().slice(0, 20), em: String(buyer.em || "").trim().slice(0, 120), addr: String(buyer.addr || "").trim().slice(0, 200) },
    source: { src: String(b.source?.src || "directo").slice(0, 40), campaign: String(b.source?.campaign || "").slice(0, 60) },
    status: "nuevo",
    phone: null,
    createdAt: now(),
    updatedAt: now(),
    history: [],
  };
  const av = availability();
  if (p.id === "obra") {
    const f = p.funciones.find((x) => x.id === b.funcion);
    if (!f) return [400, { error: "Elige una función" }];
    if (!o.buyer.ci) return [400, { error: "Escribe tu CI" }];
    if (qty > av.obra[f.id]) return [409, { error: av.obra[f.id] ? `Solo quedan ${av.obra[f.id]} entradas para esa función.` : "Función agotada." }];
    o.funcion = f.id;
  } else {
    const d = p.delivery.find((x) => x.id === b.delivery);
    if (!d) return [400, { error: "Elige la forma de entrega" }];
    if (d.needsAddress && o.buyer.addr.length < 5) return [400, { error: "Escribe la dirección de envío" }];
    if (qty > av.libro) return [409, { error: "No quedan libros suficientes." }];
    o.delivery = d.id;
  }
  do o.id = "ST-" + rnd(5);
  while (db.orders[o.id]);
  o.history.push({ at: o.createdAt, s: "nuevo", by: "cliente", note: "Pedido creado en la web" });
  db.orders[o.id] = o;
  save();
  return [201, { ...publicOrder(o), key: o.key }];
});

route("GET", /^\/api\/orders\/(ST-[A-Z0-9]{5})$/, (m, b, req, url) => {
  const o = db.orders[m[1]];
  if (!o || url.searchParams.get("k") !== o.key) return [404, { error: "Pedido no encontrado" }];
  return [200, publicOrder(expire(o))];
});

route("POST", /^\/api\/leads$/, (m, b, req) => {
  if (limited(req, "l", 20)) return [429, { error: "Intenta más tarde" }];
  const phone = String(b.phone || "").replace(/\D/g, "");
  const name = String(b.name || "").trim().slice(0, 80);
  if (name.length < 2 || phone.length < 7) return [400, { error: "Escribe tu nombre y tu número de WhatsApp" }];
  const full = phone.length === 8 ? "591" + phone : phone; // número boliviano sin código
  const interest = ["podcast", "obra", "libro"].includes(b.interest) ? b.interest : "podcast";
  if (!db.leads.some((l) => l.phone === full && l.interest === interest)) {
    db.leads.push({ at: now(), name, phone: full, interest, source: String(b.source || "directo").slice(0, 40) });
    save();
  }
  return [201, { ok: true }];
});

route("GET", /^\/api\/tickets\/(SOT-[A-Z0-9-]{14})$/, (m, b, req) => {
  const o = allOrders().find((x) => x.ticket?.code === m[1]);
  if (!o || o.product !== "obra") return [404, { valid: false, error: "Entrada no encontrada" }];
  const f = funcionOf(o);
  const admin = !!adminOf(req);
  const parts = o.buyer.n.split(" ");
  return [
    200,
    {
      valid: o.status === "pagado",
      code: o.ticket.code,
      order: o.id,
      titulo: PRODUCTS.obra.t,
      fecha: fechaLarga(f.d, f.h),
      lugar: PRODUCTS.obra.venue,
      addr: PRODUCTS.obra.addr,
      qty: o.qty,
      checkedIn: o.ticket.checkedIn,
      nombre: admin ? o.buyer.n : parts[0] + (parts[1] ? " " + parts[1][0] + "." : ""),
      ci: admin ? o.buyer.ci : "",
      admin,
    },
  ];
});

/* ---------- webhook de WhatsApp (Meta) ---------- */
route("GET", /^\/api\/whatsapp\/webhook$/, (m, b, req, url) => {
  const ok = url.searchParams.get("hub.mode") === "subscribe" && WA.cfg.verifyToken && url.searchParams.get("hub.verify_token") === WA.cfg.verifyToken;
  return ok ? [200, url.searchParams.get("hub.challenge"), "text/plain"] : [403, { error: "Token no válido" }];
});
route("POST", /^\/api\/whatsapp\/webhook$/, async (m, b, req, url, raw) => {
  if (!WA.verifySignature(raw, req.headers["x-hub-signature-256"])) return [401, { error: "Firma no válida" }];
  /* Se responde a Meta enseguida y se procesa después */
  setImmediate(async () => {
    for (const msg of WA.parseWebhook(b)) {
      try {
        if (msg.mediaId) Object.assign(msg, await WA.downloadMedia(msg.mediaId));
        await handleIncoming(msg);
      } catch (e) {
        console.error("Mensaje entrante:", e.message);
      }
    }
  });
  return [200, { ok: true }];
});

/* ---------- panel: sesión ---------- */
route("POST", /^\/api\/admin\/login$/, (m, b, req) => {
  const ip = ipOf(req);
  const f = loginFails.get(ip);
  if (f?.until > now()) return [429, { error: `Demasiados intentos. Espera ${Math.ceil((f.until - now()) / 6e4)} min.` }];
  const name = String(b.name || "").trim().slice(0, 40);
  if (!name) return [400, { error: "Escribe tu nombre" }];
  if (!checkPassword(b.password)) {
    const n = (f?.n || 0) + 1;
    loginFails.set(ip, { n, until: n >= 5 ? now() + 15 * 6e4 : 0 });
    return [401, { error: "Contraseña incorrecta" }];
  }
  loginFails.delete(ip);
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { exp: now() + SESSION_HOURS * 36e5, name });
  return [200, { ok: true, name }, null, { "Set-Cookie": sessionCookie(req, token, SESSION_HOURS * 3600) }];
});
route("POST", /^\/api\/admin\/logout$/, (m, b, req) => {
  sessions.delete(cookies(req).st_admin);
  return [200, { ok: true }, null, { "Set-Cookie": sessionCookie(req, "", 0) }];
});
route("GET", /^\/api\/admin\/me$/, (m, b, req, url, raw, s) => [200, { name: s.name, wa: WA.enabled, publicUrl: PUBLIC_URL, whatsapp: CONTACT.whatsapp }], A);

/* ---------- panel: datos ---------- */
route("GET", /^\/api\/admin\/summary$/, () => [200, summary()], A);
route("GET", /^\/api\/admin\/stats$/, (m, b, req, url) => [200, stats(url.searchParams.get("range"))], A);

route("GET", /^\/api\/admin\/orders$/, (m, b, req, url) => {
  const st = url.searchParams.get("status") || "";
  const q = (url.searchParams.get("q") || "").toLowerCase();
  const list = allOrders()
    .filter((o) => (!st || o.status === st) && (!q || [o.id, o.buyer.n, o.buyer.ci, o.phone, o.waName].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => (st === "comprobante" ? a.proofAt - b.proofAt : b.updatedAt - a.updatedAt))
    .slice(0, 300)
    .map(adminOrder);
  return [200, list];
}, A);

const orderRoute = (method, action, fn) =>
  route(method, new RegExp(`^/api/admin/orders/(ST-[A-Z0-9]{5})${action ? "/" + action : ""}$`), async (m, b, req, url, raw, s) => {
    const o = db.orders[m[1]];
    if (!o) return [404, { error: "Pedido no encontrado" }];
    return fn(expire(o), b, s);
  }, A);

orderRoute("GET", "", (o) => [200, { ...adminOrder(o), messages: o.phone ? db.messages.filter((x) => x.phone === o.phone) : [] }]);
orderRoute("POST", "approve", async (o, b, s) => {
  if (o.status === "pagado") return [409, { error: "Este pedido ya fue aprobado" }];
  if (["cancelado"].includes(o.status)) return [409, { error: "El pedido está cancelado" }];
  await approve(o, s.name);
  return [200, adminOrder(o)];
});
orderRoute("POST", "reject", async (o, b, s) => {
  const reason = String(b.reason || "").trim().slice(0, 200);
  if (!reason) return [400, { error: "Escribe el motivo" }];
  if (o.status === "pagado") return [409, { error: "El pedido ya está pagado" }];
  await reject(o, reason, s.name);
  return [200, adminOrder(o)];
});
orderRoute("POST", "send-qr", async (o, b, s) => {
  if (!o.phone) return [409, { error: "El cliente todavía no escribió por WhatsApp" }];
  if (!qrFile(o.amount) && WA.enabled) return [409, { error: `Primero carga el QR de Bs ${o.amount} en "QR de cobro"` }];
  await sendQR(o, s.name);
  return [200, adminOrder(o)];
});
orderRoute("POST", "cancel", (o, b, s) => {
  if (o.status === "pagado") return [409, { error: "No se puede cancelar un pedido pagado" }];
  touch(o, "cancelado", s.name, String(b.reason || "").slice(0, 200));
  return [200, adminOrder(o)];
});
orderRoute("POST", "delivered", (o, b, s) => {
  o.delivered = b.value !== false ? { at: now(), by: s.name } : null;
  save();
  return [200, adminOrder(o)];
});
orderRoute("POST", "attach", async (o, b, s) => {
  const msg = db.messages.find((x) => x.id === b.messageId && x.media && x.dir === "in");
  if (!msg) return [404, { error: "Imagen no encontrada" }];
  o.phone = o.phone || msg.phone;
  await attachProof(o, msg, s.name);
  return [200, adminOrder(o)];
});

route("GET", /^\/api\/admin\/chats$/, () => [200, chats()], A);
route("GET", /^\/api\/admin\/chats\/(\d+)$/, (m) => {
  db.seen[m[1]] = now();
  save();
  const orders = allOrders().filter((o) => o.phone === m[1]).sort((a, b) => b.createdAt - a.createdAt).map(adminOrder);
  return [200, { messages: db.messages.filter((x) => x.phone === m[1]), orders }];
}, A);
route("POST", /^\/api\/admin\/chats\/(\d+)\/send$/, async (m, b, req, url, raw, s) => {
  const text = String(b.text || "").trim().slice(0, 2000);
  if (!text) return [400, { error: "Mensaje vacío" }];
  const msg = await sendText(m[1], text, { by: s.name });
  return msg.state === "error" ? [502, { error: "WhatsApp: " + msg.error }] : [200, msg];
}, A);

route("GET", /^\/api\/admin\/media\/([\w-]+)$/, (m) => {
  const md = db.media[m[1]];
  if (!md) return [404, { error: "No encontrado" }];
  try {
    return [200, fs.readFileSync(path.join(DIR, md.file)), md.mime];
  } catch {
    return [404, { error: "Archivo no encontrado" }];
  }
}, A);

/* QR de cobro */
route("GET", /^\/api\/admin\/qr$/, () => [200, QR_AMOUNTS.map((a) => ({ amount: a, ok: !!qrFile(a) }))], A);
route("GET", /^\/api\/admin\/qr\/(\d+)$/, (m) => {
  const q = qrFile(+m[1]);
  return q ? [200, fs.readFileSync(q.file), q.mime] : [404, { error: "Sin QR" }];
}, A);
route("POST", /^\/api\/admin\/qr\/(\d+)$/, async (m, b) => {
  const amount = +m[1];
  if (!QR_AMOUNTS.includes(amount)) return [400, { error: "Monto no usado en la página" }];
  const f = parseDataUrl(b.dataUrl);
  if (!f || f.mime === "application/pdf") return [400, { error: "Sube una imagen PNG, JPG o WEBP" }];
  for (const ext of [".png", ".jpg", ".webp"]) fs.rmSync(path.join(QR_DIR, amount + ext), { force: true });
  fs.writeFileSync(path.join(QR_DIR, amount + EXT[f.mime].replace(".jpeg", ".jpg")), f.buffer);
  /* Pedidos que esperaban este QR: se envía ahora */
  for (const o of allOrders().filter((x) => x.status === "esperando_qr" && x.amount === amount && x.phone)) await sendQR(o, "sistema");
  return [200, { ok: true }];
}, { admin: true, big: true });
route("POST", /^\/api\/admin\/qr\/(\d+)\/delete$/, (m) => {
  for (const ext of [".png", ".jpg", ".webp"]) fs.rmSync(path.join(QR_DIR, m[1] + ext), { force: true });
  return [200, { ok: true }];
}, A);

/* CRM y exportación */
route("GET", /^\/api\/admin\/crm$/, () => [200, customers()], A);
route("GET", /^\/api\/admin\/export\/clientes\.csv$/, () => {
  const out = csv(customers(), [
    ["Nombre", (c) => c.name], ["WhatsApp", (c) => c.phone], ["CI", (c) => c.ci], ["Correo", (c) => c.email], ["Dirección", (c) => c.address],
    ["Interés", (c) => c.interests.join(", ")], ["Origen", (c) => c.sources.join(", ")], ["Pedidos", (c) => c.orders], ["Pagados", (c) => c.paid],
    ["Entradas", (c) => c.tickets], ["Libros", (c) => c.books], ["Total Bs", (c) => c.spent], ["Primer contacto", (c) => fmtTs(c.first)], ["Último contacto", (c) => fmtTs(c.last)],
  ]);
  return [200, out, "text/csv; charset=utf-8", { "Content-Disposition": 'attachment; filename="clientes.csv"' }];
}, A);
route("GET", /^\/api\/admin\/export\/pedidos\.csv$/, () => {
  const list = allOrders().sort((a, b) => a.createdAt - b.createdAt);
  const out = csv(list, [
    ["Pedido", (o) => o.id], ["Fecha", (o) => fmtTs(o.createdAt)], ["Estado", (o) => STATUS[o.status]], ["Producto", (o) => PRODUCTS[o.product].t],
    ["Función / entrega", (o) => (funcionOf(o) ? fechaLarga(funcionOf(o).d, funcionOf(o).h) : PRODUCTS.libro.delivery.find((d) => d.id === o.delivery)?.n)],
    ["Cantidad", (o) => o.qty], ["Monto Bs", (o) => o.amount], ["Nombre", (o) => o.buyer.n], ["CI", (o) => o.buyer.ci], ["WhatsApp", (o) => o.phone],
    ["Correo", (o) => o.buyer.em], ["Dirección", (o) => o.buyer.addr], ["Origen", (o) => o.source?.src], ["Campaña", (o) => o.source?.campaign],
    ["Entrada", (o) => o.ticket?.code], ["Validado por", (o) => o.validatedBy], ["Pagado", (o) => fmtTs(o.paidAt)],
  ]);
  return [200, out, "text/csv; charset=utf-8", { "Content-Disposition": 'attachment; filename="pedidos.csv"' }];
}, A);

/* Puerta */
route("POST", /^\/api\/admin\/tickets\/(SOT-[A-Z0-9-]{14})\/checkin$/, (m, b, req, url, raw, s) => {
  const o = allOrders().find((x) => x.ticket?.code === m[1]);
  if (!o || o.status !== "pagado") return [404, { error: "Entrada no válida" }];
  const t = o.ticket;
  if (t.checkedIn >= o.qty) return [409, { error: `Esta entrada ya se usó por completo (${o.qty} de ${o.qty})` }];
  t.checkedIn++;
  o.history.push({ at: now(), s: "ingreso", by: s.name, note: `Ingreso ${t.checkedIn} de ${o.qty}` });
  save();
  return [200, { ok: true, checkedIn: t.checkedIn, qty: o.qty, nombre: o.buyer.n }];
}, A);

/* Simulador de WhatsApp (solo sin WhatsApp real) */
route("POST", /^\/api\/admin\/sim\/incoming$/, async (m, b) => {
  if (WA.enabled) return [403, { error: "El simulador se desactiva con WhatsApp real conectado" }];
  const from = String(b.from || "").replace(/\D/g, "");
  if (from.length < 8) return [400, { error: "Número no válido" }];
  const f = b.dataUrl ? parseDataUrl(b.dataUrl) : null;
  if (b.dataUrl && !f) return [400, { error: "Solo imágenes o PDF" }];
  await handleIncoming({ from, name: String(b.name || "").slice(0, 60), text: String(b.text || "").slice(0, 2000), buffer: f?.buffer, mime: f?.mime, waMsgId: "sim-" + crypto.randomUUID() });
  return [200, { messages: db.messages.filter((x) => x.phone === from) }];
}, { admin: true, big: true });
route("GET", /^\/api\/admin\/sim\/(\d+)$/, (m) => [200, { messages: db.messages.filter((x) => x.phone === m[1]) }], A);

/* =====================================================================
   SERVIDOR HTTP
   ===================================================================== */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8" };
const PRIVATE = /^\/(server|\.git|node_modules)(\/|$)|\/\./;

function send(res, code, body, type, headers = {}) {
  const isBuf = Buffer.isBuffer(body) || typeof body === "string";
  res.writeHead(code, { "Content-Type": type || (isBuf ? "text/plain; charset=utf-8" : "application/json; charset=utf-8"), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("too large"), { code: 413 }));
        req.destroy();
      } else parts.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(parts);
      let json = {};
      try {
        json = raw.length ? JSON.parse(raw.toString("utf8")) : {};
      } catch {}
      resolve({ raw, json });
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    for (const r of routes) {
      const m = url.pathname.match(r.re);
      if (!m || req.method !== r.method) continue;
      let s = null;
      if (r.admin && !(s = adminOf(req))) return send(res, 401, { error: "Inicia sesión" });
      try {
        const { raw, json } = req.method === "POST" ? await readBody(req, r.big ? 12e6 : 1e6) : { raw: Buffer.alloc(0), json: {} };
        const [code, out, type, headers] = await r.fn(m, json, req, url, raw, s);
        return send(res, code, out, type, headers);
      } catch (e) {
        if (e.code === 413) return send(res, 413, { error: "Archivo demasiado grande (máx. 8 MB)" });
        console.error(e);
        return send(res, 500, { error: "Error interno" });
      }
    }
    return send(res, 404, { error: "Ruta no encontrada" });
  }
  /* archivos de la página */
  let p;
  try {
    p = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, "Ruta no válida");
  }
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT + path.sep) || PRIVATE.test(p.replace(/\\/g, "/"))) return send(res, 404, "No encontrado");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "No encontrado");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    res.end(buf);
  });
});

setInterval(() => allOrders(), 5 * 6e4); // vence pedidos abandonados

if (require.main === module) {
  if (!credential()) {
    const pw = rnd(4) + "-" + rnd(4) + "-" + rnd(4);
    writeCredential(pw);
    console.log("\n┌──────────────────────────────────────────────┐");
    console.log(`│  Contraseña del panel: ${pw.padEnd(22)}│`);
    console.log("│  Guárdala. Cámbiala con:                     │");
    console.log("│  node server/set-password.js                 │");
    console.log("└──────────────────────────────────────────────┘\n");
  }
  server.listen(PORT, () => {
    console.log(`SOTIRIA → ${PUBLIC_URL}`);
    console.log(`Panel   → ${PUBLIC_URL}/admin.html`);
    console.log(WA.enabled ? "WhatsApp: conectado a la API de Meta" : "WhatsApp: MODO SIMULADOR (configura WA_TOKEN y WA_PHONE_ID para usar el real)");
    const miss = QR_AMOUNTS.filter((a) => !qrFile(a));
    if (miss.length) console.log(`Faltan ${miss.length} QR de cobro: cárgalos en el panel → "QR de cobro".`);
  });
}

module.exports = { server, writeCredential };
