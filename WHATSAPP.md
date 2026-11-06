# Conectar WhatsApp real (API de WhatsApp Business de Meta)

Mientras no hagas esto, el sistema funciona en **modo simulador**: todo el circuito se prueba desde el
panel, en la pestaña **Simulador WhatsApp**.

Para que el sistema responda y reciba mensajes **solo**, el número de ventas debe usar la
**API oficial de WhatsApp Business (Cloud API)**.

> ⚠ Importante: un número conectado a la API **deja de funcionar en la app de WhatsApp del celular**.
> Usa un número dedicado a ventas. Todos los chats se atienden desde el panel (pestaña **Chats**).

## 1. Crear la app en Meta

1. Entra a <https://developers.facebook.com>, crea una cuenta de desarrollador y una **app** de tipo *Business*.
2. Agrega el producto **WhatsApp**.
3. En **WhatsApp → Configuración de la API**, agrega el número de ventas y verifícalo con el código SMS.
4. Copia el **Phone number ID** (identificador del número).
5. En **Business Settings → Usuarios del sistema**, crea un usuario del sistema, dale acceso a la app y genera un
   **token permanente** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`.
6. En **Configuración de la app → Básica**, copia la **Clave secreta de la app** (App secret).

## 2. Configurar el servidor

El servidor debe estar publicado en internet con **HTTPS** (por ejemplo `https://sotiria.tv`).
Arráncalo con estas variables:

```bash
ADMIN_PASSWORD="una-clave-larga" PUBLIC_URL="https://sotiria.tv" WA_TOKEN="token-permanente" WA_PHONE_ID="123456789" WA_VERIFY_TOKEN="inventa-un-texto" WA_APP_SECRET="clave-secreta-de-la-app" node server/server.js
```

En `js/data.js` pon el mismo número en `CONTACT.whatsapp` (con 591 adelante, sin "+" ni espacios).

## 3. Registrar el webhook en Meta

En **WhatsApp → Configuración → Webhook**:

- **URL de devolución de llamada:** `https://sotiria.tv/webhook/whatsapp`
- **Token de verificación:** el mismo texto que pusiste en `WA_VERIFY_TOKEN`
- Pulsa **Verificar y guardar** y suscríbete al campo **messages**.

Listo: el panel mostrará "WhatsApp: conectado ✓" y el simulador desaparece.

## Cómo funciona

| Paso | Qué pasa |
|---|---|
| El cliente toca "Abrir WhatsApp" en la página | Se abre el chat con el mensaje "Hola, quiero pagar mi orden ORD-XXXXXX…" |
| Envía ese mensaje | El sistema reconoce la orden y le responde **solo** con el QR del monto exacto |
| Envía la foto o PDF del comprobante | Aparece en el panel, en **Comprobantes**, con el monto que debe figurar |
| El validador revisa la cuenta del banco y pulsa **Aprobar** | Se genera la entrada única y se envía **sola** al chat, con su QR |
| El cliente llega al teatro | En la puerta se escanea el QR: se abre la entrada y, con sesión del panel, se registra el ingreso |

Las respuestas libres (sin plantillas) se pueden enviar porque el cliente escribe primero: Meta permite
responder durante las 24 horas siguientes a su último mensaje.

## Costos

Meta cobra por conversación según el país y el tipo. Las conversaciones que inicia el cliente
(como esta) suelen ser las más baratas, y hay un cupo gratuito mensual. Revisa los precios vigentes en la
documentación de Meta antes de lanzar.
