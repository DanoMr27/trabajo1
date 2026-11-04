/* =====================================================================
   SERVIDOR DE ENTRADAS Y PAGOS QR  (Node 18+, sin dependencias)
   ---------------------------------------------------------------------
   Ejecutar:   node server/server.js      → http://localhost:3000

   • Sirve la página web.
   • Crea órdenes, genera el QR de cobro y emite las entradas.
   • Recibe la confirmación de pago de la app/banco por webhook.
   • Permite validar entradas en la puerta.

   Variables de entorno:
     PORT            puerto (3000)
     WEBHOOK_SECRET  clave que debe enviar la app de pagos en el header
                     "X-Webhook-Secret" (¡cámbiala en producción!)
     ALLOW_SIMULATE  "1" permite el botón "simular pago" (por defecto
                     activo salvo NODE_ENV=production)
     CORS_ORIGIN     dominio permitido si la web está en otro servidor
     ADMIN_PASSWORD  contraseña del panel del propietario (alternativa a
                     crearla con: node server/set-password.js)
     TZ_OFFSET_H     zona horaria para las estadísticas (Bolivia: -4)

   Los datos se guardan en server/db.json. Para producción conviene
   pasar a una base de datos real (PostgreSQL, MySQL, etc.).
   ===================================================================== */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const DATA = require("../js/data.js");

const PORT = +process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");
const DB_FILE = path.join(__dirname, "db.json");
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "cambia-esta-clave";
const ALLOW_SIMULATE = process.env.ALLOW_SIMULATE
  ? process.env.ALLOW_SIMULATE === "1"
  : process.env.NODE_ENV !== "production";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
const QR_MINUTES = 15;

/* ---------------- almacenamiento simple en JSON ---------------- */
let db = { orders: {}, tickets: {} };
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
} catch {}
let saveTimer;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), () => {}), 50);
};

const rid = (p, n = 6) =>
  p + "-" + Array.from(crypto.randomBytes(n), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

function expire(o) {
  if (o.status === "pending" && Date.now() > o.expiresAt) {
    o.status = "expired";
    save();
  }
  return o;
}

/* Entradas restantes = cupo − pagadas − reservadas por QR vigentes */
function availability(eventId) {
  const ev = DATA.EVENTS.find((e) => e.id === eventId);
  if (!ev) return null;
  const used = {};
  for (const o of Object.values(db.orders)) {
    expire(o);
    if (o.eventId === eventId && (o.status === "paid" || o.status === "pending"))
      used[o.zone] = (used[o.zone] || 0) + o.qty;
  }
  return Object.fromEntries(ev.zones.map((z) => [z.id, Math.max(0, z.cap - (used[z.id] || 0))]));
}

/* ---------------------------------------------------------------
   PUNTO DE INTEGRACIÓN CON EL BANCO / APP DE PAGOS
   Aquí se pide al banco un QR por el monto exacto. Reemplaza el cuerpo
   por la llamada a la API de tu banco o app (devuelve el texto o la
   imagen del QR y el id de transacción del banco).
   --------------------------------------------------------------- */
async function createBankQR(order) {
  return {
    payload: `SOTIRIA|${order.id}|BOB|${order.amount.toFixed(2)}|${order.eventId}-${order.zone}x${order.qty}`,
    image: null, // si el banco devuelve una imagen (base64/URL), ponla aquí
    bankRef: null,
  };
}

function issueTicket(o, method, transactionId) {
  if (o.status === "paid") return o.ticket;
  o.status = "paid";
  o.ticket = {
    code: rid("ST", 8),
    orderId: o.id,
    eventId: o.eventId,
    zone: o.zone,
    qty: o.qty,
    amount: o.amount,
    buyer: o.buyer,
    method,
    transactionId: transactionId || null,
    paidAt: new Date().toISOString(),
    checkedIn: 0,
  };
  db.tickets[o.ticket.code] = o.id;
  save();
  /* TODO: enviar la entrada por correo / WhatsApp al comprador */
  return o.ticket;
}

/* =====================================================================
   PANEL DEL PROPIETARIO: acceso con contraseña + estadísticas
   ===================================================================== */
const ADMIN_FILE = path.join(__dirname, "admin.json");
const TZ_OFFSET_H = process.env.TZ_OFFSET_H != null ? +process.env.TZ_OFFSET_H : -4;
const SESSION_HOURS = 8;
const sessions = new Map(); // token -> vence (ms)
const loginFails = new Map(); // ip -> { n, first, until }

function adminCredential() {
  if (process.env.ADMIN_PASSWORD) return { plain: process.env.ADMIN_PASSWORD };
  try {
    return JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
  } catch {
    return null;
  }
}

function checkPassword(pw) {
  const c = adminCredential();
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

function readCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function isAdmin(req) {
  const token = readCookies(req).st_admin;
  const exp = token && sessions.get(token);
  if (exp && exp > Date.now()) return true;
  if (token) sessions.delete(token);
  return false;
}

function sessionCookie(req, token, maxAge) {
  const https = req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
  return `st_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${https ? "; Secure" : ""}`;
}

/* --- estadísticas (todas las fechas en hora local de Bolivia) --- */
const DAY = 864e5;
const OFF = TZ_OFFSET_H * 36e5;
const localDay = (ts) => Math.floor((ts + OFF) / DAY); // número de día local
const dayStart = (d) => d * DAY - OFF; // instante en que empieza ese día local
const dayKey = (d) => new Date(d * DAY).toISOString().slice(0, 10);
const weekdayOf = (ts) => (new Date(ts + OFF).getUTCDay() + 6) % 7; // 0 = lunes
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const empty = () => ({ revenue: 0, tickets: 0, orders: 0 });
const add = (g, o) => ((g.revenue += o.amount), (g.tickets += o.qty), g.orders++, g);

function stats(range) {
  const now = Date.now();
  const end = now + 1;
  const today = localDay(now);
  const lt = new Date(now + OFF);
  const paid = Object.values(db.orders)
    .filter((o) => o.status === "paid" && o.ticket)
    .map((o) => ({ ...o, t: Date.parse(o.ticket.paidAt) }));
  const between = (a, b) => paid.filter((o) => o.t >= a && o.t < b);
  const sum = (list) => list.reduce(add, empty());

  /* Períodos: se comparan con el mismo tramo del período anterior
     (hoy hasta esta hora vs. ayer hasta esta hora, etc.) */
  const startDay = dayStart(today);
  const startWeek = dayStart(today - weekdayOf(now));
  const startMonth = Date.UTC(lt.getUTCFullYear(), lt.getUTCMonth(), 1) - OFF;
  const prevMonth = Date.UTC(lt.getUTCFullYear(), lt.getUTCMonth() - 1, 1) - OFF;
  const period = (start, prevStart) => ({
    ...sum(between(start, end)),
    prev: sum(between(prevStart, Math.min(prevStart + (end - start), start))),
  });
  const kpis = {
    day: period(startDay, startDay - DAY),
    week: period(startWeek, startWeek - 7 * DAY),
    month: period(startMonth, prevMonth),
  };

  const trend = [];
  for (let d = today - 29; d <= today; d++) trend.push({ day: dayKey(d), ...sum(between(dayStart(d), dayStart(d + 1))) });

  const RANGES = { day: startDay, week: startWeek, month: startMonth, d30: dayStart(today - 29), d90: dayStart(today - 89), all: 0 };
  const r = Object.hasOwn(RANGES, range) ? range : "month";
  const sel = between(RANGES[r], end);

  const evById = new Map(DATA.EVENTS.map((e) => [e.id, e]));
  const group = (keys, keyOf) => {
    const m = new Map(keys.map((k) => [k, empty()]));
    for (const o of sel) {
      const k = keyOf(o);
      if (!m.has(k)) m.set(k, empty());
      add(m.get(k), o);
    }
    return m;
  };
  const venueName = (id) => DATA.VENUES.find((v) => v.id === id)?.n || id;
  const zoneName = (id) => ({ general: "General", preferencial: "Preferencial", vip: "VIP" })[id] || id;

  const byVenue = [...group(DATA.VENUES.map((v) => v.id), (o) => o.venue || evById.get(o.eventId)?.venue)].map(([id, g]) => ({ id, name: venueName(id), ...g }));
  const byZone = [...group(["general", "preferencial", "vip"], (o) => o.zone)].map(([id, g]) => ({ id, name: zoneName(id), ...g }));
  const byCategory = [...group(Object.keys(DATA.CATEGORIES), (o) => evById.get(o.eventId)?.cat || "otro")]
    .map(([id, g]) => ({ id, name: DATA.CATEGORIES[id]?.n || "Otro", ...g }))
    .filter((c) => c.orders || DATA.EVENTS.some((e) => e.cat === c.id));
  const byWeekday = [...group([0, 1, 2, 3, 4, 5, 6], (o) => weekdayOf(o.t))].map(([i, g]) => ({ id: i, name: WEEKDAYS[i], ...g }));
  const byMethod = [...group(["qr", "card"], (o) => o.method || o.ticket.method)].map(([id, g]) => ({ id, name: id === "qr" ? "QR" : "Tarjeta", ...g }));
  const topEvents = [...group([], (o) => o.eventId)]
    .map(([id, g]) => {
      const e = evById.get(id);
      return { id, name: e ? e.t : "(evento eliminado)", venue: e ? venueName(e.venue) : "", date: e ? `${e.d} ${e.h}` : "", ...g };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  const recent = [...sel]
    .sort((a, b) => b.t - a.t)
    .slice(0, 12)
    .map((o) => ({
      paidAt: o.ticket.paidAt,
      code: o.ticket.code,
      event: evById.get(o.eventId)?.t || "(evento eliminado)",
      venue: venueName(o.venue || evById.get(o.eventId)?.venue),
      zone: zoneName(o.zone),
      qty: o.qty,
      amount: o.amount,
      method: o.method,
      buyer: o.buyer?.n || "",
    }));

  return {
    generatedAt: new Date(now).toISOString(),
    tzOffset: TZ_OFFSET_H,
    range: r,
    demo: paid.some((o) => o.demo),
    kpis,
    trend,
    total: sum(sel),
    byVenue,
    byZone,
    byCategory,
    byWeekday,
    byMethod,
    topEvents,
    recent,
  };
}

const publicOrder = (o) => ({
  id: o.id,
  status: o.status,
  amount: o.amount,
  currency: "BOB",
  qr: o.qr,
  expiresAt: o.expiresAt,
  ticket: o.status === "paid" ? o.ticket : undefined,
});

/* ---------------- rutas de la API ---------------- */
const routes = [
  ["GET", /^\/api\/health$/, () => [200, { ok: true, simulate: ALLOW_SIMULATE }]],

  ["GET", /^\/api\/events\/(\d+)\/availability$/, (m) => {
    const a = availability(+m[1]);
    return a ? [200, a] : [404, { error: "Evento no encontrado" }];
  }],

  ["POST", /^\/api\/orders$/, async (m, body) => {
    const { eventId, zone, qty, buyer = {}, method } = body;
    const ev = DATA.EVENTS.find((e) => e.id === +eventId);
    const z = ev && ev.zones.find((z) => z.id === zone);
    const n = Math.floor(+qty);
    if (!z) return [400, { error: "Evento o zona no válidos" }];
    if (!(n >= 1 && n <= 10)) return [400, { error: "Cantidad no válida (1 a 10)" }];
    if (!buyer.n || !buyer.em) return [400, { error: "Faltan los datos del comprador" }];
    const left = availability(ev.id)[zone];
    if (n > left) return [409, { error: left ? `Solo quedan ${left} entradas en esa zona.` : "Zona agotada." }];
    const o = {
      id: rid("ORD"),
      eventId: ev.id,
      venue: ev.venue,
      zone,
      qty: n,
      amount: z.p * n, // el precio SIEMPRE lo calcula el servidor
      buyer: { n: String(buyer.n).slice(0, 80), ci: String(buyer.ci || "").slice(0, 20), tel: String(buyer.tel || "").slice(0, 20), em: String(buyer.em).slice(0, 120) },
      method: method === "card" ? "card" : "qr",
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + QR_MINUTES * 6e4,
    };
    if (o.method === "qr") {
      const q = await createBankQR(o);
      o.qr = { payload: q.payload, image: q.image, expiresAt: o.expiresAt };
      o.bankRef = q.bankRef;
    }
    db.orders[o.id] = o;
    save();
    return [201, publicOrder(o)];
  }],

  ["GET", /^\/api\/orders\/([\w-]+)$/, (m) => {
    const o = db.orders[m[1]];
    return o ? [200, publicOrder(expire(o))] : [404, { error: "Orden no encontrada" }];
  }],

  /* Tarjeta: aquí va la llamada a la pasarela (por ahora aprueba si los datos son válidos) */
  ["POST", /^\/api\/orders\/([\w-]+)\/card$/, (m, body) => {
    const o = db.orders[m[1]];
    if (!o) return [404, { error: "Orden no encontrada" }];
    if (expire(o).status === "expired") return [410, { error: "La orden venció, vuelve a intentarlo." }];
    if (!/^\d{13,19}$/.test(String(body.number || "").replace(/\s/g, "")))
      return [402, { error: "Tarjeta rechazada" }];
    issueTicket(o, "card", rid("CARD"));
    return [200, publicOrder(o)];
  }],

  /* Solo para pruebas: simula que el banco confirmó el pago */
  ["POST", /^\/api\/orders\/([\w-]+)\/simulate$/, (m) => {
    if (!ALLOW_SIMULATE) return [403, { error: "Simulación desactivada" }];
    const o = db.orders[m[1]];
    if (!o) return [404, { error: "Orden no encontrada" }];
    if (expire(o).status === "expired") return [410, { error: "La orden venció" }];
    issueTicket(o, "qr", rid("SIM"));
    return [200, publicOrder(o)];
  }],

  /* WEBHOOK: la app de pagos / banco avisa que el QR fue pagado */
  ["POST", /^\/api\/webhooks\/qr$/, (m, body, req) => {
    const sent = String(req.headers["x-webhook-secret"] || "");
    const ok = sent.length === WEBHOOK_SECRET.length && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(WEBHOOK_SECRET));
    if (!ok) return [401, { error: "Firma no válida" }];
    const o = db.orders[body.orderId];
    if (!o) return [404, { error: "Orden no encontrada" }];
    if (body.status === "paid") {
      if (Math.abs(+body.amount - o.amount) > 0.001) return [400, { error: "El monto no coincide con la orden" }];
      issueTicket(o, "qr", body.transactionId);
    } else if (body.status === "failed" && o.status === "pending") {
      o.status = "failed";
      save();
    }
    return [200, { ok: true, status: o.status }];
  }],

  /* Validación en puerta */
  ["GET", /^\/api\/tickets\/([\w-]+)$/, (m) => {
    const o = db.orders[db.tickets[m[1]]];
    if (!o) return [404, { valid: false, error: "Entrada no encontrada" }];
    const ev = DATA.EVENTS.find((e) => e.id === o.eventId);
    return [200, { valid: true, ticket: o.ticket, event: { t: ev.t, d: ev.d, h: ev.h, venue: ev.venue } }];
  }],

  ["POST", /^\/api\/tickets\/([\w-]+)\/checkin$/, (m, body, req) => {
    if (req.headers["x-webhook-secret"] !== WEBHOOK_SECRET) return [401, { error: "No autorizado" }];
    const o = db.orders[db.tickets[m[1]]];
    if (!o) return [404, { error: "Entrada no encontrada" }];
    const t = o.ticket;
    if (t.checkedIn >= t.qty) return [409, { error: "Esta entrada ya fue usada por completo", ticket: t }];
    t.checkedIn++;
    save();
    return [200, { ok: true, entered: t.checkedIn, of: t.qty }];
  }],

  /* ---------- Panel del propietario ---------- */
  ["GET", /^\/api\/admin\/me$/, (m, body, req) => [200, { auth: isAdmin(req), configured: !!adminCredential() }]],

  ["POST", /^\/api\/admin\/login$/, (m, body, req) => {
    if (!adminCredential()) return [503, { error: "El panel aún no tiene contraseña. En la terminal ejecuta: node server/set-password.js" }];
    const ip = req.socket.remoteAddress || "?";
    const now = Date.now();
    let f = loginFails.get(ip);
    if (f && f.until > now) return [429, { error: `Demasiados intentos. Espera ${Math.ceil((f.until - now) / 6e4)} min.` }];
    if (!checkPassword(body.password)) {
      if (!f || now - f.first > 15 * 6e4) f = { n: 0, first: now, until: 0 };
      if (++f.n >= 5) f.until = now + 15 * 6e4;
      loginFails.set(ip, f);
      return [401, { error: "Contraseña incorrecta." }];
    }
    loginFails.delete(ip);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, now + SESSION_HOURS * 36e5);
    return [200, { ok: true }, { "Set-Cookie": sessionCookie(req, token, SESSION_HOURS * 3600) }];
  }],

  ["POST", /^\/api\/admin\/logout$/, (m, body, req) => {
    sessions.delete(readCookies(req).st_admin);
    return [200, { ok: true }, { "Set-Cookie": sessionCookie(req, "", 0) }];
  }],

  ["GET", /^\/api\/admin\/stats$/, (m, body, req, url) =>
    isAdmin(req) ? [200, stats(url.searchParams.get("range"))] : [401, { error: "Inicia sesión para ver el panel." }]],
];

/* ---------------- servidor HTTP ---------------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".ico": "image/x-icon" };
const PRIVATE = /^\/(server|\.git)(\/|$)/;

function send(res, code, obj, headers = {}) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = "";
    req.on("data", (c) => {
      s += c;
      if (s.length > 1e5) reject(new Error("too large")), req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch {
        resolve({});
      }
    });
  });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (CORS_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      if (req.method === "OPTIONS") return res.writeHead(204).end();
    }
    if (url.pathname.startsWith("/api/")) {
      for (const [method, re, fn] of routes) {
        const m = url.pathname.match(re);
        if (m && req.method === method) {
          try {
            const body = method === "POST" ? await readBody(req) : {};
            const [code, out, headers] = await fn(m, body, req, url);
            return send(res, code, out, headers);
          } catch (e) {
            console.error(e);
            return send(res, 500, { error: "Error interno" });
          }
        }
      }
      return send(res, 404, { error: "Ruta no encontrada" });
    }
    /* archivos estáticos */
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT) || PRIVATE.test(p.replace(/\\/g, "/"))) return res.writeHead(404).end("No encontrado");
    fs.readFile(file, (err, buf) => {
      if (err) return res.writeHead(404).end("No encontrado");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(buf);
    });
  })
  .listen(PORT, () => {
    console.log(`SOTIRIA Tickets → http://localhost:${PORT}`);
    console.log(`Webhook de pagos: POST /api/webhooks/qr  (header X-Webhook-Secret)`);
    if (WEBHOOK_SECRET === "cambia-esta-clave") console.warn("⚠  Define WEBHOOK_SECRET antes de usar en producción.");
    if (ALLOW_SIMULATE) console.log("Modo pruebas: el botón 'Simular pago' está activo.");
    console.log(`Panel del propietario → http://localhost:${PORT}/admin.html`);
    if (!adminCredential()) console.warn("⚠  El panel no tiene contraseña. Créala con: node server/set-password.js");
  });
