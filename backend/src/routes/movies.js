// Кино: dramas / movies that play from YouTube in the official embedded player.
// Watching is always free: YouTube's API terms forbid charging users to watch
// embedded videos (Developer Policies III.F.3).
const express = require('express');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const OEMBED_TIMEOUT_MS = 5000;

function format(row) {
  return {
    _id: row.id,
    id: row.id,
    youtubeId: row.youtube_id,
    title: row.title,
    channel: row.channel ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    thumbnail: `https://i.ytimg.com/vi/${row.youtube_id}/hqdefault.jpg`,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

/** Pulls the 11-character video id out of any YouTube link (or a bare id). */
function youtubeId(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  const m = text.match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

/**
 * Asks YouTube for the title/channel and whether the video may be embedded.
 * Returns { ok, title, channel } or { ok: false, status }.
 */
async function lookup(id) {
  if (process.env.NODE_ENV === 'test') return { ok: true, title: null, channel: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS);
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status };
    const json = await res.json();
    return { ok: true, title: json.title, channel: json.author_name };
  } catch {
    // YouTube unreachable: let the admin add it anyway with their own title.
    return { ok: true, title: null, channel: null };
  } finally {
    clearTimeout(timer);
  }
}

function isAdmin(user) {
  return user?.role === 'admin';
}

// GET /api/movies  — active ones for everyone; ?all=true shows hidden ones too (admin)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const all = req.query.all === 'true' && isAdmin(req.user);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '200', 10) || 200));
    const { rows } = await query(
      `select * from public.movies ${all ? '' : 'where is_active'}
       order by sort_order asc, created_at desc limit $1`,
      [limit]
    );
    res.json({ items: rows.map(format) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Кино олдсонгүй' });
    const { rows } = await query('select * from public.movies where id = $1', [req.params.id]);
    const row = rows[0];
    if (!row || (!row.is_active && !isAdmin(req.user))) return res.status(404).json({ message: 'Кино олдсонгүй' });
    res.json(format(row));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/movies  { url, title? }  (admin) — paste a YouTube link
router.post('/', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Эрх хүрэлцэхгүй' });
    const id = youtubeId(req.body?.url);
    if (!id) return res.status(400).json({ message: 'YouTube холбоос буруу байна' });
    const exists = await query('select id from public.movies where youtube_id = $1', [id]);
    if (exists.rowCount) return res.status(409).json({ message: 'Энэ кино аль хэдийн нэмэгдсэн' });

    const info = await lookup(id);
    if (!info.ok) {
      return res.status(400).json({
        message:
          info.status === 401 || info.status === 403
            ? 'Энэ бичлэгийг апп дотор тоглуулахыг эзэн нь хориглосон байна'
            : 'YouTube дээр ийм бичлэг олдсонгүй',
      });
    }
    const custom = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 300) : '';
    const title = custom || info.title || 'Кино';
    // New ones go first.
    const { rows } = await query(
      `insert into public.movies (youtube_id, title, channel, sort_order)
       values ($1, $2, $3, coalesce((select min(sort_order) - 1 from public.movies), 0)) returning *`,
      [id, title, info.channel || null]
    );
    res.status(201).json(format(rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH /api/movies/:id  { title?, isActive?, sortOrder? }  (admin)
router.patch('/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Эрх хүрэлцэхгүй' });
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Кино олдсонгүй' });
    const b = req.body || {};
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 300) : null;
    if (b.title !== undefined && !title) return res.status(400).json({ message: 'Нэр хоосон байна' });
    const sortOrder = b.sortOrder === undefined ? null : Number(b.sortOrder);
    if (sortOrder !== null && !Number.isInteger(sortOrder)) return res.status(400).json({ message: 'Дараалал буруу' });
    const { rows } = await query(
      `update public.movies set
         title = coalesce($2, title),
         is_active = coalesce($3, is_active),
         sort_order = coalesce($4, sort_order)
       where id = $1 returning *`,
      [req.params.id, title, typeof b.isActive === 'boolean' ? b.isActive : null, sortOrder]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Кино олдсонгүй' });
    res.json(format(rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Эрх хүрэлцэхгүй' });
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Кино олдсонгүй' });
    const r = await query('delete from public.movies where id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ message: 'Кино олдсонгүй' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = { router, youtubeId };
