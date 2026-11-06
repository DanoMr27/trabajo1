# SOTIRIA: la obra, el libro y el podcast

Página de venta de **entradas para la obra** (Bs 50) y del **libro**, con el **podcast** anunciado como
"Próximamente". Los pagos se hacen **por QR a través de WhatsApp** y se validan desde un **panel**.

## Cómo funciona la compra

1. El cliente llega desde Facebook, Instagram o TikTok (o directo) y elige la función y la cantidad.
2. Pone sus datos y la página le da su **código de pedido** y el botón **"Abrir WhatsApp"**.
3. En WhatsApp el sistema le responde **solo** con el **QR del monto exacto** (1 a 10 entradas).
4. El cliente paga y envía la **foto del comprobante** al mismo chat.
5. El comprobante aparece en el **panel**. El validador revisa la cuenta del banco y pulsa **Aprobar**.
6. La **entrada única con QR** se envía sola a su WhatsApp, y la página del cliente se actualiza.

## Ponerlo en marcha

Necesitas Node 18 o superior; no hay que instalar nada más.

```bash
ADMIN_PASSWORD="tu-clave" node server/server.js
```

- Página: <http://localhost:3000>
- Panel: <http://localhost:3000/panel/>

Sin WhatsApp conectado funciona en **modo simulador**, y el circuito completo se prueba desde el panel.
Para conectar WhatsApp real sigue [WHATSAPP.md](WHATSAPP.md).

## El panel

| Pestaña | Para qué |
|---|---|
| Comprobantes | Ver cada comprobante con el monto esperado y **Aprobar** o **Rechazar** |
| Chats | Todas las conversaciones de WhatsApp; responder desde ahí |
| Órdenes | Todas las compras, con filtro por estado y buscador; exporta CSV |
| Clientes (CRM) | Compradores e interesados del podcast, con el canal por el que llegaron; exporta CSV para Excel |
| QRs de cobro | Subir los QR del banco, uno por cada monto |
| Puerta | Validar entradas y registrar ingresos |

## Antes de lanzar

1. **QRs de cobro:** genera en la app del banco un QR **con monto fijo** para cada monto (Bs 50, 100, … 500
   para las entradas, y los montos del libro) y súbelos en el panel. Elige la vigencia más larga y que acepte varios pagos.
2. **Datos reales** en `js/data.js`: nombre de la obra, fechas, cupos, libro (título, autor, precio, entrega),
   número de WhatsApp, videos e imágenes.
3. **Servidor con HTTPS** y variables `ADMIN_PASSWORD` y `PUBLIC_URL`.
4. **WhatsApp real:** ver [WHATSAPP.md](WHATSAPP.md).

## Enlaces para redes sociales

Cada publicación puede llevar directo a la compra y registrar de qué red viene el cliente:

- Obra: `https://tu-dominio/?p=obra&src=instagram`
- Libro: `https://tu-dominio/?p=libro&src=facebook`
- Podcast: `https://tu-dominio/?p=podcast&src=tiktok`

## Archivos

| Archivo | Qué contiene |
|---|---|
| `js/data.js` | Obra, libro, podcast, precios, funciones, videos, WhatsApp |
| `index.html`, `js/app.js`, `css/style.css` | La página pública |
| `entrada.html` | La entrada que se abre al escanear el QR |
| `panel/` | El panel de ventas |
| `server/` | Servidor, conexión con WhatsApp y generador de QR. Los datos se guardan en `server/data/` |
