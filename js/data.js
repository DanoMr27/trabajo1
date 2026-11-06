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
      t: "El Último Telón",
      tag: "La obra",
      s: "Un drama íntimo sobre un teatro que está por cerrar sus puertas.",
      long:
        "La última noche de un viejo teatro de barrio reúne a sus actores, técnicos y fantasmas. " +
        "Un drama íntimo, con humor, sobre lo que significa dejar ir.",
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
      img: IMG("1507676184212-d03ab07a01bf"),
      c: ["#ff4f6d", "#8b6cff"],
    },

    /* ---------- EL LIBRO ---------- */
    libro: {
      id: "libro",
      type: "book",
      t: "La última jugada",
      tag: "El libro",
      author: "Simón Arce",
      s: "Las historias detrás del escenario, ahora en papel.",
      long:
        "Escribe aquí la presentación del libro: de qué trata, por qué leerlo y qué lo hace especial. " +
        "Puedes incluir el número de páginas, el formato y si viene firmado.",
      price: 100, // Bs por libro
      maxQty: 5,
      unit: ["libro", "libros"],
      /* Formas de entrega que el comprador puede elegir */
      delivery: [
        { id: "retiro", n: "Retiro en la función de la obra" },
        { id: "envio", n: "Envío dentro de Santa Cruz (se coordina por WhatsApp)", needsAddress: true },
      ],
      cap: 500,
      img: IMG("1512820790803-83ca734da794"),
      c: ["#ffb547", "#ff4f6d"],
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
      c: ["#3dd6c6", "#8b6cff"],
    },
  };

  /* Videos: enlace de YouTube (watch, youtu.be o shorts) o archivo .mp4.
     ⚠ Clip de MUESTRA: reemplázalo por los enlaces reales. */
  const SAMPLE = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
  const VIDEOS = [
    { t: "Adelanto: El Último Telón", tag: "Adelanto", src: SAMPLE, poster: IMG("1507676184212-d03ab07a01bf", 900), product: "obra" },
    { t: "Detrás de cámaras", tag: "Detrás de cámaras", src: SAMPLE, poster: IMG("1516280440614-37939bbacd81", 900), product: "obra" },
    { t: "Presentación del libro", tag: "El libro", src: SAMPLE, poster: IMG("1512820790803-83ca734da794", 900), product: "libro" },
    { t: "Primer vistazo al podcast", tag: "Próximamente", src: SAMPLE, poster: IMG("1590602847861-f357a9332bbc", 900) },
  ];

  const GALLERY = [
    { src: IMG("1501386761578-eac5c94b800a"), alt: "Público disfrutando de la función", tag: "En vivo", title: "La emoción de estar ahí" },
    { src: IMG("1507676184212-d03ab07a01bf", 900), alt: "Actores en escena", tag: "En escena", title: "Cada función, una historia" },
    { src: IMG("1503095396549-807759245b35", 900), alt: "Escenario iluminado", tag: "El espectáculo", title: "Momentos que brillan" },
    { src: IMG("1516280440614-37939bbacd81", 900), alt: "Artista frente al público", tag: "Talento", title: "El arte de emocionar" },
    { src: IMG("1524368535928-5b5e00ddc76b", 900), alt: "Público en el teatro", tag: "Momentos únicos", title: "Noches para recordar" },
  ];

  /* ⚠ Número de WhatsApp de ventas: código de país + número, sin "+" ni espacios */
  const CONTACT = { whatsapp: "59170000000", email: "ventas@sotiria.tv" };

  /* Montos que necesitan un QR de cobro (uno por cada cantidad posible) */
  const QR_AMOUNTS = [
    ...new Set(
      Object.values(PRODUCTS)
        .filter((p) => p.price)
        .flatMap((p) => Array.from({ length: p.maxQty }, (_, i) => p.price * (i + 1))),
    ),
  ].sort((a, b) => a - b);

  const DATA = { PRODUCTS, VIDEOS, GALLERY, CONTACT, QR_AMOUNTS };
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  else root.DATA = DATA;
})(this);
