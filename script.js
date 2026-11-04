/* ===== DATOS (reemplazar luego por base de datos / API) ===== */
const SHOWS = [
  {
    id: 1,
    t: "Noche de Stand-Up",
    d: "2026-11-14",
    h: "20:00",
    p: 60,
    s: "Cuatro comediantes cruceños, una noche de humor sin filtro.",
    c: ["#1d5fd0", "#0a2350"],
    img: "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: 2,
    t: "Podcast en Vivo: Historias de Barrio",
    d: "2026-11-21",
    h: "19:30",
    p: 45,
    s: "Grabación en vivo con invitados y preguntas del público.",
    c: ["#f58a1f", "#0a2350"],
    img: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=1000&q=85",
  },
  {
    id: 3,
    t: "Obra: El Último Telón",
    d: "2026-11-28",
    h: "20:30",
    p: 80,
    s: "Un drama íntimo sobre un teatro que está por cerrar sus puertas.",
    c: ["#0a2350", "#050a14"],
    img: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1000&q=85",
  },
];
const ZONAS = {
  general: { n: "General", m: 1 },
  preferencial: { n: "Preferencial", m: 1.5 },
  vip: { n: "VIP", m: 2 },
};
const fmtDate = (d) =>
  new Date(d + "T12:00").toLocaleDateString("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const $ = (s) => document.querySelector(s);

/* ===== RENDER ===== */
$("#shows").innerHTML = SHOWS.map(
  (s) => `
    <article class="card">

        <div class="poster">

            <img
                src="${s.img}"
                alt="Imagen del evento ${s.t}"
                loading="lazy"
            >

            <span>${s.t}</span>

        </div>

        <div class="body">

            <div class="meta">
                ${fmtDate(s.d)} · ${s.h}
            </div>

            <p>${s.s}</p>

            <div class="price">
                desde Bs ${s.p}
            </div>

            <button class="btn" data-id="${s.id}">
                Comprar entrada
            </button>

        </div>

    </article>
`,
).join("");
$("#vids").innerHTML = [
  "Adelanto: Noche de Stand-Up",
  "Mejores momentos del podcast",
  "Detrás de cámaras",
]
  .map(
    (t) =>
      `<div><button class="vid" aria-label="Reproducir ${t}"><span><i></i>${t}</span></button></div>`,
  )
  .join("");

const GALLERY = [
  {
    src: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=85",
    alt: "Público disfrutando de un espectáculo",
    tag: "EN VIVO",
    title: "La emoción de estar ahí",
  },
  {
    src: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=900&q=85",
    alt: "Artista en escena",
    tag: "EN ESCENA",
    title: "Cada función, una historia",
  },
  {
    src: "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=900&q=85",
    alt: "Escenario iluminado",
    tag: "EL ESPECTÁCULO",
    title: "Momentos que brillan",
  },
  {
    src: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=900&q=85",
    alt: "Concierto en vivo",
    tag: "MÚSICA",
    title: "La energía del directo",
  },
  {
    src: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=85",
    alt: "Artista frente al público",
    tag: "TALENTO",
    title: "El arte de emocionar",
  },
  {
    src: "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=85",
    alt: "Público disfrutando de un evento",
    tag: "MOMENTOS ÚNICOS",
    title: "Noches para recordar",
  },
];

$("#gal").innerHTML = GALLERY.map(
  (photo, index) => `
    <figure class="gallery-item gallery-item-${index + 1}">
        <img
            src="${photo.src}"
            alt="${photo.alt}"
            loading="lazy"
        >
        <div class="gallery-overlay">
            <span class="gallery-tag">${photo.tag}</span>
            <figcaption>${photo.title}</figcaption>
        </div>
        <span class="gallery-number">0${index + 1}</span>
    </figure>
`,
).join("");

/* ===== FLUJO DE COMPRA ===== */
let st;
const ov = $("#ov"),
  body = $("#mbody");
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-id]");
  if (b) open(+b.dataset.id);
});
$("#x").onclick = close;
ov.onclick = (e) => {
  if (e.target === ov) close();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
});
function open(id) {
  st = {
    show: SHOWS.find((s) => s.id === id),
    zona: "general",
    qty: 1,
    step: 0,
    pay: "qr",
    user: {},
  };
  ov.classList.add("open");
  draw();
}
function close() {
  ov.classList.remove("open");
}
const total = () => st.show.p * ZONAS[st.zona].m * st.qty;
function bar() {
  body.classList.remove("in");
  void body.offsetWidth;
  body.classList.add("in");
  $(".modal").style.setProperty("--sc", st.show.c[0]);
  document
    .querySelectorAll("#steps b")
    .forEach((b, i) => b.classList.toggle("on", i <= st.step));
}

function draw() {
  bar();
  if (st.step === 0) {
    body.innerHTML = `<h3 id="mt">${st.show.t}</h3><p class="meta">${fmtDate(st.show.d)} · ${st.show.h}</p>
    <label for="z">Zona</label><select id="z">${Object.entries(ZONAS)
      .map(
        ([k, z]) =>
          `<option value="${k}" ${k === st.zona ? "selected" : ""}>${z.n} – Bs ${st.show.p * z.m}</option>`,
      )
      .join("")}</select>
    <label>Cantidad</label><div class="qty"><button id="m" aria-label="Menos">−</button><b id="q">${st.qty}</b><button id="p" aria-label="Más">+</button></div>
    <div class="summary"><span>Total</span><span id="tt">Bs ${total()}</span></div>
    <div class="nav"><span></span><button class="btn" id="nx">Continuar</button></div>`;
    $("#z").onchange = (e) => {
      st.zona = e.target.value;
      $("#tt").textContent = "Bs " + total();
    };
    $("#m").onclick = () => {
      st.qty = Math.max(1, st.qty - 1);
      $("#q").textContent = st.qty;
      $("#tt").textContent = "Bs " + total();
    };
    $("#p").onclick = () => {
      st.qty = Math.min(10, st.qty + 1);
      $("#q").textContent = st.qty;
      $("#tt").textContent = "Bs " + total();
    };
    $("#nx").onclick = () => {
      st.step = 1;
      draw();
    };
  }
  if (st.step === 1) {
    const u = st.user;
    body.innerHTML = `<h3 id="mt">Tus datos</h3>
    <label for="n">Nombre completo</label><input id="n" autocomplete="name" value="${u.n || ""}">
    <div class="row"><div><label for="ci">CI / Documento</label><input id="ci" inputmode="numeric" value="${u.ci || ""}"></div>
    <div><label for="tel">Celular</label><input id="tel" type="tel" autocomplete="tel" value="${u.tel || ""}"></div></div>
    <label for="em">Correo (aquí enviaremos tu entrada)</label><input id="em" type="email" autocomplete="email" value="${u.em || ""}">
    <div class="error" id="er"></div>
    <div class="nav"><button class="btn ghost" id="bk">Atrás</button><button class="btn" id="nx">Ir a pagar</button></div>`;
    $("#bk").onclick = () => {
      st.step = 0;
      draw();
    };
    $("#nx").onclick = () => {
      const v = {
        n: $("#n").value.trim(),
        ci: $("#ci").value.trim(),
        tel: $("#tel").value.trim(),
        em: $("#em").value.trim(),
      };
      const bad = [];
      if (v.n.length < 3) bad.push("n");
      if (!/^\d{5,}/.test(v.ci)) bad.push("ci");
      if (!/^\+?\d{7,}$/.test(v.tel.replace(/\s/g, ""))) bad.push("tel");
      if (!/^\S+@\S+\.\S+$/.test(v.em)) bad.push("em");
      ["n", "ci", "tel", "em"].forEach((k) =>
        $("#" + k).classList.toggle("err", bad.includes(k)),
      );
      if (bad.length) {
        $("#er").textContent = "Revisa los campos marcados en rojo.";
        return;
      }
      st.user = v;
      st.step = 2;
      draw();
    };
  }
  if (st.step === 2) {
    body.innerHTML = `<h3 id="mt">Pago</h3>
    <div class="summary"><span>${st.qty} × ${ZONAS[st.zona].n}</span><span>Bs ${total()}</span></div>
    <div class="tabs" role="tablist"><button data-m="qr" class="${st.pay === "qr" ? "on" : ""}">Pagar con QR</button><button data-m="card" class="${st.pay === "card" ? "on" : ""}">Tarjeta</button></div>
    <div id="pm"></div><div class="error" id="er"></div>
    <div class="nav"><button class="btn ghost" id="bk">Atrás</button><button class="btn" id="nx">Confirmar pago</button></div>`;
    body.querySelectorAll(".tabs button").forEach(
      (b) =>
        (b.onclick = () => {
          st.pay = b.dataset.m;
          draw();
        }),
    );
    $("#bk").onclick = () => {
      st.step = 1;
      draw();
    };
    if (st.pay === "qr") {
      $("#pm").innerHTML =
        `<div class="qrbox"><div class="qrf">${fakeQR()}<i class="scan"></i><u></u><u></u><u></u><u></u></div><p class="status"><span class="dot"></span>Esperando tu pago de Bs ${total()}</p><p class="msg">Abre la app de tu banco, escanea y confirma. Al terminar, toca “Confirmar pago”. (El QR real se generará al conectar el servicio de pagos.)</p></div>`;
    } else {
      $("#pm").innerHTML =
        `${cardPreview()}<label for="cn">Número de tarjeta (crédito o débito)</label><input id="cn" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" autocomplete="cc-number">
      <label for="ch">Nombre en la tarjeta</label><input id="ch" autocomplete="cc-name">
      <div class="row"><div><label for="ex">Vence (MM/AA)</label><input id="ex" maxlength="5" placeholder="MM/AA" autocomplete="cc-exp"></div>
      <div><label for="cv">CVV</label><input id="cv" inputmode="numeric" maxlength="4" autocomplete="cc-csc"></div></div>
      <p class="msg">Los datos de la tarjeta no se guardan. El cobro real se conectará después.</p>`;
      $("#cn").oninput = (e) =>
        (e.target.value = e.target.value
          .replace(/\D/g, "")
          .slice(0, 16)
          .replace(/(\d{4})(?=\d)/g, "$1 "));
      $("#ex").oninput = (e) => {
        let v = e.target.value.replace(/\D/g, "").slice(0, 4);
        e.target.value = v.length > 2 ? v.slice(0, 2) + "/" + v.slice(2) : v;
      };
      const up = () => {
        $("#pn").textContent = $("#cn")
          .value.replace(/\D/g, "")
          .padEnd(16, "•")
          .replace(/(.{4})(?=.)/g, "$1 ");
        $("#ph").textContent = $("#ch").value || "Nombre Apellido";
        $("#pe").textContent = $("#ex").value || "MM/AA";
        $("#pc").textContent = $("#cv").value.replace(/./g, "•") || "•••";
      };
      ["cn", "ch", "ex", "cv"].forEach((k) => {
        $("#" + k).addEventListener("input", up);
        $("#" + k).addEventListener("focus", () =>
          $(".cc").classList.toggle("flip", k === "cv"),
        );
      });
    }
    $("#nx").onclick = () => {
      if (st.pay === "card") {
        const n = $("#cn").value.replace(/\s/g, ""),
          ex = $("#ex").value,
          cv = $("#cv").value;
        if (
          !luhn(n) ||
          $("#ch").value.trim().length < 3 ||
          !/^(0[1-9]|1[0-2])\/\d\d$/.test(ex) ||
          !/^\d{3,4}$/.test(cv)
        ) {
          $("#er").textContent = "Revisa los datos de la tarjeta.";
          return;
        }
      }
      /* TODO backend: aquí se llamará a la API de pago (QR / tarjeta) y se esperará la confirmación */
      st.code = "ST-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      st.step = 3;
      st.proc = true;
      draw();
      setTimeout(() => {
        st.proc = false;
        draw();
        burst();
      }, 2000);
    };
  }
  if (st.step === 3) {
    if (st.proc) {
      body.innerHTML = `<div class="proc"><div class="hex"></div><h3 id="mt">${st.pay === "qr" ? "Confirmando tu pago…" : "Procesando tu tarjeta…"}</h3><p class="msg">Un segundo, estamos guardando tu asiento.</p></div>`;
      return;
    }
    const first = esc(st.user.n.split(" ")[0]);
    body.innerHTML = `<div class="done"><svg class="ok" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg><h3 id="mt">¡Listo, ${first}! Tu asiento te espera.</h3></div>
    <div class="ticket2"><div class="tl"><small>Soti Tv presenta</small><b>${st.show.t}</b><span>${fmtDate(st.show.d)} · ${st.show.h}</span><span>${st.qty} × ${ZONAS[st.zona].n} · Bs ${total()}</span></div><div class="ts"><small>Código</small><strong>${st.code}</strong><div class="bars"></div></div></div>
    <p class="msg">Te enviaremos la entrada a ${esc(st.user.em)}. Muéstrala en la puerta. (Demostración: aún no se procesa ningún pago real.)</p>
    <div class="nav"><span></span><button class="btn" id="nx">Cerrar</button></div>`;
    $("#nx").onclick = close;
  }
}
function luhn(n) {
  if (!/^\d{13,19}$/.test(n)) return false;
  let s = 0,
    d = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let x = +n[i];
    if (d) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    s += x;
    d = !d;
  }
  return s % 10 === 0;
}
function fakeQR() {
  let r = "";
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      const f = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (
        f
          ? x % 14 < 7 &&
            y % 14 < 7 &&
            (x % 14 == 0 ||
              x % 14 == 6 ||
              y % 14 == 0 ||
              y % 14 == 6 ||
              (x % 14 > 1 && x % 14 < 5 && y % 14 > 1 && y % 14 < 5))
          : Math.random() > 0.5
      )
        r += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  return `<svg viewBox="0 0 21 21" fill="#050a14" role="img" aria-label="QR de ejemplo">${r}</svg>`;
}

/* Cuenta regresiva a la próxima función */
(function () {
  const t = new Date(SHOWS[0].d + "T" + SHOWS[0].h),
    el = document.getElementById("cd");
  function tick() {
    const ms = t - new Date();
    if (ms <= 0) {
      el.textContent = "¡Hoy hay función!";
      return;
    }
    const d = Math.floor(ms / 864e5),
      hh = Math.floor(ms / 36e5) % 24,
      m = Math.floor(ms / 6e4) % 60;
    el.innerHTML = `Próxima función en <b>${d} d ${String(hh).padStart(2, "0")} h ${String(m).padStart(2, "0")} min</b>`;
  }
  tick();
  setInterval(tick, 3e4);
})();

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function cardPreview() {
  return `<div class="cc"><div class="cf"><i class="chip"></i><div class="num" id="pn">•••• •••• •••• ••••</div><div class="r2"><span id="ph">Nombre Apellido</span><span id="pe">MM/AA</span></div></div><div class="cb"><div class="mag"></div><div class="sig">CVV <span id="pc">•••</span></div></div></div>`;
}
function burst() {
  const c = document.createElement("div");
  c.className = "confetti";
  const k = ["#f6b02a", "#f58a1f", "#1d5fd0", "#f2ead0", "#0a2350"];
  for (let i = 0; i < 44; i++) {
    const s = document.createElement("i");
    s.style.cssText = `left:${Math.random() * 100}%;background:${k[i % 5]};animation-delay:${Math.random() * 0.6}s;animation-duration:${2 + Math.random() * 1.6}s;--x:${(Math.random() - 0.5) * 160}px`;
    c.appendChild(s);
  }
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 4500);
}
