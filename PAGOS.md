# Pagos con QR: cómo conectar la app de pagos

La web ya genera las órdenes y los QR, detecta los pagos y entrega las entradas.
Lo único que falta para cobrar dinero real es conectar el **banco o la app de pagos**
en **dos puntos** del servidor (`server/server.js`).

```
Comprador ──► Web ──► POST /api/orders ──► Servidor ──► createBankQR() ──► Banco / App
                ▲                                                            │
                │  consulta cada 2,5 s GET /api/orders/:id                    │ el cliente paga
                │                                                            ▼
             Entrada ◄── Servidor emite la entrada ◄── POST /api/webhooks/qr (aviso de pago)
```

## 1. Generar el QR en el banco: `createBankQR(order)`

Por ahora devuelve un QR de ejemplo. Reemplaza el cuerpo de la función por la llamada a la
API de tu banco o app (QR interoperable). Debe devolver:

```js
{ payload: "<texto del QR>", image: "<data:image/png;base64,... o URL>" | null, bankRef: "<id del banco>" }
```

Si el banco devuelve una imagen, se muestra tal cual. Si devuelve texto, la web dibuja el QR.

## 2. Recibir la confirmación: webhook

Cuando el cliente paga, la app o el banco debe llamar:

```
POST /api/webhooks/qr
Header:  X-Webhook-Secret: <WEBHOOK_SECRET>
Body:    { "orderId": "ORD-XXXXXX", "status": "paid", "amount": 180, "transactionId": "BNK-123" }
```

- Si la clave no coincide, responde `401`.
- Si el monto no coincide con la orden, responde `400` (no se entrega la entrada).
- Con `"status": "failed"` la orden se marca como rechazada.

Si el banco no acepta el formato `orderId`, guarda el `bankRef` que devolvió `createBankQR` y busca la orden
por ese dato dentro del webhook.

## Otras rutas

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/health` | La web la usa para saber si hay servidor (si no hay, pasa a modo demo) |
| GET | `/api/events/:id/availability` | Entradas restantes por zona |
| POST | `/api/orders` | Crea la orden. **El precio lo calcula el servidor**, no la web |
| GET | `/api/orders/:id` | Estado: `pending`, `paid`, `expired` o `failed` |
| POST | `/api/orders/:id/card` | Pago con tarjeta (por ahora aprueba; aquí va la pasarela) |
| POST | `/api/orders/:id/simulate` | Solo pruebas. Se desactiva con `NODE_ENV=production` |
| GET | `/api/tickets/:code` | Validar una entrada (QR de la entrada) |
| POST | `/api/tickets/:code/checkin` | Marcar el ingreso en la puerta (header `X-Webhook-Secret`) |

## Probar el webhook a mano

En PowerShell:

```powershell
$env:WEBHOOK_SECRET = "mi-clave"; node server/server.js
```

Haz una compra en http://localhost:3000, copia el número de orden que aparece bajo el QR y, en otra terminal:

```powershell
Invoke-RestMethod -Method Post http://localhost:3000/api/webhooks/qr -Headers @{ "X-Webhook-Secret" = "mi-clave" } -ContentType "application/json" -Body '{"orderId":"ORD-XXXXXX","status":"paid","amount":60,"transactionId":"TEST-1"}'
```

La página detecta el pago sola y muestra la entrada.

## Antes de producción

- Define `WEBHOOK_SECRET` con una clave larga y `NODE_ENV=production`.
- Usa HTTPS.
- Pasa `server/db.json` a una base de datos real.
- Conecta el envío de la entrada por correo o WhatsApp (busca `TODO` en `issueTicket`).
