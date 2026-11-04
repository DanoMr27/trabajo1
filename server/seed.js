/* =====================================================================
   Ventas de DEMOSTRACIÓN para probar el panel del propietario.

   Uso (con el servidor DETENIDO, porque escribe en server/db.json):
     node server/seed.js            → crea ~75 días de ventas de prueba
     node server/seed.js 120        → crea 120 días
     node server/seed.js --clear    → borra solo las ventas de prueba

   Las ventas de prueba quedan marcadas con "demo: true" y el panel
   muestra un aviso mientras existan. Ocupan cupos de las funciones,
   así que bórralas antes de empezar a vender de verdad.
   ===================================================================== */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const DATA = require("../js/data.js");

const DB_FILE = path.join(__dirname, "db.json");
const TZ_OFFSET_H = process.env.TZ_OFFSET_H != null ? +process.env.TZ_OFFSET_H : -4;
const OFF = TZ_OFFSET_H * 36e5;
const DAY = 864e5;

let db = { orders: {}, tickets: {} };
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
} catch {}

const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

if (process.argv.includes("--clear")) {
  let n = 0;
  for (const [id, o] of Object.entries(db.orders)) {
    if (!o.demo) continue;
    if (o.ticket) delete db.tickets[o.ticket.code];
    delete db.orders[id];
    n++;
  }
  save();
  console.log(`✓ Se borraron ${n} ventas de prueba. Las ventas reales no se tocaron.`);
  process.exit(0);
}

const days = Math.max(1, Math.min(365, parseInt(process.argv[2], 10) || 75));
const rid = (p, n = 6) => p + "-" + Array.from(crypto.randomBytes(n), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
const pick = (weights) => {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(weights)) if ((r -= w) <= 0) return k;
  return Object.keys(weights)[0];
};

/* Preferencias inventadas para que los gráficos tengan forma realista */
const VENUE_W = { sotiria: 1.4, palmeras: 1, norte: 1.2, cristo: 0.6 };
const WEEKDAY_W = [0.55, 0.6, 0.75, 0.95, 1.5, 1.85, 1.1]; // lunes … domingo
const ZONE_W = { general: 0.6, preferencial: 0.28, vip: 0.12 };
const QTY_W = { 1: 0.3, 2: 0.42, 3: 0.14, 4: 0.14 };
const NAMES = ["Ana Pérez", "Luis Rojas", "María Suárez", "Carlos Vaca", "Lucía Justiniano", "Jorge Áñez", "Paola Montero", "Diego Rivero", "Camila Saucedo", "Andrés Parada", "Valeria Gutiérrez", "Rodrigo Chávez"];

const used = {};
for (const o of Object.values(db.orders))
  if (o.status === "paid" || o.status === "pending") used[o.eventId + ":" + o.zone] = (used[o.eventId + ":" + o.zone] || 0) + o.qty;

const now = Date.now();
const today = Math.floor((now + OFF) / DAY);
let created = 0,
  skipped = 0;

for (let d = today - days + 1; d <= today; d++) {
  const wd = (new Date(d * DAY).getUTCDay() + 6) % 7;
  const growth = 0.6 + 0.8 * ((d - (today - days)) / days); // las ventas crecen hacia la fecha de las funciones
  const n = Math.round(3.2 * WEEKDAY_W[wd] * growth * (0.6 + Math.random() * 0.8));
  for (let i = 0; i < n; i++) {
    const t = d * DAY - OFF + (9 + Math.random() * 14.5) * 36e5; // entre 9:00 y 23:30 hora local
    if (t > now) continue;
    const venue = pick(VENUE_W);
    const evs = DATA.EVENTS.filter((e) => e.venue === venue && new Date(`${e.d}T${e.h}`).getTime() > t);
    if (!evs.length) continue;
    const ev = evs[Math.floor(Math.random() * evs.length)];
    const zone = pick(ZONE_W);
    const z = ev.zones.find((x) => x.id === zone);
    const qty = +pick(QTY_W);
    const key = ev.id + ":" + zone;
    if ((used[key] || 0) + qty > z.cap) {
      skipped++;
      continue;
    }
    used[key] = (used[key] || 0) + qty;
    const method = Math.random() < 0.78 ? "qr" : "card";
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const o = {
      id: rid("ORD"),
      eventId: ev.id,
      venue: ev.venue,
      zone,
      qty,
      amount: z.p * qty,
      buyer: { n: name, ci: String(1000000 + Math.floor(Math.random() * 8999999)), tel: "7" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0"), em: "demo@example.com" },
      method,
      status: "paid",
      demo: true,
      createdAt: t - 60e3,
      expiresAt: t + 14 * 6e4,
    };
    o.ticket = { code: rid("ST", 8), orderId: o.id, eventId: ev.id, zone, qty, amount: o.amount, buyer: o.buyer, method, transactionId: rid("DEMO"), paidAt: new Date(t).toISOString(), checkedIn: 0 };
    db.orders[o.id] = o;
    db.tickets[o.ticket.code] = o.id;
    created++;
  }
}

save();
console.log(`✓ ${created} ventas de prueba creadas en los últimos ${days} días${skipped ? ` (${skipped} omitidas por cupo lleno)` : ""}.`);
console.log("  Bórralas antes de vender de verdad con: node server/seed.js --clear");
