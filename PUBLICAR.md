# Publicar la página gratis (para mostrarle al cliente)

Hay dos maneras. Elige según lo que quieras mostrar.

---

## Opción A — Solo la página (la más rápida: 2 minutos)

Sirve para que el cliente vea el diseño, la obra, el libro, el podcast, los videos y cómo se
compra hasta el botón de WhatsApp. **No incluye el panel** (los pedidos no se guardan: el botón
abre WhatsApp con el mensaje escrito, y ahí se atiende a mano).

### Con Netlify Drop (sin cuenta, sin instalar nada)

1. Entra a <https://app.netlify.com/drop>
2. Arrastra la carpeta `sotiria-pagina` (la del zip `sotiria-pagina-estatica.zip`, ya descomprimida).
3. En unos segundos te da una dirección tipo `https://algo-random.netlify.app`. Esa es la que le pasas al cliente.
4. Si creas una cuenta gratis, puedes cambiarle el nombre a algo como `sotiria.netlify.app`.

### Con GitHub Pages (si prefieres usar el repositorio)

1. En GitHub, entra al repositorio → **Settings** → **Pages**.
2. En *Source* elige **Deploy from a branch**, rama `claude/inspiring-carson-nic7wb`, carpeta `/ (root)`.
3. Guarda. En unos minutos queda en `https://danomr27.github.io/trabajo1/`.

> En GitHub Pages el panel y las entradas **no funcionan** porque necesitan el servidor,
> pero la página pública sí.

---

## Opción B — Todo el sistema (página + panel + simulador)

Sirve para mostrarle al cliente **el circuito completo**: elegir la función, el panel de
comprobantes, aprobar un pago y ver cómo sale la entrada con su QR.

### Con Render (gratis)

1. Entra a <https://render.com> y crea una cuenta (puedes entrar con tu cuenta de GitHub).
2. **New** → **Web Service** → conecta el repositorio `DanoMr27/trabajo1`.
3. Elige la rama `claude/inspiring-carson-nic7wb`. Render lee el archivo `render.yaml` y completa
   el resto solo. Si te pide los datos a mano:
   - **Runtime:** Node
   - **Build Command:** (déjalo vacío)
   - **Start Command:** `node server/server.js`
   - **Plan:** Free
4. Te pedirá el valor de `ADMIN_PASSWORD`: esa será la contraseña del panel. Ponle una tuya.
5. Pulsa **Deploy**. Al terminar te da una dirección tipo `https://sotiria.onrender.com`.
6. Vuelve a **Environment** y pon `PUBLIC_URL` con esa misma dirección (para que los enlaces de
   las entradas salgan bien). Guarda; se reinicia solo.

**Para el cliente:**
- Página: `https://sotiria.onrender.com`
- Panel: `https://sotiria.onrender.com/panel/` (con la contraseña que pusiste)

### Dos cosas que debes saber del plan gratis de Render

- **Se duerme** después de 15 minutos sin visitas. La primera vez que alguien entra tarda
  alrededor de un minuto en despertar. Antes de la reunión con el cliente, abre la página unos
  minutos antes para que ya esté despierta.
- **Los datos se borran** cada vez que el servicio se reinicia o se vuelve a publicar: los pedidos
  de prueba, los QR que subas y las entradas emitidas. Para una demostración está bien; para
  usarlo de verdad hay que conectar una base de datos.

---

## Antes de mostrarlo

- [ ] Poner el número real de WhatsApp en `js/data.js` (`CONTACT.whatsapp`).
- [ ] Cambiar los datos de ejemplo: nombre de la obra, fechas, título y precio del libro.
- [ ] Reemplazar las fotos y los videos de muestra.
- [ ] Si usas la opción B, subir en el panel por lo menos un QR de cobro (por ejemplo el de Bs 50)
      para que la demostración se vea completa.
