const express = require('express');
const crypto = require('crypto');
const { query, transaction } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');
const { notify, notifyRoles } = require('../lib/notify');

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

// Where buyers send their bank transfer. Overridable with env vars.
function bankAccount() {
  return {
    bank: process.env.BANK_NAME || 'KB Kookmin Bank (KB국민은행)',
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || '354601-04-120996',
    accountHolder: process.env.BANK_ACCOUNT_HOLDER || 'TSOGTGEREL BAASANTSEREN',
  };
}

// Same steps as the driver workflow in routes/deliveries.js.
const DELIVERY_TIMELINE = (now) => [
  { status: 'confirmed', labelMn: 'Төлбөр баталгаажсан', timestamp: now, completed: true },
  { status: 'picked_up', labelMn: 'Жолооч бараа хүлээн авсан', timestamp: null, completed: false },
  { status: 'in_transit', labelMn: 'Илгээмжид өгсөн', timestamp: null, completed: false },
  { status: 'delivered', labelMn: 'Хүргэгдсэн', timestamp: null, completed: false },
];

router.get('/payment-info', (_req, res) => {
  res.json({ bankAccount: bankAccount(), paymentDeadlineHours: 24 });
});

// Creates an order that waits for a bank transfer. The product is reserved
// (status 'sold') so nobody else can buy it; cancelling puts it back on sale.
router.post('/', auth, async (req, res) => {
  try {
    const {
      productId,
      paymentMethod = 'bank',
      includeDelivery = true,
      includeAssembly = true,
      deliveryAddress,
    } = req.body || {};
    const pointsUsed = Number(req.body?.pointsUsed ?? 0);

    if (!serialize.isUuid(productId)) {
      return res.status(404).json({ message: 'Бараа олдсонгүй' });
    }
    if (paymentMethod !== 'bank') {
      return res.status(400).json({ message: 'Одоогоор зөвхөн дансаар шилжүүлэх боломжтой' });
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
      const statusHistory = [{ status: 'pending', label: 'Төлбөр хүлээгдэж байна', timestamp: now }];

      const orderRes = await db.query(
        `insert into public.orders (
           order_number, buyer_id, seller_id, product_id, item_price, delivery_fee,
           assembly_fee, points_used, total_amount, payment_method, payment_status,
           status, delivery_address, include_assembly, include_delivery, status_history
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'bank','pending','pending',$10,$11,$12,$13)
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
          deliveryAddress || null,
          Boolean(includeAssembly),
          Boolean(includeDelivery),
          JSON.stringify(statusHistory),
        ]
      );
      const orderRow = orderRes.rows[0];

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
          delivery: null,
          bankAccount: bankAccount(),
        },
      };
    });

    if (result.status === 201) {
      const o = result.body.order;
      await notify([o.seller._id], {
        type: 'order',
        title: 'Таны бараа захиалагдлаа',
        body: `"${o.product.title}" — худалдан авагчийн төлбөр орж ирэхийг хүлээж байна.`,
        data: { url: `/order/${o._id}` },
      });
      await notifyRoles(['admin'], {
        type: 'admin',
        title: 'Шинэ төлбөр шалгах',
        body: `${o.orderNumber}: ₩${o.totalAmount.toLocaleString('ko-KR')}`,
        data: { url: '/admin' },
      });
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

function pushHistory(row, status, label, now) {
  const history = Array.isArray(row.status_history) ? row.status_history : [];
  return JSON.stringify([...history, { status, label, timestamp: now }]);
}

// Admin: orders waiting for a bank transfer, oldest first.
router.get('/admin/pending', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Эрх хүрэлцэхгүй' });
    const { rows } = await query(
      `select o.*, to_jsonb(p) as product_row, to_jsonb(b) as buyer_row, to_jsonb(s) as seller_row
       from public.orders o
       join public.products p on p.id = o.product_id
       join public.users b on b.id = o.buyer_id
       join public.users s on s.id = o.seller_id
       where o.status = 'pending' and o.payment_status = 'pending'
       order by o.created_at asc`
    );
    res.json({
      items: rows.map((row) => ({
        order: serialize.order(row, {
          product: serialize.pick(serialize.product(row.product_row), ['title', 'images', 'price']),
          buyer: serialize.pick(serialize.user(row.buyer_row), ['name', 'email', 'phone']),
          seller: serialize.pick(serialize.user(row.seller_row), ['name']),
        }),
        delivery: null,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Admin: the transfer arrived. Marks the order paid and starts the delivery.
router.post('/:id/confirm-payment', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Эрх хүрэлцэхгүй' });
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Захиалга олдсонгүй' });

    const result = await transaction(async (db) => {
      const { rows } = await db.query('select * from public.orders where id = $1 for update', [req.params.id]);
      const row = rows[0];
      if (!row) return { status: 404, body: { message: 'Захиалга олдсонгүй' } };
      if (row.status !== 'pending' || row.payment_status !== 'pending') {
        return { status: 409, body: { message: 'Энэ захиалгын төлбөр хүлээгдээгүй байна' } };
      }
      const now = new Date();
      const updated = await db.query(
        `update public.orders set payment_status = 'paid', status = 'confirmed', paid_at = $2,
           status_history = $3 where id = $1 returning *`,
        [row.id, now, pushHistory(row, 'confirmed', 'Төлбөр орж, захиалга батлагдсан', now)]
      );
      const delivery = await db.query(
        `insert into public.deliveries (order_id, tracking_number, estimated_arrival, current_status, timeline)
         values ($1,$2,$3,'confirmed',$4) returning *`,
        [row.id, generateTrackingNumber(), estimatedArrival(now), JSON.stringify(DELIVERY_TIMELINE(now))]
      );
      return {
        status: 200,
        row,
        body: { order: serialize.order(updated.rows[0]), delivery: serialize.delivery(delivery.rows[0]) },
      };
    });
    if (result.status === 200) {
      const { row } = result;
      const p = await query('select title from public.products where id = $1', [row.product_id]);
      const title = p.rows[0]?.title || '';
      await notify([row.buyer_id], {
        type: 'order',
        title: 'Төлбөр баталгаажлаа',
        body: `"${title}" захиалга батлагдлаа. Жолооч удахгүй хүргэнэ.`,
        data: { url: `/delivery/${row.id}` },
      });
      await notify([row.seller_id], {
        type: 'order',
        title: 'Төлбөр орлоо',
        body: `"${title}" — жолооч бараа авахаар ирнэ.`,
        data: { url: `/order/${row.id}` },
      });
      await notifyRoles(['mover'], {
        type: 'job',
        title: 'Шинэ хүргэлтийн ажил',
        body: `"${title}"`,
        data: { url: '/mover' },
      });
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cancel an unpaid order (the buyer, or an admin). The product goes back on
// sale and any points used are returned.
router.post('/:id/cancel', auth, async (req, res) => {
  try {
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Захиалга олдсонгүй' });

    const result = await transaction(async (db) => {
      const { rows } = await db.query('select * from public.orders where id = $1 for update', [req.params.id]);
      const row = rows[0];
      const isAdmin = req.user.role === 'admin';
      if (!row || (row.buyer_id !== req.user.id && !isAdmin)) {
        return { status: 404, body: { message: 'Захиалга олдсонгүй' } };
      }
      if (row.status !== 'pending' || row.payment_status !== 'pending') {
        return { status: 409, body: { message: 'Төлбөр орсон захиалгыг цуцлах боломжгүй. Бидэнтэй холбогдоно уу.' } };
      }
      const now = new Date();
      const updated = await db.query(
        `update public.orders set status = 'cancelled', payment_status = 'failed', cancelled_at = $2,
           status_history = $3 where id = $1 returning *`,
        [row.id, now, pushHistory(row, 'cancelled', 'Захиалга цуцлагдсан', now)]
      );
      await db.query("update public.products set status = 'active' where id = $1 and status = 'sold'", [row.product_id]);
      if (row.points_used > 0) {
        await db.query('update public.users set points = points + $1 where id = $2', [row.points_used, row.buyer_id]);
      }
      return { status: 200, row, body: { order: serialize.order(updated.rows[0]) } };
    });
    if (result.status === 200) {
      await notify([result.row.seller_id], {
        type: 'order',
        title: 'Захиалга цуцлагдлаа',
        body: 'Таны бараа дахин зарагдаж байна.',
        data: { url: `/order/${result.row.id}` },
      });
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// My orders: what I bought (purchases) and what I sold (sales), newest first.
router.get('/mine', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `select o.*, to_jsonb(p) as product_row, to_jsonb(b) as buyer_row,
              to_jsonb(s) as seller_row, to_jsonb(d) as delivery_row
       from public.orders o
       join public.products p on p.id = o.product_id
       join public.users b on b.id = o.buyer_id
       join public.users s on s.id = o.seller_id
       left join public.deliveries d on d.order_id = o.id
       where o.buyer_id = $1 or o.seller_id = $1
       order by o.created_at desc`,
      [req.user.id]
    );
    const format = (row) => ({
      order: serialize.order(row, {
        product: serialize.pick(serialize.product(row.product_row), ['title', 'images', 'price']),
        buyer: serialize.pick(serialize.user(row.buyer_row), ['name']),
        seller: serialize.pick(serialize.user(row.seller_row), ['name']),
      }),
      delivery: serialize.pick(serialize.delivery(row.delivery_row), ['trackingNumber', 'currentStatus']),
    });
    res.json({
      purchases: rows.filter((r) => r.buyer_id === req.user.id).map(format),
      sales: rows.filter((r) => r.seller_id === req.user.id).map(format),
    });
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

    const review = await query('select * from public.reviews where order_id = $1', [row.id]);
    const { reviewable, formatReview } = require('./users');
    res.json({
      order: serialize.order(row, {
        product: serialize.product(row.product_row),
        buyer: serialize.pick(serialize.user(row.buyer_row), ['name']),
        seller: serialize.pick(serialize.user(row.seller_row), ['name', 'avatar', 'isVerified']),
      }),
      delivery: serialize.delivery(row.delivery_row),
      review: review.rows[0] ? formatReview(review.rows[0]) : null,
      canReview: !review.rows[0] && row.buyer_id === req.user.id && reviewable(row),
      bankAccount: row.status === 'pending' && row.payment_status === 'pending' ? bankAccount() : undefined,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = { router, canView, bankAccount };
