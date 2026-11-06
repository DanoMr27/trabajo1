/* =====================================================================
   MENSAJES AUTOMÁTICOS DE WHATSAPP
   Puedes cambiar estos textos libremente. *texto* = negrita en WhatsApp.
   ===================================================================== */
module.exports = {
  /* Se envía junto con la imagen del QR de cobro */
  qr: (o) =>
    `¡Hola ${o.first}! 👋 Este es tu QR de pago.\n\n` +
    `🧾 Pedido *${o.code}*\n${o.detalle}\n💵 Total: *Bs ${o.amount}*\n\n` +
    `1️⃣ Descarga esta imagen.\n2️⃣ Págala desde la app de tu banco (opción "Pagar con QR").\n` +
    `3️⃣ Envíanos *aquí mismo* la foto o captura del comprobante.\n\n` +
    `Apenas lo validemos te enviamos tu ${o.isBook ? "confirmación" : "entrada única"} por este chat. 🎭`,

  /* Si todavía no se cargó en el panel el QR para ese monto */
  qrPendiente: (o) =>
    `¡Hola ${o.first}! Recibimos tu pedido *${o.code}* (Bs ${o.amount}). ` +
    `En unos minutos te enviamos el QR de pago por este chat. 🙌`,

  /* Al recibir la foto del comprobante */
  comprobanteRecibido: (o) =>
    `✅ Recibimos tu comprobante del pedido *${o.code}*. Lo estamos validando, ` +
    `en breve te enviamos tu ${o.isBook ? "confirmación" : "entrada"}.`,

  /* Imagen enviada sin pedido asociado */
  comprobanteSinPedido: () =>
    `Recibimos tu imagen 🙌. Si es un comprobante, escríbenos el *código de tu pedido* (empieza con ST-) para asociarlo.`,

  /* Mensaje de alguien que no viene de la página */
  bienvenida: (url) =>
    `¡Hola! 👋 Gracias por escribir a SOTIRIA.\n\nPara comprar entradas o el libro entra aquí: ${url}\n` +
    `Elige tu función y cantidad, y te enviamos el QR de pago por este chat.`,

  /* Pago aprobado: entrada (va como texto de la imagen del QR de la entrada) */
  entrada: (o) =>
    `🎟️ *¡Tu entrada está confirmada, ${o.first}!*\n\n` +
    `*${o.titulo}*\n📅 ${o.fecha}\n📍 ${o.lugar}\n👥 ${o.detalle}\n\n` +
    `Código: *${o.ticketCode}*\nMuestra este QR en la puerta. También puedes verla aquí:\n${o.link}`,

  /* Pago aprobado: libro */
  libroConfirmado: (o) =>
    `📚 *¡Pago confirmado, ${o.first}!*\n\n${o.detalle} · Bs ${o.amount}\nEntrega: ${o.entrega}\n` +
    `Código de compra: *${o.ticketCode}*\n\n${o.envio ? "Te escribiremos por aquí para coordinar el envío." : "Muestra este mensaje al retirarlo."}`,

  /* Comprobante rechazado */
  rechazo: (o) =>
    `⚠️ No pudimos validar el comprobante del pedido *${o.code}*.\nMotivo: ${o.motivo}\n\n` +
    `Si ya pagaste, envíanos de nuevo la captura completa del comprobante por aquí.`,
};
