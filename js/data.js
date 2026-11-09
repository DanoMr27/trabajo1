/* =====================================================================
   DATOS DE LA PÁGINA
   ---------------------------------------------------------------------
   Lo usan la página (navegador) y el servidor (server/server.js). Así
   los precios siempre se calculan en el servidor.

   ⚠ Los textos, fechas, imágenes y el precio del libro son de EJEMPLO:
     reemplázalos por los reales.
   ===================================================================== */
(function (root) {
  const IMG = (id, w = 1200) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

  const PRODUCTS = {
    /* ---------- LA OBRA ---------- */
    obra: {
      id: "obra",
      type: "show",
      /* Título, frase y sinopsis: del díptico oficial de Sotiria Teatro
         (comedia musical, texto y dirección de David Arce) */
      t: "La Última Jugada",
      tag: "La obra",
      s: "Una partida. Una noche. Una vida en juego.",
      long:
        "Armando lo tiene todo: a los 30 años está a punto de cerrar el negocio más grande de su vida. " +
        "Pero en plena firma llega la Muerte, que viene a buscarlo esta misma noche. " +
        "Armando propone un último trato: una partida de ajedrez. Si gana, vive. " +
        "Con humor, canciones y mucha humanidad, una comedia musical sobre lo que realmente importa cuando se acaba el tiempo.",
      venue: "Teatro SOTIRIA",
      addr: "Av. Ejemplo 123, Santa Cruz de la Sierra",
      dur: "1 h 50 min",
      age: "+12",
      price: 50, // Bs por entrada
      maxQty: 10, // máximo por compra (hay un QR de cobro por cada monto)
      unit: ["entrada", "entradas"],
      /* Funciones: agrega o quita fechas. "cap" = entradas disponibles */
      funciones: [
        { id: "f1", d: "2026-11-28", h: "20:30", cap: 300 },
        { id: "f2", d: "2026-11-29", h: "20:30", cap: 300 },
      ],
      img: "img/obra-la-ultima-jugada.jpg", // foto de portada del díptico (tablero de ajedrez)
      c: ["#be1d25", "#0b0b0d"],
    },

    /* ---------- EL LIBRO ---------- */
    libro: {
      id: "libro",
      type: "book",
      t: "La última jugada",
      tag: "El libro",
      author: "David Arce",
      s: "Las historias detrás del escenario, ahora en papel.",
      long:
        "¿Qué harías si, justo en la gloria de tu éxito, la Muerte se sentara a jugar su última partida contigo a cambio de un segundo más de vida?." +
        "Descúbrelo en La Última Jugada, un thriller existencial lleno de humor, música y secretos donde cada pieza del tablero puede ser tu última oportunidad de redimirte.",
      price: 100, // Bs por libro
      maxQty: 5,
      unit: ["libro", "libros"],
      /* Formas de entrega que el comprador puede elegir */
      delivery: [
        { id: "retiro", n: "Retiro en la función de la obra" },
        { id: "envio", n: "Envío dentro de Santa Cruz (se coordina por WhatsApp)", needsAddress: true },
      ],
      cap: 500,
      img: "img/libro-la-ultima-jugada.jpg",
      c: ["#be1d25", "#2a2a30"],
    },

    /* ---------- EL PODCAST (próximamente) ---------- */
    podcast: {
      id: "podcast",
      type: "soon",
      t: "El podcast",
      tag: "Próximamente",
      s: "Historias, invitados y conversaciones sin filtro. Muy pronto.",
      long: "Estamos preparando algo nuevo. Déjanos tu WhatsApp y te avisamos el día del estreno.",
      img: IMG("1590602847861-f357a9332bbc"),
      c: ["#3a3a42", "#be1d25"],
    },
  };

  /* Videos: archivo local en videos/ o enlace de YouTube (watch, youtu.be o shorts).
     Sin "src", la tarjeta se muestra con su imagen y sin botón de reproducir. */
  const VIDEOS = [
    {
      t: "Adelanto: La última jugada",
      tag: "Adelanto",
      src: "videos/LaObra.mp4",
      poster: "img/obra-la-ultima-jugada.jpg",
      product: "obra",
    },
    {
      t: "Presentación de La última jugada",
      tag: "El libro",
      src: "videos/la_ultima_jugada_loop_4s.mp4",
      poster: "img/libro-la-ultima-jugada.jpg",
      product: "libro",
    },
    {
      t: "Primer vistazo al podcast",
      tag: "Próximamente",
      src: "", // ⚠ falta el video del micrófono: agregar "videos/NOMBRE.mp4"
      poster: IMG("1590602847861-f357a9332bbc", 900),
    },
  ];

  /* ⚠ Número de WhatsApp de ventas: código de país + número, sin "+" ni espacios */
  const CONTACT = { whatsapp: "59177314953", email: "ventas@sotiria.tv" };

  /* Montos que necesitan un QR de cobro (uno por cada cantidad posible) */
  const QR_AMOUNTS = [
    ...new Set(
      Object.values(PRODUCTS)
        .filter((p) => p.price)
        .flatMap((p) => Array.from({ length: p.maxQty }, (_, i) => p.price * (i + 1))),
    ),
  ].sort((a, b) => a - b);

  const DATA = { PRODUCTS, VIDEOS, CONTACT, QR_AMOUNTS };
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  else root.DATA = DATA;
})(this);
