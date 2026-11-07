/* =====================================================================
   Crea o cambia una contraseña del panel.
   Uso:
     node server/set-password.js             → administrador (acceso completo)
     node server/set-password.js validator   → validador (solo comprobantes)

   La contraseña no se guarda tal cual: se guarda un hash (scrypt) en
   server/admin.json o server/validator.json, que no se suben a GitHub.
   Si el servidor está corriendo, la nueva contraseña vale al instante.
   ===================================================================== */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const ROLES = {
  admin: { file: "admin.json", label: "del ADMINISTRADOR (acceso completo)" },
  validator: { file: "validator.json", label: "del VALIDADOR (solo comprobantes)" },
};
const arg = (process.argv[2] || "admin").toLowerCase();
const role = { admin: "admin", administrador: "admin", validator: "validator", validador: "validator" }[arg];
if (!role) {
  console.error(`✗ Rol desconocido: "${arg}". Usa: node server/set-password.js [admin|validator]`);
  process.exit(1);
}
const FILE = path.join(__dirname, ROLES[role].file);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

(async () => {
  console.log(`Contraseña ${ROLES[role].label} — mínimo 10 caracteres.`);
  const a = await ask("Nueva contraseña: ");
  if (a.length < 10) {
    console.error("✗ Muy corta. Usa al menos 10 caracteres.");
    process.exit(1);
  }
  const b = await ask("Repítela: ");
  rl.close();
  if (a !== b) {
    console.error("✗ No coinciden. No se guardó nada.");
    process.exit(1);
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(a, salt, 64);
  fs.writeFileSync(FILE, JSON.stringify({ salt: salt.toString("hex"), hash: hash.toString("hex"), updatedAt: new Date().toISOString() }, null, 2));
  console.log(`✓ Contraseña ${ROLES[role].label} guardada en server/${ROLES[role].file}.`);
  console.log("  Entra en http://localhost:3000/admin.html");
  if (process.env[role === "admin" ? "ADMIN_PASSWORD" : "VALIDATOR_PASSWORD"])
    console.log(`  Ojo: la variable ${role === "admin" ? "ADMIN_PASSWORD" : "VALIDATOR_PASSWORD"} está definida y tiene prioridad sobre este archivo.`);
})();
