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
function buildWhere(q, userId) {
  const clauses = ["p.status = 'active'"];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  };

  if (q.category && q.category !== 'all') {
    if (serialize.isUuid(q.category)) {
      // The "all" category's id also means no filter.
      params.push(q.category);
      const n = `$${params.length}`;
      clauses.push(
        `(p.category_id = ${n} or exists (select 1 from public.categories a where a.id = ${n} and a.key = 'all'))`
      );
    } else add('c.key = ?', String(q.category));
  }
  // Hide listings from sellers I blocked.
  if (userId) {
    add('not exists (select 1 from public.blocks bl where bl.blocker_id = ? and bl.blocked_id = p.seller_id)', userId);
  }
  if (q.featured === 'true') clauses.push('p.is_featured');
  if (q.free === 'true') clauses.push('p.is_free');
  const minPrice = parseInt(q.minPrice, 10);
  const maxPrice = parseInt(q.maxPrice, 10);
  if (Number.isFinite(minPrice) && minPrice > 0) add('p.price >= ?', minPrice);
  if (Number.isFinite(maxPrice) && maxPrice >= 0) add('p.price <= ?', maxPrice);
  if (q.condition && ['new', 'used', 'good', 'fair'].includes(String(q.condition))) {
    add('p.condition = ?', String(q.condition));
  }
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
    const { where, params } = buildWhere(req.query, req.user?.id);

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

// My listings: everything I've posted (active, sold, ...), newest first.
router.get('/mine', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `select x.*,
         exists (select 1 from public.orders o where o.product_id = x.id and o.status <> 'cancelled') as ordered,
         exists (select 1 from public.orders o where o.product_id = x.id
                   and o.status not in ('cancelled', 'delivered')) as open_order
       from (${SELECT_WITH_RELATIONS} where p.seller_id = $1) x
       order by x.created_at desc`,
      [req.user.id]
    );
    // ordered: bought through the app (status can't be flipped); openOrder: can't be deleted yet.
    res.json({
      items: rows.map((row) => ({ ...withRelations(row), ordered: row.ordered, openOrder: row.open_order })),
      total: rows.length,
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
    const row = rows[0];
    // Hidden listings (deleted by the seller or taken down by an admin) are only
    // visible to their seller and admins.
    if (row.status === 'hidden' && req.user?.id !== row.seller_id && req.user?.role !== 'admin') {
      return res.status(404).json({ message: 'Бараа олдсонгүй' });
    }
    res.json(withRelations(row, DETAIL_SELLER_FIELDS));
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

// Owner (or admin) loads a product for editing; null if not allowed.
async function editableProduct(id, user) {
  if (!serialize.isUuid(id)) return null;
  const { rows } = await query('select * from public.products where id = $1', [id]);
  const row = rows[0];
  if (!row || (row.seller_id !== user.id && user.role !== 'admin')) return null;
  return row;
}

function hasOpenOrder(productId) {
  return query(
    "select 1 from public.orders where product_id = $1 and status <> 'cancelled' limit 1",
    [productId]
  ).then((r) => r.rowCount > 0);
}

// PATCH /api/products/:id — edit a listing, or mark it sold / back on sale.
router.patch('/:id', auth, async (req, res) => {
  try {
    const row = await editableProduct(req.params.id, req.user);
    if (!row) return res.status(404).json({ message: 'Бараа олдсонгүй' });
    const b = req.body || {};
    const sets = [];
    const params = [row.id];
    const set = (column, value) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (b.title !== undefined) {
      const title = typeof b.title === 'string' ? b.title.trim() : '';
      if (!title || title.length > 100) return res.status(400).json({ message: 'Гарчиг буруу байна' });
      set('title', title);
    }
    if (b.location !== undefined) {
      const location = typeof b.location === 'string' ? b.location.trim() : '';
      if (!location || location.length > 100) return res.status(400).json({ message: 'Байршил буруу байна' });
      set('location', location);
    }
    for (const [key, column, max] of [['shortDescription', 'short_description', 200], ['description', 'description', 1000]]) {
      if (b[key] !== undefined) {
        const text = typeof b[key] === 'string' ? b[key].trim() : '';
        if (text.length > max) return res.status(400).json({ message: 'Текст хэт урт байна' });
        set(column, text || null);
      }
    }
    if (b.price !== undefined) {
      const price = Number(b.price);
      if (!Number.isInteger(price) || price < 0) return res.status(400).json({ message: 'Үнэ буруу байна' });
      set('price', price);
      set('is_free', price === 0);
    }
    if (b.condition !== undefined) {
      if (!CONDITIONS.includes(b.condition)) return res.status(400).json({ message: 'Төлөв буруу байна' });
      set('condition', b.condition);
    }
    if (b.deliveryOption !== undefined) {
      if (!DELIVERY_OPTIONS.includes(b.deliveryOption)) {
        return res.status(400).json({ message: 'Хүргэлтийн сонголт буруу байна' });
      }
      set('delivery_option', b.deliveryOption);
    }
    if (b.images !== undefined) {
      const images = toStringArray(b.images).slice(0, 10);
      set('images', images);
    }
    if (b.badges !== undefined) set('badges', toStringArray(b.badges).slice(0, 5));
    if (b.dimensions !== undefined) {
      set('dimensions', b.dimensions && typeof b.dimensions === 'object' ? { unit: 'cm', ...b.dimensions } : null);
    }
    if (b.category !== undefined) {
      const cat = await query(
        serialize.isUuid(b.category)
          ? 'select id from public.categories where id = $1'
          : 'select id from public.categories where key = $1',
        [String(b.category)]
      );
      if (!cat.rowCount) return res.status(400).json({ message: 'Ангилал олдсонгүй' });
      set('category_id', cat.rows[0].id);
    }
    if (b.status !== undefined) {
      // Sellers can mark a listing sold (sold elsewhere) or put it back on sale.
      if (!['active', 'sold'].includes(b.status)) return res.status(400).json({ message: 'Статус буруу байна' });
      if (b.status !== row.status && (await hasOpenOrder(row.id))) {
        return res.status(409).json({ message: 'Захиалгатай барааны төлөвийг өөрчлөх боломжгүй' });
      }
      set('status', b.status);
    }
    if (!sets.length) return res.status(400).json({ message: 'Өөрчлөх зүйл алга' });

    await query(`update public.products set ${sets.join(', ')} where id = $1`, params);
    const updated = await query(`${SELECT_WITH_RELATIONS} where p.id = $1`, [row.id]);
    res.json(withRelations(updated.rows[0], DETAIL_SELLER_FIELDS));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE /api/products/:id — removes a listing. Listings that were ever ordered
// are hidden instead, because orders keep pointing at them.
router.delete('/:id', auth, async (req, res) => {
  try {
    const row = await editableProduct(req.params.id, req.user);
    if (!row) return res.status(404).json({ message: 'Бараа олдсонгүй' });
    const open = await query(
      "select 1 from public.orders where product_id = $1 and status not in ('cancelled', 'delivered') limit 1",
      [row.id]
    );
    if (open.rowCount) return res.status(409).json({ message: 'Захиалга явагдаж байгаа барааг устгах боломжгүй' });
    const ordered = await query('select 1 from public.orders where product_id = $1 limit 1', [row.id]);
    if (ordered.rowCount) {
      await query("update public.products set status = 'hidden' where id = $1", [row.id]);
    } else {
      await query('delete from public.products where id = $1', [row.id]);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
