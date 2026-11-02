// Checks that backend/.env can reach the database.
// If a Supabase pooler address points at the wrong pooler cluster
// (aws-0-… vs aws-1-…), it tries the other one and fixes .env automatically.
// Usage: npm run db:check
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const envPath = path.join(__dirname, '..', '.env');

function readEnvUrl() {
  if (!fs.existsSync(envPath)) return null;
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='));
  return line ? line.slice('DATABASE_URL='.length).trim() : null;
}

function mask(url) {
  return url.replace(/:[^:@/]+@/, ':****@');
}

async function tryConnect(url) {
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  const client = new Client({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    const { rows } = await client.query(
      'select current_user, (select count(*)::int from public.categories) as categories'
    );
    return { ok: true, info: rows[0] };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    await client.end().catch(() => {});
  }
}

function alternatives(url) {
  const m = url.match(/@aws-(\d+)-([a-z0-9-]+)\.pooler\.supabase\.com/);
  if (!m) return [];
  return ['0', '1', '2']
    .filter((n) => n !== m[1])
    .map((n) => url.replace(`@aws-${m[1]}-${m[2]}`, `@aws-${n}-${m[2]}`));
}

async function main() {
  const url = readEnvUrl();
  if (!url) {
    console.error('backend/.env has no DATABASE_URL. Copy .env.example to .env first.');
    process.exit(1);
  }

  console.log('Trying', mask(url));
  let result = await tryConnect(url);
  if (result.ok) return done(result);
  console.log('  failed:', result.error);

  for (const alt of alternatives(url)) {
    console.log('Trying', mask(alt));
    result = await tryConnect(alt);
    if (result.ok) {
      const env = fs.readFileSync(envPath, 'utf8').replace(`DATABASE_URL=${url}`, `DATABASE_URL=${alt}`);
      fs.writeFileSync(envPath, env);
      console.log('  works — updated DATABASE_URL in backend/.env');
      return done(result);
    }
    console.log('  failed:', result.error);
  }

  console.error('\nCould not connect. Check that the Supabase project is running (not paused)');
  console.error('and that the password in DATABASE_URL is correct.');
  process.exit(1);
}

function done(result) {
  console.log(`\nConnected as ${result.info.current_user} — ${result.info.categories} categories found. Database OK.`);
}

main();
