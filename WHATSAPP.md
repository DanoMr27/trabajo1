# Conectar el WhatsApp real

Mientras no se conecte, el sistema funciona en **modo simulador**. Todo el circuito se prueba desde el panel, en la pestaña **Simulador**.

Para que el sistema responda solo con el QR, reciba los comprobantes en el panel y envíe las entradas, se usa la
**API oficial de WhatsApp Business (Meta Cloud API)**. Es la única forma permitida de automatizar WhatsApp: los
programas que "controlan" un WhatsApp normal violan las reglas de WhatsApp y el número puede ser bloqueado.

## Antes de empezar

- Un **número de teléfono para ventas**. Lo más simple es un chip nuevo que no esté en WhatsApp. Si quieren usar
  un número que ya está en la app **WhatsApp Business**, Meta ofrece en algunos países la opción de *coexistencia*
  (usar la app y la API a la vez): revisen si está disponible para Bolivia al registrar el número.
- Una cuenta de **Meta Business** (business.facebook.com). Puede ser la misma que maneja la página de Facebook.
- La web publicada en internet con **HTTPS**, por ejemplo `https://sotiria.tv`. Meta no puede avisar a `localhost`.

## Pasos

1. Entra a **developers.facebook.com** → *Mis apps* → **Crear app** → tipo **Empresa** → vincúlala a tu cuenta de Meta Business.
2. Dentro de la app, agrega el producto **WhatsApp**.
3. En **WhatsApp → Configuración de la API**, agrega tu número de ventas y verifícalo con el código SMS.
   Copia el **Phone number ID**.
4. Crea un **token permanente**: Meta Business → *Configuración* → *Usuarios del sistema* → crea uno con rol
   *Administrador* → *Generar token* para tu app, con los permisos `whatsapp_business_messaging` y
   `whatsapp_business_management`.
5. En **Configuración de la app → Básica**, copia la **Clave secreta de la app** (App secret).
6. Inicia el servidor con estas variables:

   ```bash
   PUBLIC_URL=https://tu-dominio.com \
   WA_TOKEN=EAAG...            \
   WA_PHONE_ID=1234567890      \
   WA_VERIFY_TOKEN=una-frase-que-inventes \
   WA_APP_SECRET=abc123...     \
   node server/server.js
   ```

7. En **WhatsApp → Configuración → Webhook**:
   - URL de devolución de llamada: `https://tu-dominio.com/api/whatsapp/webhook`
   - Token de verificación: la misma frase de `WA_VERIFY_TOKEN`
   - Pulsa **Verificar y guardar**, y suscríbete al campo **messages**.
8. En `js/data.js`, pon ese número en `CONTACT.whatsapp`, por ejemplo `59170000000`.
9. Haz una compra de prueba desde tu celular.

## Costos

Meta cobra por conversación. Las que **empieza el cliente** (como estas, que nacen al tocar el botón de la web)
son conversaciones de servicio, y hoy son gratuitas o de costo muy bajo. Revisa los precios vigentes de Bolivia
en la página de precios de WhatsApp Business.

## Reglas que conviene saber

- Solo se pueden enviar mensajes libres hasta **24 horas después del último mensaje del cliente**. El flujo de
  compra queda siempre dentro de ese plazo. Si validas un comprobante muy tarde y el envío falla, el chat del
  panel lo marca como "no enviado"; en ese caso escribe al cliente desde la app.
- Salvo que usen la *coexistencia*, el número de ventas deja de funcionar en la app del celular. Las
  conversaciones se atienden desde el panel → **Chats**.
