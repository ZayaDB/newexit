const express = require('express');
const { query, transaction } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');
const { notify } = require('../lib/notify');
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

// ---------------------------------------------------------------------------
// Delivery drivers (role 'mover'; admins can do everything a driver can).
//   confirmed  -> a driver accepts the job
//   picked_up  -> the driver has the item in hand
//   in_transit -> handed to the parcel / cargo company (carrier + its tracking no.)
//   delivered  -> the buyer has it
// ---------------------------------------------------------------------------

const STEPS = ['confirmed', 'picked_up', 'in_transit', 'delivered'];
const STEP_LABELS = {
  confirmed: 'Төлбөр баталгаажсан',
  picked_up: 'Жолооч бараа хүлээн авсан',
  in_transit: 'Илгээмжид өгсөн',
  delivered: 'Хүргэгдсэн',
};
// Matching order status for each delivery step.
const ORDER_STATUS = { picked_up: 'preparing', in_transit: 'shipping', delivered: 'delivered' };
const NOTICE = {
  picked_up: (title) => ({ title: 'Жолооч бараа хүлээн авлаа', body: `"${title}" хүргэлтэнд бэлтгэгдэж байна.` }),
  in_transit: (title) => ({ title: 'Бараа илгээгдлээ', body: `"${title}" замдаа гарлаа.` }),
  delivered: (title) => ({ title: 'Бараа хүргэгдлээ', body: `"${title}" хүргэгдсэн. Худалдагчид үнэлгээ өгөөрэй!` }),
};

function stepIndex(status) {
  // Older deliveries used preparing / out_for_delivery.
  const legacy = { preparing: 'picked_up', out_for_delivery: 'in_transit' };
  return STEPS.indexOf(legacy[status] || status);
}

function buildTimeline(row, upTo, now) {
  const old = Array.isArray(row.timeline) ? row.timeline : [];
  const at = (status) => old.find((s) => s.status === status && s.timestamp)?.timestamp;
  return STEPS.map((status, i) => ({
    status,
    labelMn: STEP_LABELS[status],
    timestamp: i <= upTo ? at(status) || now : null,
    completed: i <= upTo,
  }));
}

function isStaff(user) {
  return user.role === 'mover' || user.role === 'admin';
}

const SELECT_JOBS = `
  select d.*, to_jsonb(o) as order_row, to_jsonb(p) as product_row,
         to_jsonb(b) as buyer_row, to_jsonb(s) as seller_row, to_jsonb(dr) as driver_row
  from public.deliveries d
  join public.orders o on o.id = d.order_id
  join public.products p on p.id = o.product_id
  join public.users b on b.id = o.buyer_id
  join public.users s on s.id = o.seller_id
  left join public.users dr on dr.id = d.driver_id`;

function formatJob(row) {
  const contact = (u) => u && serialize.pick(serialize.user(u), ['name', 'phone', 'avatar']);
  return {
    ...serialize.delivery(row),
    order: serialize.order(row.order_row, {
      product: serialize.pick(serialize.product(row.product_row), ['title', 'images', 'price', 'location']),
      buyer: contact(row.buyer_row),
      seller: contact(row.seller_row),
    }),
    driverUser: contact(row.driver_row) || undefined,
  };
}

// GET /api/deliveries/jobs?scope=available|mine|done
router.get('/jobs', auth, async (req, res) => {
  try {
    if (!isStaff(req.user)) return res.status(403).json({ message: 'Эрх хүрэлцэхгүй' });
    const scope = ['available', 'mine', 'done'].includes(req.query.scope) ? req.query.scope : 'available';
    const where = {
      available: "d.driver_id is null and d.current_status = 'confirmed'",
      mine: "d.driver_id = $1 and d.current_status <> 'delivered'",
      done: "d.driver_id = $1 and d.current_status = 'delivered'",
    }[scope];
    const order = scope === 'done' ? 'd.delivered_at desc nulls last' : 'd.created_at asc';
    const params = scope === 'available' ? [] : [req.user.id];
    const { rows } = await query(`${SELECT_JOBS} where ${where} order by ${order} limit 100`, params);
    res.json({ items: rows.map(formatJob) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/deliveries/:id/accept  -> the driver takes the job
router.post('/:id/accept', auth, async (req, res) => {
  try {
    if (!isStaff(req.user)) return res.status(403).json({ message: 'Эрх хүрэлцэхгүй' });
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Хүргэлт олдсонгүй' });
    const driver = { name: req.user.name, phone: req.user.phone || '', role: 'NEW EXIT жолооч' };
    const { rows } = await query(
      `update public.deliveries set driver_id = $2, driver = $3
       where id = $1 and driver_id is null and current_status = 'confirmed' returning *`,
      [req.params.id, req.user.id, driver]
    );
    if (!rows[0]) return res.status(409).json({ message: 'Энэ ажлыг өөр жолооч авсан байна' });
    const full = await query(`${SELECT_JOBS} where d.id = $1`, [rows[0].id]);
    const job = full.rows[0];
    await notify([job.order_row.buyer_id, job.order_row.seller_id], {
      type: 'delivery',
      title: 'Жолооч томилогдлоо',
      body: `${req.user.name} таны "${job.product_row.title}" барааг хүргэнэ.`,
      data: { url: `/delivery/${job.order_id}` },
    });
    res.json(formatJob(job));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/deliveries/:id/status  { status: picked_up|in_transit|delivered, carrier?, carrierTracking? }
router.post('/:id/status', auth, async (req, res) => {
  try {
    if (!isStaff(req.user)) return res.status(403).json({ message: 'Эрх хүрэлцэхгүй' });
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Хүргэлт олдсонгүй' });
    const next = req.body?.status;
    const target = STEPS.indexOf(next);
    if (target < 1) return res.status(400).json({ message: 'Буруу төлөв' });
    const carrier = typeof req.body?.carrier === 'string' ? req.body.carrier.trim().slice(0, 80) : '';
    const carrierTracking =
      typeof req.body?.carrierTracking === 'string' ? req.body.carrierTracking.trim().slice(0, 80) : '';

    const result = await transaction(async (db) => {
      const { rows } = await db.query('select * from public.deliveries where id = $1 for update', [req.params.id]);
      const row = rows[0];
      if (!row) return { status: 404, body: { message: 'Хүргэлт олдсонгүй' } };
      if (req.user.role !== 'admin' && row.driver_id !== req.user.id) {
        return { status: 403, body: { message: 'Энэ хүргэлт танд оноогдоогүй байна' } };
      }
      const current = stepIndex(row.current_status);
      if (target <= current) return { status: 409, body: { message: 'Энэ алхам аль хэдийн хийгдсэн' } };
      if (target > current + 1) return { status: 409, body: { message: 'Өмнөх алхмыг эхлээд хийнэ үү' } };

      const now = new Date();
      await db.query(
        `update public.deliveries set current_status = $2, timeline = $3,
           driver_id = coalesce(driver_id, $4),
           carrier = coalesce(nullif($5, ''), carrier),
           carrier_tracking = coalesce(nullif($6, ''), carrier_tracking),
           picked_up_at = case when $2 = 'picked_up' then $7 else picked_up_at end,
           shipped_at = case when $2 = 'in_transit' then $7 else shipped_at end,
           departure_date = case when $2 = 'in_transit' then $7 else departure_date end,
           delivered_at = case when $2 = 'delivered' then $7 else delivered_at end
         where id = $1`,
        [row.id, next, JSON.stringify(buildTimeline(row, target, now)), req.user.id, carrier, carrierTracking, now]
      );
      const order = await db.query('select * from public.orders where id = $1 for update', [row.order_id]);
      const history = Array.isArray(order.rows[0].status_history) ? order.rows[0].status_history : [];
      await db.query('update public.orders set status = $2, status_history = $3 where id = $1', [
        row.order_id,
        ORDER_STATUS[next],
        JSON.stringify([...history, { status: ORDER_STATUS[next], label: STEP_LABELS[next], timestamp: now }]),
      ]);
      return { status: 200, id: row.id };
    });
    if (result.status !== 200) return res.status(result.status).json(result.body);

    const full = await query(`${SELECT_JOBS} where d.id = $1`, [result.id]);
    const job = full.rows[0];
    const notice = NOTICE[next](job.product_row.title);
    await notify([job.order_row.buyer_id], { type: 'delivery', ...notice, data: { url: `/delivery/${job.order_id}` } });
    await notify([job.order_row.seller_id], {
      type: 'delivery',
      title: notice.title,
      body: `Таны зарсан "${job.product_row.title}": ${STEP_LABELS[next].toLowerCase()}.`,
      data: { url: `/order/${job.order_id}` },
    });
    res.json(formatJob(job));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
