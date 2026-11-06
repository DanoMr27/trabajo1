# SOTIRIA

Web para vender las entradas de **la obra** y **el libro**, con el **podcast** anunciado como "Próximamente".
El pago es por **QR**: el pedido se hace en la web, el QR y la entrada llegan por **WhatsApp**, y un panel permite
validar los comprobantes y guarda los datos de los clientes (CRM).

## Cómo funciona una compra

1. El cliente llega desde Facebook, Instagram o TikTok, elige la función y la cantidad, y escribe sus datos.
2. La web crea el pedido (`ST-XXXXX`) y abre **WhatsApp** con un mensaje ya escrito.
3. Al recibir ese mensaje, el sistema **responde solo con el QR de cobro del monto exacto**.
4. El cliente paga desde la app de su banco y **envía la foto del comprobante en ese chat**.
5. El comprobante aparece en el panel → **Comprobantes**. Quien valida revisa que el dinero llegó al banco y pulsa
   **Aprobar**.
6. El sistema **genera la entrada única (con QR) y la envía sola a ese chat**. La web del cliente también se actualiza.
7. En la puerta se escanea el QR de la entrada con un celular que tenga el panel abierto, y se pulsa **Registrar ingreso**.

## Ponerlo en marcha

Requiere **Node.js 18 o superior** (https://nodejs.org). No hay que instalar nada más.

```bash
node server/server.js
```

- Web: http://localhost:3000
- Panel: http://localhost:3000/admin.html. La **contraseña** aparece en la consola la primera vez; se cambia
  con `node server/set-password.js`.

Primeros pasos en el panel:

1. **QR de cobro**: sube un QR de tu banco para cada monto (Bs 50, 100, … 500 para la obra, y los del libro).
2. **Simulador**: prueba una compra completa sin WhatsApp real.
3. Para conectar el WhatsApp real sigue **[WHATSAPP.md](WHATSAPP.md)**.

Si abres `index.html` sin servidor, la página se ve igual y el botón de compra abre WhatsApp con el pedido escrito,
pero el QR automático, el panel y el seguimiento no funcionan.

## Enlaces para redes sociales

Agrega `?src=` al enlace de cada publicación para saber de qué red vienen los clientes (se ve en **Clientes**):

| Publicación | Enlace |
|---|---|
| Instagram, abre la compra de la obra | `https://tu-dominio.com/?p=obra&src=instagram` |
| TikTok, abre la compra del libro | `https://tu-dominio.com/?p=libro&src=tiktok` |
| Facebook, con nombre de campaña | `https://tu-dominio.com/?p=obra&src=facebook&utm_campaign=estreno` |
| Podcast (lleva a "Avísame") | `https://tu-dominio.com/?p=podcast&src=instagram` |

## Panel

| Pestaña | Para qué |
|---|---|
| Comprobantes | Cola de pagos por validar: imagen, datos del cliente, **Aprobar** / **Rechazar** (el cliente recibe el motivo). Avisa con sonido y si la imagen ya se usó en otro pedido. |
| Pedidos | Todos los pedidos, con búsqueda, historial, reenvío de QR, cancelación y entrega del libro. |
| Chats | Conversaciones de WhatsApp: responder y asociar una imagen a un pedido. |
| Clientes | CRM: nombre, WhatsApp, CI, correo, de qué red vino, qué compró y cuánto. Exporta a Excel (CSV). |
| QR de cobro | Subir y reemplazar los QR del banco por monto. |
| Puerta | Validar entradas por código y registrar ingresos. |
| Simulador | Hacer de cliente de WhatsApp para probar (solo sin WhatsApp real). |

## Dónde editar

| Qué | Archivo |
|---|---|
| Obra (funciones, precio, cupos), libro, podcast, videos, galería, número de WhatsApp | `js/data.js` |
| Textos de los mensajes automáticos de WhatsApp | `server/textos.js` |
| Diseño | `css/style.css` (página), `css/admin.css` (panel) |

Los textos, fechas, imágenes, el precio del libro (Bs 70), el número de WhatsApp y los videos son **de ejemplo**.

## Datos

Se guardan en `server/db.json`. Los comprobantes van en `server/uploads/` y los QR de cobro en `server/qr-cobro/`.
Ninguno se sube a GitHub. Haz copias de respaldo de la carpeta `server/` en producción.
