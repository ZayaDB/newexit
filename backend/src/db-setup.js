// Creates the tables and base categories on a brand-new database by running
// every file in supabase/migrations in order. Only for an empty database.
// Usage: npm run db:setup
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/db');

const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');

async function setup() {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    console.log('Applied', file);
  }
  console.log('Database ready.');
  await pool.end();
}

setup().catch(async (err) => {
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
