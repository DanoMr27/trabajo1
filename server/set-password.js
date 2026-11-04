/* =====================================================================
   Crea o cambia la contraseña del panel del propietario.
   Uso:   node server/set-password.js

   La contraseña no se guarda tal cual: se guarda un hash (scrypt) en
   server/admin.json, que no se sube a GitHub (.gitignore).
   Si el servidor está corriendo, la nueva contraseña vale al instante.
   ===================================================================== */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const FILE = path.join(__dirname, "admin.json");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

(async () => {
  console.log("Contraseña del panel del propietario (mínimo 10 caracteres).");
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
  console.log("✓ Contraseña guardada. Entra en http://localhost:3000/admin.html");
  console.log("  (Si cambiaste la contraseña, las sesiones abiertas siguen activas hasta 8 h o hasta reiniciar el servidor.)");
})();
