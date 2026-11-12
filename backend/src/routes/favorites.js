// Saved products ("Хадгалсан бараа").
const express = require('express');
const { query, transaction } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');

const router = express.Router();

const LIST_CATEGORY_FIELDS = ['key', 'nameMn', 'icon', 'color'];
const LIST_SELLER_FIELDS = ['name', 'isVerified', 'avatar'];

// GET /api/favorites -> { ids: [...], items: [products, newest saved first] }
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `select p.*, to_jsonb(c) as category_row, to_jsonb(u) as seller_row
       from public.favorites f
       join public.products p on p.id = f.product_id
       join public.categories c on c.id = p.category_id
       join public.users u on u.id = p.seller_id
       where f.user_id = $1 and p.status <> 'hidden'
       order by f.created_at desc`,
      [req.user.id]
    );
    const items = rows.map((row) =>
      serialize.product(row, {
        category: serialize.pick(serialize.category(row.category_row), LIST_CATEGORY_FIELDS),
        seller: serialize.pick(serialize.user(row.seller_row), LIST_SELLER_FIELDS),
      })
    );
    res.json({ ids: rows.map((r) => r.id), items });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

async function setFavorite(userId, productId, on) {
  return transaction(async (client) => {
    const result = on
      ? await client.query(
          'insert into public.favorites (user_id, product_id) values ($1, $2) on conflict do nothing',
          [userId, productId]
        )
      : await client.query('delete from public.favorites where user_id = $1 and product_id = $2', [
          userId,
          productId,
        ]);
    if (result.rowCount) {
      await client.query(
        `update public.products set favorite_count = greatest(0, favorite_count + $2) where id = $1`,
        [productId, on ? 1 : -1]
      );
    }
    const { rows } = await client.query('select favorite_count from public.products where id = $1', [productId]);
    return rows[0]?.favorite_count ?? 0;
  });
}

// PUT /api/favorites/:productId  -> save;  DELETE -> unsave
router.put('/:productId', auth, async (req, res) => {
  try {
    const { productId } = req.params;
    if (!serialize.isUuid(productId)) return res.status(400).json({ message: 'Буруу хүсэлт' });
    const exists = await query('select 1 from public.products where id = $1', [productId]);
    if (!exists.rowCount) return res.status(404).json({ message: 'Бараа олдсонгүй' });
    const favoriteCount = await setFavorite(req.user.id, productId, true);
    res.json({ saved: true, favoriteCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:productId', auth, async (req, res) => {
  try {
    const { productId } = req.params;
    if (!serialize.isUuid(productId)) return res.status(400).json({ message: 'Буруу хүсэлт' });
    const favoriteCount = await setFavorite(req.user.id, productId, false);
    res.json({ saved: false, favoriteCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
