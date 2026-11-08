# Vincular WhatsApp con SOTIRIA (Cloud API oficial de Meta)

SOTIRIA usa **solo la API oficial de WhatsApp Business (Cloud API de Meta)**. No usa WhatsApp Web, Selenium ni
librerías no oficiales: esas violan las reglas de WhatsApp y el número puede ser bloqueado.

## Cómo funciona en este proyecto

| Pieza | Dónde está |
|---|---|
| Envío y recepción con Meta | `server/whatsapp.js` |
| Webhook (Meta avisa de mensajes nuevos) | `GET` y `POST` **`/api/whatsapp/webhook`** en `server/server.js` |
| Textos automáticos (QR, comprobante recibido, entrada, rechazo) | `server/textos.js` |
| Número que abre el botón de la web | `CONTACT.whatsapp` en `js/data.js` (hoy `59177314953`) |
| Configuración | archivo `.env` en la carpeta del proyecto (plantilla: `.env.example`) |

**Flujo:**
1. El cliente pide en la web y se abre WhatsApp con "Hola, quiero pagar mi pedido ST-XXXXX…".
2. Al enviar ese mensaje, el servidor reconoce el código y responde con el **QR de cobro** del monto. Los QR se cargan en Panel → QR de cobro.
3. El cliente manda la foto o el PDF del comprobante. Llega solo a **Comprobantes**, con estado **Pendiente**.
4. El validador revisa el comprobante en la app del banco:
   - **Aprobar**: se genera la entrada única con su QR, se envía por WhatsApp y el estado pasa a **Entrada enviada**.
   - **Rechazar** (con motivo): el cliente recibe el motivo y puede mandar otro comprobante.
5. En la puerta, el QR solo vale para la cantidad de entradas compradas, y cada ingreso queda registrado.

**WhatsApp nunca aprueba un pago solo:** siempre lo decide una persona.

**Modos** (`WHATSAPP_MODE` en `.env`):
- `simulator`: los mensajes no salen. Se prueba todo en Panel → Simulador. Es el modo actual.
- `cloud`: WhatsApp real. Si falta el token, el Phone Number ID o el Verify Token, el servidor **no arranca** y dice qué falta.

## Las cinco claves (no confundirlas)

| Clave | Qué es | Variable en `.env` | ¿Secreta? |
|---|---|---|---|
| **Access Token** | La "llave" con la que SOTIRIA envía mensajes y descarga comprobantes. Temporal (24 h) para pruebas; permanente con un usuario del sistema (Etapa F). | `WHATSAPP_ACCESS_TOKEN` | **Sí** |
| **Verify Token** | Una frase que **ustedes inventan** y escriben igual en Meta y en SOTIRIA. Solo sirve para que Meta confirme que el webhook es suyo. | `WHATSAPP_VERIFY_TOKEN` | Sí |
| **App Secret** | "Clave secreta de la app" que da Meta. SOTIRIA la usa para comprobar que cada aviso viene de verdad de Meta (firma `X-Hub-Signature-256`). | `META_APP_SECRET` | **Sí** |
| **Phone Number ID** | Número interno que Meta asigna al teléfono que envía. **No es el número de teléfono.** | `WHATSAPP_PHONE_NUMBER_ID` | No |
| **WABA ID** | ID de la cuenta de WhatsApp Business. SOTIRIA lo guarda como referencia. | `WHATSAPP_WABA_ID` | No |

Nunca pongan estas claves en el código ni las suban a GitHub: van **solo** en el `.env` del servidor (que ya está
excluido de GitHub y que la web no deja descargar).

---

## Etapa A — Prueba inicial con el número de prueba de Meta

1. Entren a **https://developers.facebook.com** con la cuenta de Facebook que administra la página de SOTIRIA, y acepten las condiciones de desarrollador si es la primera vez.
2. **Mis apps → Crear app**:
   - Caso de uso: elijan el de **WhatsApp** ("Conectar con clientes a través de WhatsApp"). Si no aparece, elijan **Otro → Empresa**.
   - Nombre de la app: **SOTIRIA**. Correo de contacto: el de SOTIRIA.
   - Portfolio comercial (cuenta de Meta Business): elijan el de SOTIRIA o créenlo.
3. Dentro de la app, en el menú izquierdo, busquen **WhatsApp** y entren a **Configuración de la API** ("API Setup"). Si WhatsApp no aparece, agréguenlo desde **Agregar producto → WhatsApp → Configurar**.
4. En esa pantalla Meta muestra un **número de prueba** gratuito. Sirve para probar sin tocar el número real.
5. En **"Para" / "To"**, pulsen **Administrar lista de números** y agreguen el celular desde el que van a hacer de cliente (por ejemplo `+591 7XXXXXXX`). Les llega un código por WhatsApp o SMS para confirmarlo. Se pueden registrar hasta 5 números.
6. Pulsen **Enviar mensaje**: Meta manda la plantilla `hello_world` a ese celular. Si llega, la cuenta funciona.
7. Copien de esa misma pantalla:
   - **Token de acceso temporal** → `WHATSAPP_ACCESS_TOKEN` (dura unas 24 horas);
   - **Identificador del número de teléfono** (Phone number ID) → `WHATSAPP_PHONE_NUMBER_ID`;
   - **Identificador de la cuenta de WhatsApp Business** (WhatsApp Business Account ID) → `WHATSAPP_WABA_ID`.
8. Fíjense en la versión que aparece en los ejemplos de Meta (por ejemplo `v23.0` en `graph.facebook.com/v23.0/...`) y pónganla en `WHATSAPP_GRAPH_VERSION`.

> Con el número de prueba, SOTIRIA **solo puede escribir a los celulares registrados en el paso 5**. Para clientes reales hace falta la Etapa E.

## Etapa B — Publicar el servidor

Meta tiene que poder llamar al servidor por internet con **HTTPS**, así que `localhost` no sirve.

- **Qué se publica:** este proyecto completo (la web, el panel y la API), con **Node.js 18 o superior**. No hay que instalar nada más.
- **Comando de inicio:** `node server/server.js`, ejecutado en la carpeta del proyecto.
- **Dónde publicarlo:** un servidor que quede siempre encendido y conserve archivos, como un VPS o un servicio con disco persistente. Ahí se guardan `server/db.json`, los comprobantes (`server/uploads/`), los QR de cobro y las contraseñas, y si el disco se borra se pierden. No sirven los servicios "sin servidor" que borran el disco.
- **HTTPS:** pongan delante un proxy con certificado, como Caddy o Nginx con Let's Encrypt. Algunos servicios ya lo traen.
- **Solo para una prueba rápida desde su computadora:** `cloudflared tunnel --url http://localhost:3000` da una dirección `https://xxxx.trycloudflare.com`. Cambia cada vez que se reinicia, así que no sirve para producción.

**Configuración:** copien `.env.example` como `.env` en el servidor y completen:

```env
WHATSAPP_MODE=cloud
WHATSAPP_ACCESS_TOKEN=EAAG…(el token, completo)
WHATSAPP_PHONE_NUMBER_ID=1234…
WHATSAPP_WABA_ID=1234…
WHATSAPP_VERIFY_TOKEN=(la frase inventada en la Etapa C)
WHATSAPP_GRAPH_VERSION=v23.0
META_APP_SECRET=(Etapa C, paso 7)
PUBLIC_BASE_URL=https://NUESTRO-DOMINIO
WHATSAPP_BUSINESS_NUMBER=59177314953
```

**Comprobar que funciona:**
1. Al arrancar, la consola debe mostrar:
   `WhatsApp: MODO CLOUD … webhook → https://NUESTRO-DOMINIO/api/whatsapp/webhook`
   y luego `WhatsApp: credenciales válidas · número +1 555…` (con el número de prueba).
   Si dice "configuración está incompleta", falta una variable. Si dice "no se pudieron comprobar las credenciales", el token o el Phone Number ID están mal.
2. Abran `https://NUESTRO-DOMINIO/api/health`. Debe responder `"mode":"cloud"`.

**URL del webhook de este proyecto:**

```text
https://NUESTRO-DOMINIO/api/whatsapp/webhook
```

## Etapa C — Configurar el webhook en Meta

1. En developers.facebook.com → app **SOTIRIA** → **WhatsApp → Configuración** ("Configuration").
2. En **Webhook** pulsen **Editar**. En **URL de devolución de llamada** ("Callback URL") escriban:
   `https://NUESTRO-DOMINIO/api/whatsapp/webhook`
3. **Token de verificación** ("Verify token"): inventen una frase larga, por ejemplo `sotiria-` seguido de 20 letras y números al azar. **No es el Access Token.**
4. Pongan **la misma frase** en el `.env` del servidor como `WHATSAPP_VERIFY_TOKEN=` y reinicien el servidor.
5. Pulsen **Verificar y guardar**. Meta llama a `GET /api/whatsapp/webhook`, SOTIRIA compara la frase y responde. Si falla, revisen que el servidor esté encendido, que la URL sea HTTPS y que la frase sea idéntica.
   Para probarlo ustedes antes:
   `https://NUESTRO-DOMINIO/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=SU_FRASE&hub.challenge=123` debe mostrar `123`.
6. En **Campos del webhook** ("Webhook fields") pulsen **Administrar** y **suscríbanse a `messages`**. Sin esto, Meta no avisa de los mensajes.
7. **App Secret:** en la app → **Configuración de la app → Básica → Clave secreta de la app** → **Mostrar**. Pónganla en `META_APP_SECRET` y reinicien. Sin ella, SOTIRIA avisa en la consola de que no puede comprobar el origen de los avisos.
8. **Comprobar mensajes, imágenes y documentos:**
   - Desde el celular registrado, escriban al número de prueba: "hola" (debe responder la bienvenida con el enlace de la web), un pedido de la web, una foto y un PDF.
   - En Panel → **Chats** deben aparecer los mensajes, la foto y el PDF.
   - Si no aparece nada: la URL del webhook está mal, no se suscribieron a `messages`, o el `META_APP_SECRET` no coincide (la consola mostraría respuestas 401).

## Etapa D — Primera compra de prueba

Antes de empezar: en Panel → **QR de cobro**, suban al menos el QR de **Bs 50**.

1. En el celular registrado, abran `https://NUESTRO-DOMINIO`, pulsen **Comprar entradas**, elijan una función y **1** entrada, y completen sus datos.
2. Pulsen **Abrir WhatsApp y pedir mi QR**. El botón abre el chat con el número de `CONTACT.whatsapp` (hoy 59177314953). **Mientras usen el número de prueba de Meta**, ese botón todavía no lleva al número que responde. Hay dos opciones: copien el texto del pedido y envíenlo a mano al número de prueba, o pongan temporalmente el número de prueba en `CONTACT.whatsapp` (`js/data.js`) y vuelvan a poner `59177314953` al terminar.
3. Envíen el mensaje ya escrito ("Hola, quiero pagar mi pedido ST-XXXXX…").
4. En segundos llega el **QR de Bs 50** con las instrucciones.
5. Envíen cualquier imagen como "comprobante". Llega "✅ Recibimos tu comprobante…".
6. En la computadora, abran `https://NUESTRO-DOMINIO/admin.html`, elijan **Validador** y entren con su nombre y la contraseña de validador.
7. En **Comprobantes** aparece el pedido como **Pendiente**, con la imagen, con sonido y aviso.
8. Pulsen **Validar y enviar entrada** y confirmen.
9. En el celular llega la **entrada con su QR** y el enlace. En el panel del administrador, el pedido queda en **Entrada enviada**.
10. **Puerta:** entren al panel como **Administrador** en otro celular y escaneen el QR de la entrada con la cámara. Se abre la entrada con el botón **Registrar ingreso**. Púlsenlo: "✓ Puede ingresar".
11. **Reutilizar:** escaneen el mismo QR otra vez. Debe decir "✗ Entrada ya usada por completo". Con 2 entradas, el tercer intento es el que se rechaza.

**Prueba de rechazo:** hagan otro pedido y envíen un comprobante. Como validador pulsen **Rechazar**, elijan "El monto no coincide" y confirmen. En el celular llega "⚠️ No pudimos validar el comprobante… Motivo: El monto no coincide". Envíen otra imagen y el pedido vuelve a **Pendiente**.

**Si la entrada no sale:** el pedido queda como **"Pagado · entrada sin enviar"** y el panel muestra el motivo. El administrador abre el pedido y pulsa **Reenviar entrada**. Si pasaron más de 24 horas desde el último mensaje del cliente, WhatsApp no deja escribirle: el cliente tiene que escribir primero.

## Etapa E — Número definitivo +591 77314953

1. En la app → **WhatsApp → Configuración de la API** → **Agregar número de teléfono**, o desde WhatsApp Manager en business.facebook.com.
2. **Nombre visible:** "SOTIRIA" (o "SOTIRIA Teatro"). Meta lo revisa y puede tardar. Tiene que coincidir con el nombre real del negocio.
3. **Verificación:** escriban `+591 77314953` y elijan **SMS** o **llamada**. Ingresen el código de 6 dígitos.
4. **PIN de verificación en dos pasos:** Meta pide crear un PIN de 6 dígitos para el número. Guárdenlo en un lugar seguro, porque lo pedirán para volver a registrar el número. Si al final el número figura como "pendiente de registro", se registra con ese PIN:
   ```
   POST https://graph.facebook.com/v23.0/<PHONE_NUMBER_ID>/register
   Authorization: Bearer <ACCESS_TOKEN>
   { "messaging_product": "whatsapp", "pin": "<SU_PIN>" }
   ```
5. **Si el número ya se usa en WhatsApp o en WhatsApp Business:**
   - Normalmente Meta **no deja** registrar en la Cloud API un número activo en la app.
   - Si el número está en la app **WhatsApp Business**, Meta puede ofrecer **coexistencia** (seguir usando la app y la API a la vez) o **migración**, según el país y la cuenta. **Solo usen esa opción si Meta la muestra** al agregar el número.
   - Si no la ofrece, la alternativa es **eliminar la cuenta de WhatsApp de ese número** en la app (Ajustes → Cuenta → Eliminar cuenta). **Antes de hacerlo:** se pierden el historial de chats (salvo copia de seguridad), los grupos y la información de perfil, y el número deja de funcionar en la app del celular. Desde entonces las conversaciones se atienden en Panel → **Chats**.
   - Si no quieren perder esa cuenta, usen **otro número** (un chip nuevo) para SOTIRIA.
6. **Cambiar del número de prueba al definitivo:**
   - Copien el **nuevo Phone Number ID** (el de +591 77314953) en `WHATSAPP_PHONE_NUMBER_ID`.
   - Revisen que `WHATSAPP_BUSINESS_NUMBER=59177314953` y que `CONTACT.whatsapp` en `js/data.js` sea `59177314953` (ya lo es).
   - Reinicien. La consola debe decir `credenciales válidas · número +591 77314953`. Si muestra otro número, avisa que sigue el de prueba.
7. **Modo de la app:** para recibir mensajes de clientes reales, Meta suele pedir que la app esté en modo **Activo/Live**, y para eso pide una **URL de política de privacidad**. Tengan esa página lista.
8. Meta puede pedir **verificar el negocio** (documentos) para subir los límites de envío y aprobar el nombre visible.

## Etapa F — Token permanente

El token de la Etapa A vence en unas 24 horas. Para producción:

1. Entren a **https://business.facebook.com** → **Configuración** → **Usuarios → Usuarios del sistema** → **Agregar**. Nombre: `sotiria-servidor`, rol **Administrador**.
2. Con ese usuario seleccionado → **Asignar activos**:
   - **Apps** → SOTIRIA → control total;
   - **Cuentas de WhatsApp** → la cuenta de SOTIRIA → control total.
3. Pulsen **Generar nuevo token**, elijan la app **SOTIRIA** y en caducidad **Nunca** (o la más larga disponible).
4. Permisos: marquen **`whatsapp_business_messaging`** y **`whatsapp_business_management`**.
5. Copien el token **una sola vez**, porque Meta no lo vuelve a mostrar. Guárdenlo en el `.env` del servidor:
   `WHATSAPP_ACCESS_TOKEN=EAAG…`
6. Reinicien el servidor (`node server/server.js`). La consola debe decir "credenciales válidas". El token temporal deja de usarse.
7. Si el token se filtra, revóquenlo en la misma pantalla y generen otro.

## Costos y reglas

- Solo se pueden enviar mensajes libres **hasta 24 horas después del último mensaje del cliente**. El flujo normal (pedido → QR → comprobante → entrada) cabe en ese plazo.
- Las respuestas dentro de esas 24 horas a conversaciones que inicia el cliente hoy son gratuitas o de costo muy bajo. Revisen los **precios vigentes de Meta para Bolivia** antes de lanzar.
- Para escribir a un cliente **después** de 24 horas hace falta una **plantilla aprobada por Meta**. Este proyecto todavía no las usa.
