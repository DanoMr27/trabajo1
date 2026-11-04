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
];

/* ---------------- servidor HTTP ---------------- */
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".ico": "image/x-icon" };
const PRIVATE = /^\/(server|\.git)(\/|$)/;

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
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
            const [code, out] = await fn(m, body, req);
            return send(res, code, out);
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
  });
