/* =====================================================================
   Ventas de DEMOSTRACIÓN para probar el panel (Estadísticas, Clientes).

   Uso (con el servidor DETENIDO, porque escribe en server/db.json):
     node server/seed.js            → crea ~45 días de ventas de prueba
     node server/seed.js 90         → crea 90 días
     node server/seed.js --clear    → borra solo las ventas de prueba

   Las ventas de prueba quedan marcadas con "demo: true" y el panel
   muestra un aviso mientras existan. Ocupan cupos de las funciones,
   así que bórralas antes de empezar a vender de verdad.
   ===================================================================== */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PRODUCTS } = require("../js/data.js");

const DB_FILE = path.join(__dirname, "db.json");
let db = { orders: {}, messages: [], media: {}, leads: [], seen: {}, greeted: {} };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
} catch {}
const save = () => fs.writeFileSync(DB_FILE, JSON.stringify(db));

if (process.argv.includes("--clear")) {
  let n = 0;
  for (const [id, o] of Object.entries(db.orders))
    if (o.demo) {
      delete db.orders[id];
      n++;
    }
  db.leads = db.leads.filter((l) => !l.demo);
  save();
  console.log(`✓ Se borraron ${n} ventas de prueba. Las ventas reales no se tocaron.`);
  process.exit(0);
}

const days = Math.max(1, Math.min(365, parseInt(process.argv[2], 10) || 45));
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const rnd = (n) => Array.from(crypto.randomBytes(n), (b) => ABC[b % 32]).join("");
const pick = (w) => {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0) return k;
  return Object.keys(w)[0];
};

/* Preferencias inventadas para que los gráficos tengan forma realista */
const WEEKDAY_W = [0.55, 0.6, 0.75, 0.95, 1.5, 1.85, 1.1]; // lunes … domingo
const SRC_W = { instagram: 0.42, tiktok: 0.3, facebook: 0.2, directo: 0.08 };
const QTY_W = { 1: 0.3, 2: 0.42, 3: 0.14, 4: 0.14 };
const NAMES = ["Ana Pérez", "Luis Rojas", "María Suárez", "Carlos Vaca", "Lucía Justiniano", "Jorge Áñez", "Paola Montero", "Diego Rivero", "Camila Saucedo", "Andrés Parada", "Valeria Gutiérrez", "Rodrigo Chávez"];
const VALIDATORS = ["Valeria", "Jorge"];

const now = Date.now();
let n = 0;
for (let d = days; d >= 0; d--) {
  const base = now - d * 864e5;
  const wd = (new Date(base - 4 * 36e5).getUTCDay() + 6) % 7;
  const count = Math.round((2 + Math.random() * 4) * WEEKDAY_W[wd] * (1 + (days - d) / days)); // crece hacia el estreno
  for (let i = 0; i < count; i++) {
    const isBook = Math.random() < 0.18;
    const p = isBook ? PRODUCTS.libro : PRODUCTS.obra;
    const qty = isBook ? 1 : +pick(QTY_W);
    const t = base - Math.floor(Math.random() * 10 * 36e5);
    if (t > now) continue;
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    let id;
    do id = "ST-" + rnd(5);
    while (db.orders[id]);
    db.orders[id] = {
      id,
      key: crypto.randomBytes(16).toString("hex"),
      product: p.id,
      funcion: isBook ? null : PRODUCTS.obra.funciones[Math.random() < 0.6 ? 0 : 1].id,
      delivery: isBook ? (Math.random() < 0.5 ? "retiro" : "envio") : null,
      qty,
      amount: p.price * qty,
      buyer: { n: name, ci: String(1000000 + Math.floor(Math.random() * 8999999)), em: "", addr: "" },
      source: { src: pick(SRC_W), campaign: "" },
      status: "pagado",
      phone: "5917" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0"),
      createdAt: t - 20 * 6e4,
      updatedAt: t,
      paidAt: t,
      validatedBy: VALIDATORS[i % 2],
      ticket: { code: `SOT-${rnd(4)}-${rnd(4)}-${rnd(4)}`, issuedAt: t, checkedIn: 0 },
      history: [{ at: t, s: "pagado", by: "demo", note: "Venta de prueba" }],
      demo: true,
    };
    n++;
  }
}
save();
console.log(`✓ Se crearon ${n} ventas de prueba en ${days} días. Bórralas con: node server/seed.js --clear`);
