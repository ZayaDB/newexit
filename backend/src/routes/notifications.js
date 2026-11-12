// In-app notification list + registering phones for push notifications.
const express = require('express');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');

const router = express.Router();

function format(row) {
  return {
    _id: row.id,
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data || {},
    read: Boolean(row.read_at),
    createdAt: row.created_at,
  };
}

// GET /api/notifications -> { items (newest 100), unread }
router.get('/', auth, async (req, res) => {
  try {
    const [list, unread] = await Promise.all([
      query('select * from public.notifications where user_id = $1 order by created_at desc limit 100', [req.user.id]),
      query('select count(*)::int as n from public.notifications where user_id = $1 and read_at is null', [req.user.id]),
    ]);
    res.json({ items: list.rows.map(format), unread: unread.rows[0].n });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/notifications/read  { ids?: [...] }  (no ids = mark all read)
router.post('/read', auth, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(serialize.isUuid) : null;
    if (ids && ids.length) {
      await query(
        'update public.notifications set read_at = now() where user_id = $1 and id = any($2::uuid[]) and read_at is null',
        [req.user.id, ids]
      );
    } else {
      await query('update public.notifications set read_at = now() where user_id = $1 and read_at is null', [req.user.id]);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const TOKEN_RE = /^(ExponentPushToken|ExpoPushToken)\[[^\]]{10,200}\]$/;

// POST /api/notifications/push-token  { token: "ExponentPushToken[...]", platform }
router.post('/push-token', auth, async (req, res) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!TOKEN_RE.test(token)) return res.status(400).json({ message: 'Буруу токен' });
    const platform = ['ios', 'android', 'web'].includes(req.body?.platform) ? req.body.platform : null;
    // A phone belongs to whoever logged in on it last.
    await query(
      `insert into public.push_tokens (token, user_id, platform) values ($1, $2, $3)
       on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()`,
      [token, req.user.id, platform]
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/notifications/push-token  { token }  (on log out)
router.delete('/push-token', auth, async (req, res) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token) await query('delete from public.push_tokens where token = $1 and user_id = $2', [token, req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
