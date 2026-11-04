# SOTIRIA Tickets

Web de venta de entradas para el teatro SOTIRIA y otros teatros y salas de Santa Cruz de la Sierra.

## Cómo usarla

**Sin servidor (modo demostración):** abre `index.html` en el navegador. Todo funciona,
pero los pagos se confirman con el botón "Simular pago recibido".

**Con servidor (pagos QR reales):** instala [Node.js](https://nodejs.org) 18 o superior y ejecuta:

```bash
node server/server.js
```

Abre http://localhost:3000. No hay que instalar nada más.

## Panel del propietario

Ganancias del día, la semana y el mes, ventas por teatro, por tipo de entrada, por categoría
y por día de la semana. Solo se ve con la contraseña del propietario.

1. Crea la contraseña (una sola vez): `node server/set-password.js`
2. Inicia el servidor: `node server/server.js`
3. Entra en http://localhost:3000/admin.html

La contraseña se guarda cifrada en `server/admin.json`, que no se sube a GitHub. Tras 5 intentos
fallidos el acceso se bloquea 15 minutos y la sesión se cierra sola a las 8 horas.

Para probar el panel con datos de ejemplo: `node server/seed.js` (con el servidor detenido).
Antes de vender de verdad, bórralos con `node server/seed.js --clear`.

## Qué incluye

- Catálogo de varios teatros, con buscador y filtros por categoría, teatro y fecha.
- Compra en 4 pasos: zona y cantidad (con cupos), datos del comprador, pago y entrada.
- Pago con **QR** (escaneable, vence en 15 min, se detecta solo) o con tarjeta.
- Entradas con QR único, guardadas en "Mis entradas" e imprimibles o en PDF.
- Videos (YouTube o MP4) en un reproductor, con botón para comprar entradas de ese evento.
- Galería, sección "Vende con nosotros" (envía por WhatsApp) y preguntas frecuentes.

## Dónde editar

| Qué | Archivo |
|---|---|
| Teatros, eventos, precios, cupos, videos, galería, WhatsApp | `js/data.js` |
| Conexión con el banco o la app de pagos | `server/server.js` (ver [PAGOS.md](PAGOS.md)) |
| Diseño y colores | `css/style.css` (variables al inicio) |
| Comportamiento de la página | `js/app.js`, `js/payments.js` |
| Panel del propietario | `admin.html`, `js/admin.js`, `css/admin.css`; estadísticas en `server/server.js` (`stats`) |

Los teatros, eventos y el número de WhatsApp actuales son **ejemplos**. Los videos usan un clip de muestra;
reemplázalos por los enlaces de YouTube del canal.
