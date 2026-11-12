const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, transaction } = require('../config/db');
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
  const { rows } = await query(
    `select * from public.users where ${column} = $1 and deleted_at is null`,
    [value]
  );
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

const LANGUAGES = ['mn', 'kr', 'en'];

// Avatars must be images uploaded through POST /api/images.
const AVATAR_URL = /^https?:\/\/[^\s/]+\/api\/images\/[\w.-]+$/;

// Edit my profile: name, location, language, avatar (null removes it).
router.patch('/me', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const name = b.name === undefined ? undefined : clean(b.name);
    const location = b.location === undefined ? undefined : clean(b.location);
    if (b.name !== undefined && (!name || name.length > 50)) {
      return res.status(400).json({ message: 'Нэр буруу байна' });
    }
    if (location && location.length > 100) {
      return res.status(400).json({ message: 'Байршил хэт урт байна' });
    }
    if (b.language !== undefined && !LANGUAGES.includes(b.language)) {
      return res.status(400).json({ message: 'Хэл буруу байна' });
    }
    if (b.avatar !== undefined && b.avatar !== null) {
      if (typeof b.avatar !== 'string' || b.avatar.length > 500 || !AVATAR_URL.test(b.avatar)) {
        return res.status(400).json({ message: 'Зураг буруу байна' });
      }
    }
    const { rows } = await query(
      `update public.users set
         name = coalesce($2, name),
         location = case when $5 then $3 else location end,
         language = coalesce($4, language),
         avatar = case when $7 then $6 else avatar end
       where id = $1 returning *`,
      [
        req.user.id,
        name ?? null,
        location ?? null,
        b.language ?? null,
        b.location !== undefined,
        b.avatar ?? null,
        b.avatar !== undefined,
      ]
    );
    res.json({ user: formatUser(serialize.user(rows[0])) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'Шинэ нууц үг 6-аас дээш тэмдэгттэй байна' });
    }
    const { rows } = await query('select password from public.users where id = $1', [req.user.id]);
    const ok = rows[0]?.password && (await bcrypt.compare(String(currentPassword ?? ''), rows[0].password));
    if (!ok) return res.status(400).json({ message: 'Одоогийн нууц үг буруу' });
    await query('update public.users set password = $2 where id = $1', [
      req.user.id,
      await bcrypt.hash(newPassword, 10),
    ]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete my account (required by the App Store). Personal data is wiped and
// the account can no longer log in; orders keep an anonymous reference.
router.delete('/me', auth, async (req, res) => {
  try {
    const { password } = req.body || {};
    const { rows } = await query('select password from public.users where id = $1', [req.user.id]);
    const ok = rows[0]?.password && (await bcrypt.compare(String(password ?? ''), rows[0].password));
    if (!ok) return res.status(400).json({ message: 'Нууц үг буруу' });

    await transaction(async (db) => {
      // Cancel my unpaid purchases and put those items back on sale.
      const pending = await db.query(
        `update public.orders set status = 'cancelled', payment_status = 'failed', cancelled_at = now()
         where buyer_id = $1 and status = 'pending' and payment_status = 'pending'
         returning product_id`,
        [req.user.id]
      );
      const productIds = pending.rows.map((r) => r.product_id);
      if (productIds.length) {
        await db.query("update public.products set status = 'active' where id = any($1) and status = 'sold'", [
          productIds,
        ]);
      }
      await db.query("update public.products set status = 'hidden' where seller_id = $1 and status = 'active'", [
        req.user.id,
      ]);
      await db.query(
        `update public.users set name = 'Устгагдсан хэрэглэгч', email = null, phone = null, password = null,
           avatar = null, location = null, points = 0, deleted_at = now()
         where id = $1`,
        [req.user.id]
      );
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
