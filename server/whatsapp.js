/* =====================================================================
   WHATSAPP (API oficial de WhatsApp Business / Meta Cloud API)
   ---------------------------------------------------------------------
   Con estas variables de entorno se usa WhatsApp real:
     WA_TOKEN         token de acceso permanente (usuario del sistema)
     WA_PHONE_ID      "Phone number ID" del número de ventas
     WA_VERIFY_TOKEN  texto que inventas y pones también en Meta al
                      registrar el webhook
     WA_APP_SECRET    "App secret" de la app de Meta (comprueba que los
                      avisos vienen de verdad de Meta)

   Sin ellas funciona en MODO SIMULADOR: los mensajes se guardan y se
   prueban desde el panel (pestaña "Simulador").
   Guía paso a paso: WHATSAPP.md
   ===================================================================== */
const crypto = require("crypto");

const GRAPH = "https://graph.facebook.com/v21.0";
const cfg = {
  token: process.env.WA_TOKEN || "",
  phoneId: process.env.WA_PHONE_ID || "",
  verifyToken: process.env.WA_VERIFY_TOKEN || "",
  appSecret: process.env.WA_APP_SECRET || "",
};
const enabled = !!(cfg.token && cfg.phoneId);

async function graph(path, opts = {}) {
  const r = await fetch(GRAPH + path, {
    ...opts,
    headers: { Authorization: `Bearer ${cfg.token}`, ...(opts.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `WhatsApp respondió ${r.status}`);
  return j;
}

/* ---------- enviar ---------- */
async function sendText(to, body) {
  if (!enabled) return { id: "sim-" + crypto.randomUUID() };
  const j = await graph(`/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: true } }),
  });
  return { id: j.messages?.[0]?.id };
}

async function sendImage(to, buffer, mime, caption) {
  if (!enabled) return { id: "sim-" + crypto.randomUUID() };
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([buffer], { type: mime }), mime === "image/png" ? "imagen.png" : "imagen.jpg");
  const up = await graph(`/${cfg.phoneId}/media`, { method: "POST", body: form });
  const j = await graph(`/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "image", image: { id: up.id, caption } }),
  });
  return { id: j.messages?.[0]?.id };
}

/* ---------- recibir ---------- */
function verifySignature(rawBody, header) {
  if (!cfg.appSecret) return true; // sin secreto configurado no se puede verificar
  const expected = "sha256=" + crypto.createHmac("sha256", cfg.appSecret).update(rawBody).digest("hex");
  const got = String(header || "");
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function downloadMedia(mediaId) {
  const info = await graph(`/${mediaId}`);
  const r = await fetch(info.url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!r.ok) throw new Error("No se pudo descargar el archivo de WhatsApp");
  return { buffer: Buffer.from(await r.arrayBuffer()), mime: info.mime_type };
}

/** Convierte el aviso de Meta en una lista de mensajes simples. */
function parseWebhook(body) {
  const out = [];
  for (const entry of body.entry || [])
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        const media = m.image || m.document || null;
        out.push({
          waMsgId: m.id,
          from: m.from,
          name: names[m.from] || "",
          type: m.type,
          text: m.text?.body || media?.caption || "",
          mediaId: media?.id || null,
          mime: media?.mime_type || null,
          filename: m.document?.filename || null,
        });
      }
    }
  return out;
}

module.exports = { enabled, cfg, sendText, sendImage, verifySignature, downloadMedia, parseWebhook };
