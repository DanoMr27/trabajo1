/* =====================================================================
   PAGOS
   ---------------------------------------------------------------------
   La página habla con un único objeto: Payments. Tiene dos modos:

   • "api"  → hay un servidor (server/server.js o el backend de tu app de
              pagos). El servidor crea la orden, genera el QR, recibe la
              confirmación del banco/app (webhook) y emite la entrada.
   • "demo" → no hay servidor: todo ocurre en el navegador para poder
              mostrar la página. El QR es real y escaneable, pero el pago
              se confirma con un botón de simulación.

   Por defecto ("auto") se usa "api" si el servidor responde en
   API_BASE/health; si no, "demo". Contrato completo en PAGOS.md.
   ===================================================================== */
const PAY_CONFIG = {
  mode: "auto", // "auto" | "api" | "demo"
  apiBase: "/api", // si el backend está en otro dominio: "https://pagos.tudominio.com/api"
  pollMs: 2500, // cada cuánto se consulta si el QR ya fue pagado
  qrMinutes: 15, // vigencia del QR
};

const Payments = (() => {
  let mode = "demo",
    canSimulate = true;
  const LS_ORDERS = "st_orders",
    LS_SOLD = "st_sold";

  const read = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  };
  const write = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };

  async function api(path, opts = {}) {
    const r = await fetch(PAY_CONFIG.apiBase + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Error de conexión con el servidor de pagos");
    return j;
  }

  async function init() {
    if (PAY_CONFIG.mode !== "auto") return (mode = PAY_CONFIG.mode);
    if (location.protocol === "file:") return (mode = "demo");
    try {
      const ctl = new AbortController();
      setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(PAY_CONFIG.apiBase + "/health", { signal: ctl.signal });
      const j = r.ok ? await r.json() : null;
      mode = j && j.ok ? "api" : "demo";
      if (mode === "api") canSimulate = !!j.simulate;
    } catch {
      mode = "demo";
    }
    return mode;
  }

  /* ---------- utilidades del modo demo ---------- */
  const rid = (p, n = 6) =>
    p + "-" + Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

  function priceOf(eventId, zoneId, qty) {
    const ev = DATA.EVENTS.find((e) => e.id === eventId);
    const z = ev && ev.zones.find((z) => z.id === zoneId);
    if (!z) throw new Error("Evento o zona no válidos");
    return { ev, z, amount: z.p * qty };
  }

  function qrPayload(o) {
    /* Formato de ejemplo. Al integrar el banco/app, el texto del QR lo
       genera ese servicio (QR interoperable) y se muestra tal cual. */
    return `SOTIRIA|${o.id}|BOB|${o.amount.toFixed(2)}|${o.eventId}-${o.zone}x${o.qty}`;
  }

  function demoTicket(o, method) {
    return {
      code: rid("ST", 8),
      orderId: o.id,
      eventId: o.eventId,
      zone: o.zone,
      qty: o.qty,
      amount: o.amount,
      buyer: o.buyer,
      method,
      paidAt: new Date().toISOString(),
    };
  }

  function markSold(o) {
    const sold = read(LS_SOLD, {});
    const k = o.eventId + ":" + o.zone;
    sold[k] = (sold[k] || 0) + o.qty;
    write(LS_SOLD, sold);
  }

  /* ---------- API pública ---------- */
  return {
    init,
    get mode() {
      return mode;
    },
    /* el botón "Simular pago" solo aparece en demo o si el servidor lo permite */
    get canSimulate() {
      return canSimulate;
    },

    /* Entradas disponibles por zona: { general: 120, vip: 8, ... } */
    async availability(eventId) {
      if (mode === "api") {
        try {
          return await api(`/events/${eventId}/availability`);
        } catch {}
      }
      const ev = DATA.EVENTS.find((e) => e.id === eventId);
      const sold = read(LS_SOLD, {});
      return Object.fromEntries(ev.zones.map((z) => [z.id, Math.max(0, z.cap - (sold[eventId + ":" + z.id] || 0))]));
    },

    /* Crea la orden y devuelve { id, amount, qr: { payload, expiresAt } } */
    async createOrder({ eventId, zone, qty, buyer, method }) {
      if (mode === "api") return api("/orders", { method: "POST", body: { eventId, zone, qty, buyer, method } });
      const { amount } = priceOf(eventId, zone, qty);
      const avail = (await this.availability(eventId))[zone];
      if (qty > avail) throw new Error(`Solo quedan ${avail} entradas en esa zona.`);
      const o = {
        id: rid("ORD"),
        eventId,
        zone,
        qty,
        buyer,
        method,
        amount,
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + PAY_CONFIG.qrMinutes * 6e4,
      };
      o.qr = { payload: qrPayload(o), expiresAt: o.expiresAt };
      const all = read(LS_ORDERS, {});
      all[o.id] = o;
      write(LS_ORDERS, all);
      return o;
    },

    /* Estado de la orden: { status: pending|paid|expired|failed, ticket? } */
    async status(orderId) {
      if (mode === "api") return api(`/orders/${orderId}`);
      const o = read(LS_ORDERS, {})[orderId];
      if (!o) return { status: "failed" };
      if (o.status === "pending" && Date.now() > o.expiresAt) o.status = "expired";
      return { status: o.status, ticket: o.ticket };
    },

    /* Pago con tarjeta: en "api" el servidor llama a la pasarela */
    async payCard(orderId, card) {
      if (mode === "api") return api(`/orders/${orderId}/card`, { method: "POST", body: card });
      await new Promise((r) => setTimeout(r, 1600));
      return this._settle(orderId, "card");
    },

    /* Solo demo/pruebas: simula que el banco confirmó el pago QR */
    async simulatePaid(orderId) {
      if (mode === "api") return api(`/orders/${orderId}/simulate`, { method: "POST" });
      return this._settle(orderId, "qr");
    },

    _settle(orderId, method) {
      const all = read(LS_ORDERS, {});
      const o = all[orderId];
      if (!o) throw new Error("Orden no encontrada");
      if (o.status !== "paid") {
        o.status = "paid";
        o.ticket = demoTicket(o, method);
        markSold(o);
        write(LS_ORDERS, all);
      }
      return { status: o.status, ticket: o.ticket };
    },
  };
})();
