const express = require('express');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');
const { canView } = require('./orders');

const router = express.Router();

async function findDelivery(whereSql, value) {
  const { rows } = await query(
    `select d.*, to_jsonb(o) as order_row, to_jsonb(p) as product_row
     from public.deliveries d
     join public.orders o on o.id = d.order_id
     join public.products p on p.id = o.product_id
     where ${whereSql}`,
    [value]
  );
  return rows[0];
}

function format(row) {
  return serialize.delivery(row, {
    order: serialize.order(row.order_row, {
      product: serialize.pick(serialize.product(row.product_row), ['title', 'images', 'price']),
    }),
  });
}

router.get('/tracking/:trackingNumber', auth, async (req, res) => {
  try {
    const row = await findDelivery('d.tracking_number = $1', req.params.trackingNumber);
    if (!row || !canView(req.user, row.order_row)) {
      return res.status(404).json({ message: 'Хүргэлт олдсонгүй' });
    }
    res.json(format(row));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/order/:orderId', auth, async (req, res) => {
  try {
    if (!serialize.isUuid(req.params.orderId)) {
      return res.status(404).json({ message: 'Хүргэлт олдсонгүй' });
    }
    const row = await findDelivery('d.order_id = $1', req.params.orderId);
    if (!row || !canView(req.user, row.order_row)) {
      return res.status(404).json({ message: 'Хүргэлт олдсонгүй' });
    }
    res.json(format(row));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
