// Public seller profiles and reviews.
const express = require('express');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth, optionalAuth } = require('../middleware/auth');
const { notify } = require('../lib/notify');

const router = express.Router();

function formatReview(row) {
  return {
    _id: row.id,
    id: row.id,
    rating: row.rating,
    comment: row.comment ?? undefined,
    createdAt: row.created_at,
    reviewer: row.reviewer_name
      ? { _id: row.reviewer_id, name: row.reviewer_name, avatar: row.reviewer_avatar ?? undefined }
      : undefined,
    productTitle: row.product_title ?? undefined,
  };
}

/** Can this buyer review this order? Delivered, or paid pickup without delivery. */
function reviewable(order) {
  if (order.payment_status !== 'paid' || order.status === 'cancelled') return false;
  return order.status === 'delivered' || !order.include_delivery;
}

// GET /api/users/:id — public profile: name, join date, verified, rating, listings, reviews.
router.get('/users/:id', optionalAuth, async (req, res) => {
  try {
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Хэрэглэгч олдсонгүй' });
    const u = await query('select * from public.users where id = $1 and deleted_at is null', [req.params.id]);
    const row = u.rows[0];
    if (!row) return res.status(404).json({ message: 'Хэрэглэгч олдсонгүй' });

    const [products, counts, rating, reviews] = await Promise.all([
      query(
        `select p.*, to_jsonb(c) as category_row from public.products p
         join public.categories c on c.id = p.category_id
         where p.seller_id = $1 and p.status = 'active' order by p.created_at desc limit 50`,
        [row.id]
      ),
      query(
        `select count(*) filter (where status = 'active')::int as active,
                count(*) filter (where status = 'sold')::int as sold
         from public.products where seller_id = $1`,
        [row.id]
      ),
      query('select coalesce(avg(rating), 0)::float as avg, count(*)::int as n from public.reviews where seller_id = $1', [row.id]),
      query(
        `select r.*, u.name as reviewer_name, u.avatar as reviewer_avatar, p.title as product_title
         from public.reviews r
         join public.users u on u.id = r.reviewer_id
         join public.orders o on o.id = r.order_id
         join public.products p on p.id = o.product_id
         where r.seller_id = $1 order by r.created_at desc limit 30`,
        [row.id]
      ),
    ]);

    const user = serialize.user(row);
    res.json({
      user: {
        _id: user._id,
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        isVerified: user.isVerified,
        location: user.location,
        role: user.role,
        createdAt: user.createdAt,
      },
      stats: {
        active: counts.rows[0].active,
        sold: counts.rows[0].sold,
        rating: Math.round(rating.rows[0].avg * 10) / 10,
        reviewCount: rating.rows[0].n,
      },
      products: products.rows.map((p) =>
        serialize.product(p, {
          category: serialize.pick(serialize.category(p.category_row), ['key', 'nameMn']),
          seller: { _id: user._id, id: user.id, name: user.name, isVerified: user.isVerified, avatar: user.avatar },
        })
      ),
      reviews: reviews.rows.map(formatReview),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/reviews  { orderId, rating 1-5, comment? } — the buyer reviews the seller.
router.post('/reviews', auth, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const rating = Number(req.body?.rating);
    const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 500) : '';
    if (!serialize.isUuid(orderId)) return res.status(404).json({ message: 'Захиалга олдсонгүй' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Үнэлгээ 1-5 од байна' });
    }
    const o = await query('select * from public.orders where id = $1', [orderId]);
    const order = o.rows[0];
    if (!order || order.buyer_id !== req.user.id) return res.status(404).json({ message: 'Захиалга олдсонгүй' });
    if (!reviewable(order)) return res.status(409).json({ message: 'Бараа хүргэгдсэний дараа үнэлгээ өгнө' });

    const { rows } = await query(
      `insert into public.reviews (order_id, reviewer_id, seller_id, rating, comment)
       values ($1, $2, $3, $4, $5) on conflict (order_id) do nothing returning *`,
      [order.id, req.user.id, order.seller_id, rating, comment || null]
    );
    if (!rows[0]) return res.status(409).json({ message: 'Та аль хэдийн үнэлгээ өгсөн байна' });

    await notify([order.seller_id], {
      type: 'review',
      title: `Шинэ үнэлгээ: ${'★'.repeat(rating)}`,
      body: comment ? comment.slice(0, 120) : `${req.user.name} танд үнэлгээ өглөө.`,
      data: { url: `/users/${order.seller_id}` },
    });
    res.status(201).json(formatReview(rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = { router, reviewable, formatReview };
