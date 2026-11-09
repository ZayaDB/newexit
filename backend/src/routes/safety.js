// Report content and block users (App Store guideline 1.2 for user content).
const express = require('express');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');

const router = express.Router();

const TARGETS = {
  product: 'select 1 from public.products where id = $1',
  user: 'select 1 from public.users where id = $1',
  message: 'select 1 from public.messages where id = $1',
};

router.post('/reports', auth, async (req, res) => {
  try {
    const { targetType, targetId } = req.body || {};
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : null;
    if (!TARGETS[targetType] || !serialize.isUuid(targetId)) {
      return res.status(400).json({ message: 'Буруу хүсэлт' });
    }
    const exists = await query(TARGETS[targetType], [targetId]);
    if (!exists.rowCount) return res.status(404).json({ message: 'Олдсонгүй' });
    await query(
      'insert into public.reports (reporter_id, target_type, target_id, reason) values ($1, $2, $3, $4)',
      [req.user.id, targetType, targetId, reason || null]
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/blocks', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `select u.id, u.name, u.avatar, b.created_at from public.blocks b
       join public.users u on u.id = b.blocked_id
       where b.blocker_id = $1 order by b.created_at desc`,
      [req.user.id]
    );
    res.json({
      items: rows.map((r) => ({ _id: r.id, id: r.id, name: r.name, avatar: r.avatar ?? undefined, blockedAt: r.created_at })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/blocks', auth, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!serialize.isUuid(userId) || userId === req.user.id) {
      return res.status(400).json({ message: 'Буруу хүсэлт' });
    }
    const exists = await query('select 1 from public.users where id = $1', [userId]);
    if (!exists.rowCount) return res.status(404).json({ message: 'Хэрэглэгч олдсонгүй' });
    await query(
      'insert into public.blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing',
      [req.user.id, userId]
    );
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/blocks/:userId', auth, async (req, res) => {
  try {
    if (!serialize.isUuid(req.params.userId)) return res.status(404).json({ message: 'Олдсонгүй' });
    await query('delete from public.blocks where blocker_id = $1 and blocked_id = $2', [
      req.user.id,
      req.params.userId,
    ]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
