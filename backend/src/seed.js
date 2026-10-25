// Resets the database to the demo data in supabase/seed.sql.
// Usage: npm run seed            (demo data only)
//        npm run seed -- --schema  (create tables first, for a brand-new database)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/db');

const root = path.join(__dirname, '..', '..', 'supabase');

async function run(file) {
  const sql = fs.readFileSync(path.join(root, file), 'utf8');
  await pool.query(sql);
  console.log('Applied', file);
}

async function seed() {
  if (process.argv.includes('--schema')) {
    const migrations = fs.readdirSync(path.join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const file of migrations) await run(path.join('migrations', file));
  }
  await run('seed.sql');

  console.log('Seed complete!');
  console.log('Demo accounts (password: demo1234):');
  console.log('  Buyer:  buyer@newexit.mn');
  console.log('  Seller: seller@newexit.mn');
  console.log('  Mover:  mover@newexit.mn');
  await pool.end();
}

seed().catch(async (err) => {
  console.error(err.message);
  await pool.end();
  process.exit(1);
});
