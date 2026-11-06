/* Página de la entrada: la abre el cliente (enlace de WhatsApp) o el
   personal de puerta al escanear el QR. Si hay sesión del panel,
   muestra el botón "Registrar ingreso". */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const code = new URLSearchParams(location.search).get("c") || "";

function qrSVG(text) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: "QR de la entrada" });
}

async function load() {
  let t;
  try {
    const r = await fetch("/api/tickets/" + encodeURIComponent(code));
    t = await r.json();
    if (!r.ok) throw new Error(t.error);
  } catch (e) {
    $("#tk").innerHTML = `<div class="tk-mid"><h1>Entrada no encontrada</h1><p class="bad">${esc(e.message || "Revisa el enlace que te enviamos por WhatsApp.")}</p></div>`;
    return;
  }
  const left = t.qty - t.checkedIn;
  $("#tk").innerHTML = `
    <div class="tk-top"><small>Entrada · ${esc(t.lugar)}</small><h1>${esc(t.titulo)}</h1></div>
    <dl class="tk-mid">
      <div><dt>Fecha</dt><dd>${esc(t.fecha.charAt(0).toUpperCase() + t.fecha.slice(1))}</dd></div>
      <div><dt>Lugar</dt><dd>${esc(t.lugar)} · ${esc(t.addr)}</dd></div>
      <div><dt>Titular</dt><dd>${esc(t.nombre)}${t.ci ? " · CI " + esc(t.ci) : ""}</dd></div>
      <div><dt>Válida para</dt><dd>${t.qty} ${t.qty === 1 ? "persona" : "personas"}</dd></div>
    </dl>
    <div class="tk-cut"></div>
    <div class="tk-qr">
      <div class="q">${qrSVG(location.href)}</div>
      <strong>${esc(t.code)}</strong>
      <p class="state ${t.valid ? "" : "bad"}">${!t.valid ? "Entrada no válida" : t.checkedIn ? `Ingresaron ${t.checkedIn} de ${t.qty}` : "Muéstrala en la puerta"}</p>
      ${
        t.admin
          ? `<div class="door" id="door">${
              left > 0 && t.valid
                ? `<p><b>Puerta:</b> quedan ${left} ${left === 1 ? "ingreso" : "ingresos"}.</p><button class="btn block" id="ck">Registrar ingreso</button>`
                : `<p class="big-bad">✗ ${t.valid ? "Entrada ya usada por completo" : "Entrada no válida"}</p>`
            }</div>`
          : ""
      }
    </div>`;
  const ck = $("#ck");
  if (ck)
    ck.onclick = async () => {
      ck.disabled = true;
      const r = await fetch(`/api/admin/tickets/${encodeURIComponent(t.code)}/checkin`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      $("#door").innerHTML = r.ok ? `<p class="big-ok">✓ Puede ingresar</p><p>${esc(j.nombre)} · ingreso ${j.checkedIn} de ${j.qty}</p>` : `<p class="big-bad">✗ ${esc(j.error || "Error")}</p>`;
      setTimeout(load, 2500);
    };
}
load();
