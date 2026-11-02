const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function formatUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isVerified: user.isVerified,
    avatar: user.avatar,
    location: user.location,
    points: user.points,
    badge: user.badge,
    language: user.language,
  };
}

// One canonical form per phone number, so "010-1234-5678", "01012345678" and
// "+82 10 1234 5678" are the same account. Korean numbers are stored as 010…;
// other countries keep their +country code. Same rule as the DB migration.
function normalizePhone(value) {
  if (typeof value !== 'string') return undefined;
  const hasPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '');
  if (!digits) return undefined;
  if (hasPlus && digits.startsWith('82')) return `0${digits.slice(2)}`;
  return hasPlus ? `+${digits}` : digits;
}

function clean(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

router.post('/register', async (req, res) => {
  try {
    const name = clean(req.body.name);
    const email = clean(req.body.email)?.toLowerCase();
    const phone = normalizePhone(req.body.phone);
    const { password } = req.body;

    if (!name || (!email && !phone) || !password) {
      return res.status(400).json({ message: 'Бүх заавал талбарыг бөглөнө үү' });
    }

    const exists = await query(
      'select 1 from public.users where ($1::text is not null and email = $1) or ($2::text is not null and phone = $2) limit 1',
      [email ?? null, phone ?? null]
    );
    if (exists.rowCount) {
      return res.status(409).json({ message: 'Бүртгэлтэй хэрэглэгч байна' });
    }

    const hashed = await bcrypt.hash(String(password), 10);
    const { rows } = await query(
      `insert into public.users (name, email, phone, password, is_verified)
       values ($1, $2, $3, $4, true) returning *`,
      [name, email ?? null, phone ?? null, hashed]
    );
    const user = serialize.user(rows[0]);

    res.status(201).json({ token: signToken(user.id), user: formatUser(user) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Бүртгэлтэй хэрэглэгч байна' });
    }
    res.status(500).json({ message: error.message });
  }
});

async function loginBy(column, value, password) {
  if (!value || !password) return null;
  const { rows } = await query(`select * from public.users where ${column} = $1`, [value]);
  const row = rows[0];
  if (!row || !row.password) return null;
  const valid = await bcrypt.compare(String(password), row.password);
  return valid ? serialize.user(row) : null;
}

router.post('/login/email', async (req, res) => {
  try {
    const email = clean(req.body.email)?.toLowerCase();
    const user = await loginBy('email', email, req.body.password);
    if (!user) {
      return res.status(401).json({ message: 'Имэйл эсвэл нууц үг буруу' });
    }
    res.json({ token: signToken(user.id), user: formatUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/login/phone', async (req, res) => {
  try {
    const user = await loginBy('phone', normalizePhone(req.body.phone), req.body.password);
    if (!user) {
      return res.status(401).json({ message: 'Утас эсвэл нууц үг буруу' });
    }
    res.json({ token: signToken(user.id), user: formatUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/me', auth, async (req, res) => {
  res.json({ user: formatUser(req.user) });
});

module.exports = router;
