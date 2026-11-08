/* =====================================================================
   WHATSAPP — API oficial de WhatsApp Business (Meta Cloud API)
   ---------------------------------------------------------------------
   Dos modos (variable WHATSAPP_MODE):
     simulator  Los mensajes no salen a WhatsApp: se guardan y se prueban
                desde el panel (pestaña "Simulador"). Es el modo por defecto.
     cloud      WhatsApp real con la Cloud API de Meta.

   Variables (en el archivo .env del servidor; ver .env.example):
     WHATSAPP_ACCESS_TOKEN     token de acceso (temporal o de usuario del sistema)
     WHATSAPP_PHONE_NUMBER_ID  "Phone number ID" del número que envía
     WHATSAPP_WABA_ID          ID de la cuenta de WhatsApp Business (referencia)
     WHATSAPP_VERIFY_TOKEN     texto que inventas y pones igual en Meta (webhook)
     WHATSAPP_GRAPH_VERSION    versión de la API, p. ej. v23.0
     META_APP_SECRET           "Clave secreta de la app" (firma de los avisos)
     WHATSAPP_BUSINESS_NUMBER  número comercial, p. ej. 59177314953

   También se aceptan los nombres anteriores (WA_TOKEN, WA_PHONE_ID,
   WA_VERIFY_TOKEN, WA_APP_SECRET). Guía paso a paso: WHATSAPP.md
   ===================================================================== */
const crypto = require("crypto");

const env = (...names) => names.map((n) => process.env[n]).find((v) => v != null && String(v).trim() !== "") || "";
const version = env("WHATSAPP_GRAPH_VERSION") || "v23.0";
const cfg = {
  token: env("WHATSAPP_ACCESS_TOKEN", "WA_TOKEN"),
  phoneId: env("WHATSAPP_PHONE_NUMBER_ID", "WA_PHONE_ID"),
  wabaId: env("WHATSAPP_WABA_ID"),
  verifyToken: env("WHATSAPP_VERIFY_TOKEN", "WA_VERIFY_TOKEN"),
  appSecret: env("META_APP_SECRET", "WA_APP_SECRET"),
  businessNumber: env("WHATSAPP_BUSINESS_NUMBER").replace(/\D/g, ""),
  version: /^v\d+\.\d+$/.test(version) ? version : "v23.0",
};
/* Solo para pruebas automáticas: permite apuntar a un Graph API falso */
const GRAPH = (env("WHATSAPP_GRAPH_URL") || "https://graph.facebook.com").replace(/\/$/, "") + "/" + cfg.version;

/* Modo: explícito con WHATSAPP_MODE; si no se indica, "cloud" solo si hay token y número */
const requested = env("WHATSAPP_MODE").toLowerCase();
const mode = requested === "cloud" || requested === "simulator" ? requested : cfg.token && cfg.phoneId ? "cloud" : "simulator";
const enabled = mode === "cloud";

/** Problemas de configuración: errores impiden arrancar; avisos solo se muestran */
function configProblems() {
  const errors = [],
    warnings = [];
  if (requested && requested !== "cloud" && requested !== "simulator") warnings.push(`WHATSAPP_MODE="${requested}" no es válido; se usa "${mode}".`);
  if (!enabled) return { errors, warnings };
  if (!cfg.token) errors.push("Falta WHATSAPP_ACCESS_TOKEN.");
  if (!cfg.phoneId) errors.push("Falta WHATSAPP_PHONE_NUMBER_ID.");
  if (!cfg.verifyToken) errors.push("Falta WHATSAPP_VERIFY_TOKEN (sin él Meta no puede verificar el webhook).");
  if (!cfg.appSecret) warnings.push("Falta META_APP_SECRET: no se puede comprobar que los avisos vienen de Meta. Configúralo antes de vender.");
  if (version && version !== cfg.version) warnings.push(`WHATSAPP_GRAPH_VERSION="${version}" no tiene el formato vNN.N; se usa ${cfg.version}.`);
  return { errors, warnings };
}

async function graph(path, opts = {}) {
  const r = await fetch(GRAPH + path, {
    ...opts,
    headers: { Authorization: `Bearer ${cfg.token}`, ...(opts.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = j.error || {};
    const hint =
      e.code === 131047 || /24 hours|re-engagement/i.test(e.message || "")
        ? " (pasaron más de 24 h desde el último mensaje del cliente: pídele que escriba de nuevo)"
        : e.code === 190 || r.status === 401
          ? " (el token venció o no es válido)"
          : e.code === 131030
            ? " (con el número de prueba solo puedes escribir a teléfonos registrados en Meta)"
            : "";
    throw new Error((e.message || `WhatsApp respondió ${r.status}`) + hint);
  }
  return j;
}

/* ---------- comprobar credenciales al arrancar ---------- */
async function checkCredentials() {
  const info = await graph(`/${cfg.phoneId}?fields=display_phone_number,verified_name,quality_rating`);
  const shown = String(info.display_phone_number || "").replace(/\D/g, "");
  return { display: info.display_phone_number, name: info.verified_name, quality: info.quality_rating, matches: !cfg.businessNumber || shown === cfg.businessNumber };
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
  if (!cfg.appSecret) return true; // sin secreto configurado no se puede verificar (se avisa al arrancar)
  const expected = "sha256=" + crypto.createHmac("sha256", cfg.appSecret).update(rawBody).digest("hex");
  const got = String(header || "");
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function downloadMedia(mediaId) {
  const info = await graph(`/${mediaId}`);
  const r = await fetch(info.url, { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!r.ok) throw new Error("No se pudo descargar el archivo de WhatsApp");
  return { buffer: Buffer.from(await r.arrayBuffer()), mime: String(info.mime_type || "").split(";")[0].trim() };
}

/** Convierte el aviso de Meta en una lista de mensajes simples (texto, imagen o documento) */
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

module.exports = { enabled, mode, cfg, configProblems, checkCredentials, sendText, sendImage, verifySignature, downloadMedia, parseWebhook };
