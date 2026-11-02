const { Pool, types } = require('pg');

// Return bigint counts (count(*)) as JS numbers instead of strings.
types.setTypeParser(20, (value) => parseInt(value, 10));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy backend/.env.example to backend/.env and paste your Supabase connection string.'
  );
}

const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  // On Netlify each function instance handles one request at a time, so keep
  // the pool small there (PG_POOL_MAX=2) to avoid exhausting Supabase connections.
  max: parseInt(process.env.PG_POOL_MAX || '10', 10),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Postgres pool error:', err.message);
});

async function connectDB() {
  await pool.query('select 1');
  const host = connectionString.replace(/^.*@/, '').replace(/\/.*$/, '');
  console.log('Postgres connected:', host);
}

function query(text, params) {
  return pool.query(text, params);
}

// Runs fn(client) inside a transaction; rolls back if fn throws.
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction, connectDB };
