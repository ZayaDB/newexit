const express = require('express');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const LIST_CATEGORY_FIELDS = ['key', 'nameMn', 'icon', 'color'];
const LIST_SELLER_FIELDS = ['name', 'isVerified', 'avatar'];
const DETAIL_SELLER_FIELDS = ['name', 'isVerified', 'avatar', 'location'];

// Product row joined with its category and seller rows.
const SELECT_WITH_RELATIONS = `
  select p.*, to_jsonb(c) as category_row, to_jsonb(u) as seller_row
  from public.products p
  join public.categories c on c.id = p.category_id
  join public.users u on u.id = p.seller_id`;

function withRelations(row, sellerFields = LIST_SELLER_FIELDS) {
  return serialize.product(row, {
    category: serialize.pick(serialize.category(row.category_row), LIST_CATEGORY_FIELDS),
    seller: serialize.pick(serialize.user(row.seller_row), sellerFields),
  });
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// `category` can be a category id or a category key ("furniture"). "all" = no filter.
function buildWhere(q) {
  const clauses = ["p.status = 'active'"];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  };

  if (q.category && q.category !== 'all') {
    if (serialize.isUuid(q.category)) add('p.category_id = ?', q.category);
    else add('c.key = ?', String(q.category));
  }
  if (q.featured === 'true') clauses.push('p.is_featured');
  if (q.free === 'true') clauses.push('p.is_free');
  if (q.search && String(q.search).trim()) {
    params.push(`%${escapeLike(String(q.search).trim())}%`);
    const n = `$${params.length}`;
    clauses.push(`(p.title ilike ${n} or p.short_description ilike ${n} or p.location ilike ${n})`);
  }
  return { where: clauses.join(' and '), params };
}

function buildOrder(sort) {
  switch (sort) {
    case 'price_asc':
      return 'p.price asc, p.created_at desc';
    case 'price_desc':
      return 'p.price desc, p.created_at desc';
    case 'popular':
      return 'p.view_count desc, p.created_at desc';
    default:
      return 'p.created_at desc';
  }
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10) || 20));
    const { where, params } = buildWhere(req.query);

    const [items, total] = await Promise.all([
      query(
        `${SELECT_WITH_RELATIONS} where ${where} order by ${buildOrder(req.query.sort)}
         limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, limit, (page - 1) * limit]
      ),
      query(
        `select count(*) as total from public.products p
         join public.categories c on c.id = p.category_id where ${where}`,
        params
      ),
    ]);

    res.json({
      items: items.rows.map((row) => withRelations(row)),
      total: total.rows[0].total,
      page,
      limit,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    if (!serialize.isUuid(req.params.id)) {
      return res.status(404).json({ message: 'Бараа олдсонгүй' });
    }

    const updated = await query(
      'update public.products set view_count = view_count + 1 where id = $1 returning id',
      [req.params.id]
    );
    if (!updated.rowCount) {
      return res.status(404).json({ message: 'Бараа олдсонгүй' });
    }

    const { rows } = await query(`${SELECT_WITH_RELATIONS} where p.id = $1`, [req.params.id]);
    res.json(withRelations(rows[0], DETAIL_SELLER_FIELDS));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const CONDITIONS = ['new', 'used', 'good', 'fair'];
const DELIVERY_OPTIONS = ['pickup', 'delivery', 'both'];
const STATUSES = ['draft', 'active', 'sold', 'hidden'];

function toStringArray(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
}

router.post('/', auth, async (req, res) => {
  try {
    const b = req.body || {};
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    const location = typeof b.location === 'string' ? b.location.trim() : '';
    const price = Number(b.price);

    if (!title || !location || !b.category || !Number.isFinite(price)) {
      return res.status(400).json({ message: 'Бүх заавал талбарыг бөглөнө үү' });
    }
    if (price < 0 || !Number.isInteger(price)) {
      return res.status(400).json({ message: 'Үнэ буруу байна' });
    }
    if (title.length > 100 || (b.shortDescription || '').length > 200 || (b.description || '').length > 1000) {
      return res.status(400).json({ message: 'Текст хэт урт байна' });
    }
    if (b.condition && !CONDITIONS.includes(b.condition)) {
      return res.status(400).json({ message: 'Төлөв буруу байна' });
    }
    if (b.deliveryOption && !DELIVERY_OPTIONS.includes(b.deliveryOption)) {
      return res.status(400).json({ message: 'Хүргэлтийн сонголт буруу байна' });
    }
    if (b.status && !STATUSES.includes(b.status)) {
      return res.status(400).json({ message: 'Статус буруу байна' });
    }

    const cat = await query(
      serialize.isUuid(b.category)
        ? 'select id from public.categories where id = $1'
        : 'select id from public.categories where key = $1',
      [String(b.category)]
    );
    if (!cat.rowCount) {
      return res.status(400).json({ message: 'Ангилал олдсонгүй' });
    }

    const quantity = b.quantity == null ? 1 : Number(b.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({ message: 'Тоо ширхэг буруу байна' });
    }

    const { rows } = await query(
      `insert into public.products (
         seller_id, category_id, title, short_description, description, price, currency,
         quantity, images, location, condition, badges, dimensions, delivery_option,
         has_warranty, is_returnable, is_featured, is_free, status
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       returning id`,
      [
        req.user.id,
        cat.rows[0].id,
        title,
        b.shortDescription || null,
        b.description || null,
        price,
        b.currency || 'KRW',
        quantity,
        toStringArray(b.images),
        location,
        b.condition || 'used',
        toStringArray(b.badges),
        b.dimensions && typeof b.dimensions === 'object'
          ? { unit: 'cm', ...b.dimensions }
          : null,
        b.deliveryOption || 'delivery',
        Boolean(b.hasWarranty),
        Boolean(b.isReturnable),
        Boolean(b.isFeatured),
        price === 0,
        b.status || 'active',
      ]
    );

    const created = await query(`${SELECT_WITH_RELATIONS} where p.id = $1`, [rows[0].id]);
    res.status(201).json(withRelations(created.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
