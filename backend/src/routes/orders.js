const express = require('express');
const crypto = require('crypto');
const { query, transaction } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');

const router = express.Router();

const PAYMENT_METHODS = ['card', 'zpay', 'points', 'bank'];
const DELIVERY_FEE = 30000;
const ASSEMBLY_FEE = 20000;
const DAY = 24 * 60 * 60 * 1000;

function generateOrderNumber() {
  return `NE${Date.now().toString().slice(-6)}${crypto.randomInt(10, 100)}`;
}

function generateTrackingNumber() {
  return `NE${crypto.randomInt(100000000, 1000000000)}KR`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// e.g. "2026.10.27 ~ 10.30" (2–5 days from now)
function estimatedArrival(now) {
  const from = new Date(now.getTime() + 2 * DAY);
  const to = new Date(now.getTime() + 5 * DAY);
  return `${from.getFullYear()}.${pad(from.getMonth() + 1)}.${pad(from.getDate())} ~ ${pad(
    to.getMonth() + 1
  )}.${pad(to.getDate())}`;
}

// Only the buyer, the seller, delivery staff and admins may see an order.
function canView(user, orderRow) {
  return (
    user.id === orderRow.buyer_id ||
    user.id === orderRow.seller_id ||
    user.role === 'mover' ||
    user.role === 'admin'
  );
}

router.post('/', auth, async (req, res) => {
  try {
    const {
      productId,
      paymentMethod = 'card',
      includeDelivery = true,
      includeAssembly = true,
      deliveryAddress,
    } = req.body || {};
    const pointsUsed = Number(req.body?.pointsUsed ?? 0);

    if (!serialize.isUuid(productId)) {
      return res.status(404).json({ message: 'Бараа олдсонгүй' });
    }
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'Төлбөрийн хэлбэр буруу байна' });
    }
    if (!Number.isInteger(pointsUsed) || pointsUsed < 0) {
      return res.status(400).json({ message: 'Оноо буруу байна' });
    }

    const result = await transaction(async (db) => {
      // Lock the product so two buyers can't buy the same item at once.
      const productRes = await db.query(
        'select * from public.products where id = $1 for update',
        [productId]
      );
      const product = productRes.rows[0];
      if (!product || product.status !== 'active') {
        return { status: 404, body: { message: 'Бараа олдсонгүй' } };
      }
      if (product.seller_id === req.user.id) {
        return { status: 400, body: { message: 'Өөрийн барааг худалдан авах боломжгүй' } };
      }

      const buyerRes = await db.query(
        'select points from public.users where id = $1 for update',
        [req.user.id]
      );
      if (pointsUsed > buyerRes.rows[0].points) {
        return { status: 400, body: { message: 'Оноо хүрэлцэхгүй байна' } };
      }

      const itemPrice = product.price;
      const deliveryFee = includeDelivery ? DELIVERY_FEE : 0;
      const assemblyFee = includeAssembly ? ASSEMBLY_FEE : 0;
      const subtotal = itemPrice + deliveryFee + assemblyFee;
      const pointsApplied = Math.min(pointsUsed, subtotal);
      const totalAmount = subtotal - pointsApplied;

      const now = new Date();
      const statusHistory = [{ status: 'confirmed', label: 'Захиалга батлагдсан', timestamp: now }];

      const orderRes = await db.query(
        `insert into public.orders (
           order_number, buyer_id, seller_id, product_id, item_price, delivery_fee,
           assembly_fee, points_used, total_amount, payment_method, payment_status,
           status, delivery_address, include_assembly, include_delivery, status_history
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'paid','confirmed',$11,$12,$13,$14)
         returning *`,
        [
          generateOrderNumber(),
          req.user.id,
          product.seller_id,
          product.id,
          itemPrice,
          deliveryFee,
          assemblyFee,
          pointsApplied,
          totalAmount,
          paymentMethod,
          deliveryAddress || null,
          Boolean(includeAssembly),
          Boolean(includeDelivery),
          JSON.stringify(statusHistory),
        ]
      );
      const orderRow = orderRes.rows[0];

      // A new delivery has only been confirmed; no driver is assigned yet.
      const timeline = [
        { status: 'confirmed', labelMn: 'Захиалга батлагдсан', timestamp: now, completed: true },
        { status: 'preparing', labelMn: 'Бэлтгэгдэж байна', timestamp: null, completed: false },
        { status: 'out_for_delivery', labelMn: 'Хүргэлтэнд гарсан', timestamp: null, completed: false },
        { status: 'delivered', labelMn: 'Хүргэгдсэн', timestamp: null, completed: false },
      ];

      const deliveryRes = await db.query(
        `insert into public.deliveries (
           order_id, tracking_number, estimated_arrival, current_status, timeline
         ) values ($1,$2,$3,'confirmed',$4)
         returning *`,
        [orderRow.id, generateTrackingNumber(), estimatedArrival(now), JSON.stringify(timeline)]
      );

      await db.query("update public.products set status = 'sold' where id = $1", [product.id]);
      if (pointsApplied > 0) {
        await db.query('update public.users set points = points - $1 where id = $2', [
          pointsApplied,
          req.user.id,
        ]);
      }

      const soldProduct = await db.query('select * from public.products where id = $1', [product.id]);
      const people = await db.query('select * from public.users where id = any($1::uuid[])', [
        [req.user.id, product.seller_id],
      ]);
      const byId = Object.fromEntries(people.rows.map((u) => [u.id, serialize.user(u)]));

      return {
        status: 201,
        body: {
          order: serialize.order(orderRow, {
            product: serialize.product(soldProduct.rows[0]),
            buyer: serialize.pick(byId[req.user.id], ['name', 'email', 'phone']),
            seller: serialize.pick(byId[product.seller_id], ['name']),
          }),
          delivery: serialize.delivery(deliveryRes.rows[0]),
        },
      };
    });

    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    if (!serialize.isUuid(req.params.id)) {
      return res.status(404).json({ message: 'Захиалга олдсонгүй' });
    }

    const { rows } = await query(
      `select o.*, to_jsonb(p) as product_row, to_jsonb(b) as buyer_row,
              to_jsonb(s) as seller_row, to_jsonb(d) as delivery_row
       from public.orders o
       join public.products p on p.id = o.product_id
       join public.users b on b.id = o.buyer_id
       join public.users s on s.id = o.seller_id
       left join public.deliveries d on d.order_id = o.id
       where o.id = $1`,
      [req.params.id]
    );
    const row = rows[0];
    if (!row || !canView(req.user, row)) {
      return res.status(404).json({ message: 'Захиалга олдсонгүй' });
    }

    res.json({
      order: serialize.order(row, {
        product: serialize.product(row.product_row),
        buyer: serialize.pick(serialize.user(row.buyer_row), ['name']),
        seller: serialize.pick(serialize.user(row.seller_row), ['name']),
      }),
      delivery: serialize.delivery(row.delivery_row),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = { router, canView };
