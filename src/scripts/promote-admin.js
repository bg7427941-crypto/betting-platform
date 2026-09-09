/**
 * Promueve un usuario existente a rol 'admin'.
 * Uso: node src/scripts/promote-admin.js correo@ejemplo.com
 *
 * A propósito NO existe un endpoint HTTP para esto: dejar una ruta que
 * permita auto-ascender a admin (aunque sea "solo para el primer usuario")
 * es una vulnerabilidad de escalación de privilegios clásica. Esto se
 * corre a mano, desde tu máquina, con acceso directo a la base de datos.
 */
require('dotenv').config();
const { pool } = require('../db');

async function promote(email) {
  if (!email) {
    console.error('Uso: node src/scripts/promote-admin.js correo@ejemplo.com');
    process.exit(1);
  }

  const result = await pool.query(
    `UPDATE users SET role = 'admin', updated_at = now() WHERE email = $1 RETURNING id, email, role`,
    [email]
  );

  if (result.rows.length === 0) {
    console.error(`No se encontró ningún usuario con email: ${email}`);
  } else {
    console.log('Usuario promovido a admin:', result.rows[0]);
  }

  await pool.end();
}

promote(process.argv[2]);
