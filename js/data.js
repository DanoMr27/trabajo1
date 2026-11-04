/* =====================================================================
   DATOS DEL CATÁLOGO
   ---------------------------------------------------------------------
   Este archivo lo usan tanto la página (navegador) como el servidor
   (server/server.js), así los precios se validan en el servidor y nadie
   puede pagar menos manipulando la página.

   Para agregar un teatro: añade un objeto en VENUES.
   Para agregar un evento: añade un objeto en EVENTS con el id del teatro.
   Los teatros y eventos de abajo son EJEMPLOS: reemplázalos por los reales.
   ===================================================================== */
(function (root) {
  const IMG = (id, w = 1000) =>
    `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

  const CATEGORIES = {
    teatro: { n: "Teatro", i: "🎭" },
    standup: { n: "Stand-up", i: "🎤" },
    musica: { n: "Música", i: "🎵" },
    podcast: { n: "Podcast en vivo", i: "🎙️" },
    infantil: { n: "Infantil", i: "🧸" },
    danza: { n: "Danza", i: "💃" },
  };

  /* Teatros / salas que venden en la plataforma */
  const VENUES = [
    {
      id: "sotiria",
      n: "Teatro SOTIRIA",
      city: "Santa Cruz de la Sierra",
      addr: "Av. Ejemplo 123, 2do anillo",
      cap: 320,
      own: true, // teatro propio del cliente
      c: ["#ff4f6d", "#8b6cff"],
      img: IMG("1507676184212-d03ab07a01bf", 900),
    },
    {
      id: "palmeras",
      n: "Teatro Las Palmeras",
      city: "Santa Cruz de la Sierra",
      addr: "Calle Ejemplo 45, Equipetrol",
      cap: 540,
      c: ["#ffb547", "#ff4f6d"],
      img: IMG("1503095396549-807759245b35", 900),
    },
    {
      id: "norte",
      n: "Auditorio Norte",
      city: "Santa Cruz de la Sierra",
      addr: "Av. Banzer, 6to anillo",
      cap: 1200,
      c: ["#3dd6c6", "#3d5afe"],
      img: IMG("1470229722913-7c0e2dbbafd3", 900),
    },
    {
      id: "cristo",
      n: "Centro Cultural El Cristo",
      city: "Santa Cruz de la Sierra",
      addr: "Av. Monseñor Rivero 200",
      cap: 180,
      c: ["#8b6cff", "#3dd6c6"],
      img: IMG("1516280440614-37939bbacd81", 900),
    },
  ];

  /* Zonas: precio en Bs y cupo total por función */
  const Z = (general, pref, vip, cap = [200, 80, 30]) => [
    { id: "general", n: "General", p: general, cap: cap[0] },
    { id: "preferencial", n: "Preferencial", p: pref, cap: cap[1] },
    { id: "vip", n: "VIP", p: vip, cap: cap[2] },
  ];

  const EVENTS = [
    {
      id: 1,
      t: "Noche de Stand-Up",
      cat: "standup",
      venue: "sotiria",
      d: "2026-11-14",
      h: "20:00",
      dur: "1 h 45 min",
      age: "+18",
      s: "Cuatro comediantes cruceños, una noche de humor sin filtro.",
      long: "Cuatro de los comediantes más filosos de Santa Cruz se turnan el micrófono en una noche de humor sin filtro. Historias de barrio, familia, micros y todo lo que nos pasa a diario.",
      zones: Z(60, 90, 120),
      img: IMG("1503095396549-807759245b35"),
      featured: true,
    },
    {
      id: 2,
      t: "Podcast en Vivo: Historias de Barrio",
      cat: "podcast",
      venue: "sotiria",
      d: "2026-11-21",
      h: "19:30",
      dur: "1 h 30 min",
      age: "+14",
      s: "Grabación en vivo con invitados y preguntas del público.",
      long: "El podcast favorito de la ciudad se graba frente a ti. Invitados sorpresa, historias reales y una ronda de preguntas del público al final.",
      zones: Z(45, 70, 100),
      img: IMG("1590602847861-f357a9332bbc"),
    },
    {
      id: 3,
      t: "El Último Telón",
      cat: "teatro",
      venue: "sotiria",
      d: "2026-11-28",
      h: "20:30",
      dur: "1 h 50 min",
      age: "+12",
      s: "Un drama íntimo sobre un teatro que está por cerrar sus puertas.",
      long: "La última noche de un viejo teatro de barrio reúne a sus actores, técnicos y fantasmas. Un drama íntimo, con humor, sobre lo que significa dejar ir.",
      zones: Z(80, 120, 160),
      img: IMG("1507676184212-d03ab07a01bf"),
      featured: true,
    },
    {
      id: 4,
      t: "Bolero & Luna",
      cat: "musica",
      venue: "palmeras",
      d: "2026-11-15",
      h: "21:00",
      dur: "2 h",
      age: "Todo público",
      s: "Una orquesta de cámara revive los boleros que marcaron generaciones.",
      long: "Doce músicos en escena y tres voces invitadas recorren los boleros más queridos de Latinoamérica, con arreglos nuevos y mucha nostalgia.",
      zones: Z(100, 150, 220, [300, 160, 60]),
      img: IMG("1470229722913-7c0e2dbbafd3"),
      featured: true,
    },
    {
      id: 5,
      t: "Romeo y Julieta en el Chaco",
      cat: "teatro",
      venue: "palmeras",
      d: "2026-12-05",
      h: "20:00",
      dur: "2 h 10 min",
      age: "+12",
      s: "El clásico de Shakespeare trasladado al oriente boliviano.",
      long: "Dos familias ganaderas enfrentadas, un amor imposible y la música del Chaco. Una relectura vibrante del clásico, con elenco de 18 actores.",
      zones: Z(90, 130, 180, [300, 160, 60]),
      img: IMG("1516280440614-37939bbacd81"),
    },
    {
      id: 6,
      t: "Festival de Rock Cruceño",
      cat: "musica",
      venue: "norte",
      d: "2026-12-12",
      h: "18:00",
      dur: "5 h",
      age: "+16",
      s: "Seis bandas locales, un escenario enorme y una noche para gritar.",
      long: "Seis bandas de la escena cruceña comparten escenario en la noche más ruidosa del año. Zona de comidas y bebidas dentro del auditorio.",
      zones: Z(70, 120, 200, [800, 300, 100]),
      img: IMG("1501386761578-eac5c94b800a"),
      featured: true,
    },
    {
      id: 7,
      t: "Gran Gala de Danza Folklórica",
      cat: "danza",
      venue: "norte",
      d: "2026-11-29",
      h: "19:00",
      dur: "2 h",
      age: "Todo público",
      s: "Caporales, taquirari, chovena y más, con 60 bailarines en escena.",
      long: "Un viaje por las danzas de los nueve departamentos con 60 bailarines, vestuario original y músicos en vivo.",
      zones: Z(50, 80, 120, [800, 300, 100]),
      img: IMG("1524368535928-5b5e00ddc76b"),
    },
    {
      id: 8,
      t: "El Circo de los Sueños",
      cat: "infantil",
      venue: "cristo",
      d: "2026-11-22",
      h: "16:00",
      dur: "1 h 10 min",
      age: "Todo público",
      s: "Títeres, acrobacias y canciones para toda la familia.",
      long: "Una función pensada para los más pequeños: títeres gigantes, acrobacias y canciones para cantar con toda la familia. Niños menores de 2 años no pagan.",
      zones: Z(35, 50, 70, [120, 40, 20]),
      img: IMG("1590602847861-f357a9332bbc"),
    },
    {
      id: 9,
      t: "Monólogos de Medianoche",
      cat: "standup",
      venue: "cristo",
      d: "2026-12-04",
      h: "23:00",
      dur: "1 h 20 min",
      age: "+18",
      s: "Stand-up íntimo para 180 personas, cuando la ciudad ya duerme.",
      long: "Formato íntimo, luces bajas y comediantes probando su material más nuevo. Cada función es distinta.",
      zones: Z(50, 70, 90, [120, 40, 20]),
      img: IMG("1501386761578-eac5c94b800a"),
    },
  ];

  /* Videos: "src" acepta un enlace de YouTube (watch, youtu.be o shorts)
     o un archivo .mp4 (puede ser local, p. ej. "videos/adelanto.mp4").
     Por ahora usan un clip de MUESTRA (licencia CC0) para probar el
     reproductor: reemplázalos por los enlaces reales del canal de YouTube. */
  const VIDEOS = [
    {
      t: "Adelanto: Noche de Stand-Up",
      tag: "Adelanto",
      src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      poster: IMG("1503095396549-807759245b35", 900),
      event: 1,
    },
    {
      t: "Mejores momentos del podcast",
      tag: "Podcast",
      src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      poster: IMG("1590602847861-f357a9332bbc", 900),
      event: 2,
    },
    {
      t: "Detrás de cámaras: El Último Telón",
      tag: "Detrás de cámaras",
      src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      poster: IMG("1507676184212-d03ab07a01bf", 900),
      event: 3,
    },
    {
      t: "Así sonó Bolero & Luna",
      tag: "Música",
      src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      poster: IMG("1470229722913-7c0e2dbbafd3", 900),
      event: 4,
    },
  ];

  const GALLERY = [
    { src: IMG("1501386761578-eac5c94b800a", 1200), alt: "Público disfrutando de un espectáculo", tag: "En vivo", title: "La emoción de estar ahí" },
    { src: IMG("1507676184212-d03ab07a01bf", 900), alt: "Artista en escena", tag: "En escena", title: "Cada función, una historia" },
    { src: IMG("1503095396549-807759245b35", 900), alt: "Escenario iluminado", tag: "El espectáculo", title: "Momentos que brillan" },
    { src: IMG("1470229722913-7c0e2dbbafd3", 900), alt: "Concierto en vivo", tag: "Música", title: "La energía del directo" },
    { src: IMG("1516280440614-37939bbacd81", 900), alt: "Artista frente al público", tag: "Talento", title: "El arte de emocionar" },
    { src: IMG("1524368535928-5b5e00ddc76b", 1200), alt: "Público en un evento", tag: "Momentos únicos", title: "Noches para recordar" },
  ];

  /* Contacto para teatros que quieren vender con la plataforma */
  const CONTACT = {
    whatsapp: "59170000000", // código de país + número, sin "+" ni espacios
    email: "ventas@sotiria.tv",
  };

  const DATA = { CATEGORIES, VENUES, EVENTS, VIDEOS, GALLERY, CONTACT };
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  else root.DATA = DATA;
})(this);
