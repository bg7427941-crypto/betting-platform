require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`Aplicando migración: ${file}`);
    await pool.query(sql);
  }

  console.log('Migraciones completadas.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Error en migración:', err);
  process.exit(1);
});
