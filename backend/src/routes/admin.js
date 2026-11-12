// Admin tools: dashboard numbers, reports (App Store 1.2), listings, users.
const express = require('express');
const { query, transaction } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');
const { notify } = require('../lib/notify');

const router = express.Router();

router.use(auth, (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Эрх хүрэлцэхгүй' });
  next();
});

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// GET /api/admin/stats
router.get('/stats', async (_req, res) => {
  try {
    const { rows } = await query(`
      select
        (select count(*)::int from public.users where deleted_at is null) as users,
        (select count(*)::int from public.products where status = 'active') as active_products,
        (select count(*)::int from public.orders where status = 'pending' and payment_status = 'pending') as pending_payments,
        (select count(*)::int from public.reports where status = 'open') as open_reports,
        (select count(*)::int from public.deliveries where current_status <> 'delivered') as open_deliveries`);
    const r = rows[0];
    res.json({
      users: r.users,
      activeProducts: r.active_products,
      pendingPayments: r.pending_payments,
      openReports: r.open_reports,
      openDeliveries: r.open_deliveries,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/reports?status=open|resolved
router.get('/reports', async (req, res) => {
  try {
    const status = req.query.status === 'resolved' ? 'resolved' : 'open';
    const { rows } = await query(
      `select r.*, rep.name as reporter_name,
         p.title as product_title, p.images as product_images, p.status as product_status, p.seller_id as product_seller_id,
         tu.name as user_name, tu.suspended_at as user_suspended_at,
         m.body as message_body, m.image_url as message_image, m.sender_id as message_sender_id,
         ms.name as message_sender_name
       from public.reports r
       join public.users rep on rep.id = r.reporter_id
       left join public.products p on r.target_type = 'product' and p.id = r.target_id
       left join public.users tu on r.target_type = 'user' and tu.id = r.target_id
       left join public.messages m on r.target_type = 'message' and m.id = r.target_id
       left join public.users ms on ms.id = m.sender_id
       where r.status = $1
       order by r.created_at ${status === 'open' ? 'asc' : 'desc'} limit 200`,
      [status]
    );
    res.json({
      items: rows.map((r) => ({
        _id: r.id,
        id: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason ?? undefined,
        status: r.status,
        action: r.action ?? undefined,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at ?? undefined,
        reporter: { _id: r.reporter_id, name: r.reporter_name },
        product: r.product_title
          ? { _id: r.target_id, title: r.product_title, images: r.product_images, status: r.product_status, sellerId: r.product_seller_id }
          : undefined,
        user: r.user_name ? { _id: r.target_id, name: r.user_name, suspended: Boolean(r.user_suspended_at) } : undefined,
        message:
          r.message_body != null
            ? { body: r.message_body, image: r.message_image ?? undefined, sender: { _id: r.message_sender_id, name: r.message_sender_name } }
            : undefined,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const ACTIONS = ['dismiss', 'hide_product', 'suspend_user', 'delete_message'];

// POST /api/admin/reports/:id/resolve  { action }
router.post('/reports/:id/resolve', async (req, res) => {
  try {
    const action = req.body?.action;
    if (!ACTIONS.includes(action)) return res.status(400).json({ message: 'Буруу үйлдэл' });
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Олдсонгүй' });

    const result = await transaction(async (db) => {
      const { rows } = await db.query('select * from public.reports where id = $1 for update', [req.params.id]);
      const report = rows[0];
      if (!report) return { status: 404, body: { message: 'Олдсонгүй' } };

      let offenderId = null;
      if (action === 'hide_product') {
        if (report.target_type !== 'product') return { status: 400, body: { message: 'Бараа биш байна' } };
        const p = await db.query("update public.products set status = 'hidden' where id = $1 returning seller_id", [report.target_id]);
        offenderId = p.rows[0]?.seller_id;
      } else if (action === 'delete_message') {
        if (report.target_type !== 'message') return { status: 400, body: { message: 'Мессеж биш байна' } };
        await db.query(
          "update public.messages set body = 'Энэ мессежийг админ устгасан.', image_url = null where id = $1",
          [report.target_id]
        );
      } else if (action === 'suspend_user') {
        const target =
          report.target_type === 'user'
            ? report.target_id
            : report.target_type === 'product'
              ? (await db.query('select seller_id from public.products where id = $1', [report.target_id])).rows[0]?.seller_id
              : (await db.query('select sender_id from public.messages where id = $1', [report.target_id])).rows[0]?.sender_id;
        if (!target) return { status: 404, body: { message: 'Хэрэглэгч олдсонгүй' } };
        if (target === req.user.id) return { status: 400, body: { message: 'Өөрийгөө хаах боломжгүй' } };
        await db.query('update public.users set suspended_at = coalesce(suspended_at, now()) where id = $1', [target]);
        await db.query('delete from public.push_tokens where user_id = $1', [target]);
      }

      // Resolve every open report about the same thing at once.
      await db.query(
        `update public.reports set status = 'resolved', resolved_at = now(), resolved_by = $3, action = $4
         where target_type = $1 and target_id = $2 and status = 'open'`,
        [report.target_type, report.target_id, req.user.id, action]
      );
      return { status: 200, body: { ok: true }, offenderId, report };
    });
    if (result.status === 200 && result.offenderId && action === 'hide_product') {
      await notify([result.offenderId], {
        type: 'admin',
        title: 'Таны зарыг нуусан',
        body: 'Зар журам зөрчсөн гэж мэдээлэгдсэн тул админ нуусан. Асуух зүйл байвал бидэнтэй холбогдоно уу.',
        data: { url: '/my-products' },
      });
    }
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/products?search=&status=active|sold|hidden
router.get('/products', async (req, res) => {
  try {
    const params = [];
    const clauses = [];
    if (['active', 'sold', 'hidden', 'draft'].includes(req.query.status)) {
      params.push(req.query.status);
      clauses.push(`p.status = $${params.length}`);
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
      params.push(`%${escapeLike(search)}%`);
      clauses.push(`(p.title ilike $${params.length} or u.name ilike $${params.length})`);
    }
    const { rows } = await query(
      `select p.*, u.name as seller_name from public.products p
       join public.users u on u.id = p.seller_id
       ${clauses.length ? `where ${clauses.join(' and ')}` : ''}
       order by p.created_at desc limit 200`,
      params
    );
    res.json({
      items: rows.map((r) => serialize.product(r, { seller: { _id: r.seller_id, id: r.seller_id, name: r.seller_name } })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST /api/admin/products/:id/visibility  { hidden: true|false }
router.post('/products/:id/visibility', async (req, res) => {
  try {
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Бараа олдсонгүй' });
    const hidden = Boolean(req.body?.hidden);
    let status = 'hidden';
    if (!hidden) {
      // Back on sale unless someone already bought it.
      const open = await query(
        "select 1 from public.orders where product_id = $1 and status <> 'cancelled' limit 1",
        [req.params.id]
      );
      status = open.rowCount ? 'sold' : 'active';
    }
    const { rows } = await query('update public.products set status = $2 where id = $1 returning *', [req.params.id, status]);
    if (!rows[0]) return res.status(404).json({ message: 'Бараа олдсонгүй' });
    res.json(serialize.product(rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/admin/users?search=&role=
router.get('/users', async (req, res) => {
  try {
    const params = [];
    const clauses = ['u.deleted_at is null'];
    if (['buyer', 'seller', 'mover', 'admin'].includes(req.query.role)) {
      params.push(req.query.role);
      clauses.push(`u.role = $${params.length}`);
    }
    if (req.query.suspended === 'true') clauses.push('u.suspended_at is not null');
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    if (search) {
      params.push(`%${escapeLike(search)}%`);
      clauses.push(`(u.name ilike $${params.length} or u.email ilike $${params.length} or u.phone ilike $${params.length})`);
    }
    const { rows } = await query(
      `select u.*,
         (select count(*)::int from public.products p where p.seller_id = u.id) as product_count,
         (select count(*)::int from public.reports r where r.target_type = 'user' and r.target_id = u.id) as report_count
       from public.users u where ${clauses.join(' and ')}
       order by u.created_at desc limit 200`,
      params
    );
    res.json({
      items: rows.map((r) => ({
        ...serialize.pick(serialize.user(r), ['name', 'email', 'phone', 'role', 'isVerified', 'avatar', 'suspended', 'createdAt']),
        productCount: r.product_count,
        reportCount: r.report_count,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const ROLES = ['buyer', 'seller', 'mover', 'admin'];

// PATCH /api/admin/users/:id  { role?, suspended?, isVerified? }
router.patch('/users/:id', async (req, res) => {
  try {
    if (!serialize.isUuid(req.params.id)) return res.status(404).json({ message: 'Хэрэглэгч олдсонгүй' });
    const b = req.body || {};
    if (req.params.id === req.user.id && (b.role !== undefined || b.suspended !== undefined)) {
      return res.status(400).json({ message: 'Өөрийн эрхийг өөрчлөх боломжгүй' });
    }
    if (b.role !== undefined && !ROLES.includes(b.role)) return res.status(400).json({ message: 'Буруу эрх' });
    const { rows } = await query(
      `update public.users set
         role = coalesce($2, role),
         is_verified = coalesce($3, is_verified),
         suspended_at = case when $4::boolean is null then suspended_at
                             when $4 then coalesce(suspended_at, now()) else null end
       where id = $1 and deleted_at is null returning *`,
      [
        req.params.id,
        b.role ?? null,
        typeof b.isVerified === 'boolean' ? b.isVerified : null,
        typeof b.suspended === 'boolean' ? b.suspended : null,
      ]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Хэрэглэгч олдсонгүй' });
    if (b.suspended === true) await query('delete from public.push_tokens where user_id = $1', [req.params.id]);
    if (b.role === 'mover') {
      await notify([req.params.id], {
        type: 'admin',
        title: 'Та жолоочийн эрх авлаа',
        body: 'Миний хуудас → Хүргэлтийн ажил хэсгээс хүргэлт авч эхлээрэй.',
        data: { url: '/mover' },
      });
    }
    res.json(serialize.pick(serialize.user(rows[0]), ['name', 'email', 'phone', 'role', 'isVerified', 'avatar', 'suspended', 'createdAt']));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
