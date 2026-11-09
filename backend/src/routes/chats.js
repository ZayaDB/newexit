// Buyer <-> seller chat about one product. The app polls for new messages.
const express = require('express');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');
const { auth } = require('../middleware/auth');

const router = express.Router();

const MAX_BODY = 1000;

function isBlocked(a, b) {
  return query(
    `select 1 from public.blocks
     where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1) limit 1`,
    [a, b]
  ).then((r) => r.rowCount > 0);
}

// Loads a conversation the user takes part in, or null.
async function findConversation(id, userId) {
  if (!serialize.isUuid(id)) return null;
  const { rows } = await query(
    'select * from public.conversations where id = $1 and (buyer_id = $2 or seller_id = $2)',
    [id, userId]
  );
  return rows[0] || null;
}

function message(row) {
  return {
    _id: row.id,
    id: row.id,
    conversation: row.conversation_id,
    sender: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

function conversation(row, userId) {
  const iAmBuyer = row.buyer_id === userId;
  const other = serialize.user(iAmBuyer ? row.seller_row : row.buyer_row);
  const product = serialize.product(row.product_row);
  return {
    _id: row.id,
    id: row.id,
    role: iAmBuyer ? 'buyer' : 'seller',
    otherUser: other && {
      _id: other._id,
      id: other.id,
      name: other.name,
      avatar: other.avatar,
      isVerified: other.isVerified,
    },
    product: product && {
      _id: product._id,
      id: product.id,
      title: product.title,
      price: product.price,
      images: product.images,
      status: product.status,
    },
    lastMessage: row.last_row ? message(row.last_row) : null,
    unreadCount: row.unread_count ?? 0,
    blocked: Boolean(row.blocked),
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

const SELECT_CONVERSATIONS = `
  select c.*, to_jsonb(p) as product_row, to_jsonb(b) as buyer_row, to_jsonb(s) as seller_row,
    (select to_jsonb(m) from public.messages m where m.conversation_id = c.id
       order by m.created_at desc limit 1) as last_row,
    (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> $1
       and m.created_at > case when c.buyer_id = $1 then c.buyer_read_at else c.seller_read_at end) as unread_count,
    exists (select 1 from public.blocks bl where
       (bl.blocker_id = c.buyer_id and bl.blocked_id = c.seller_id) or
       (bl.blocker_id = c.seller_id and bl.blocked_id = c.buyer_id)) as blocked
  from public.conversations c
  join public.products p on p.id = c.product_id
  join public.users b on b.id = c.buyer_id
  join public.users s on s.id = c.seller_id`;

// My conversations, newest activity first. Hides chats with people I blocked.
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await query(
      `${SELECT_CONVERSATIONS}
       where (c.buyer_id = $1 or c.seller_id = $1)
         and not exists (select 1 from public.blocks bl where bl.blocker_id = $1
           and bl.blocked_id = case when c.buyer_id = $1 then c.seller_id else c.buyer_id end)
       order by c.last_message_at desc`,
      [req.user.id]
    );
    const items = rows.map((r) => conversation(r, req.user.id));
    res.json({ items, unreadTotal: items.reduce((n, c) => n + c.unreadCount, 0) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Open (or reuse) the chat with a product's seller.
router.post('/', auth, async (req, res) => {
  try {
    const { productId } = req.body || {};
    if (!serialize.isUuid(productId)) return res.status(404).json({ message: 'Бараа олдсонгүй' });
    const p = await query('select id, seller_id from public.products where id = $1', [productId]);
    const product = p.rows[0];
    if (!product) return res.status(404).json({ message: 'Бараа олдсонгүй' });
    if (product.seller_id === req.user.id) {
      return res.status(400).json({ message: 'Өөрийн бараанд чат бичих боломжгүй' });
    }
    if (await isBlocked(req.user.id, product.seller_id)) {
      return res.status(403).json({ message: 'Энэ хэрэглэгчтэй чатлах боломжгүй' });
    }
    await query(
      `insert into public.conversations (product_id, buyer_id, seller_id) values ($1, $2, $3)
       on conflict (product_id, buyer_id) do nothing`,
      [product.id, req.user.id, product.seller_id]
    );
    const { rows } = await query(
      `${SELECT_CONVERSATIONS} where c.product_id = $2 and c.buyer_id = $1`,
      [req.user.id, product.id]
    );
    res.status(201).json(conversation(rows[0], req.user.id));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const c = await findConversation(req.params.id, req.user.id);
    if (!c) return res.status(404).json({ message: 'Чат олдсонгүй' });
    const { rows } = await query(`${SELECT_CONVERSATIONS} where c.id = $2`, [req.user.id, c.id]);
    res.json(conversation(rows[0], req.user.id));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Messages in a chat. ?after=<ISO time> returns only newer ones (for polling).
// Reading marks the chat as read.
router.get('/:id/messages', auth, async (req, res) => {
  try {
    const c = await findConversation(req.params.id, req.user.id);
    if (!c) return res.status(404).json({ message: 'Чат олдсонгүй' });
    const after = req.query.after ? new Date(String(req.query.after)) : null;
    const params = [c.id];
    let where = 'conversation_id = $1';
    if (after && !Number.isNaN(after.getTime())) {
      params.push(after);
      where += " and date_trunc('milliseconds', created_at) > $2";
    }
    const { rows } = await query(
      `select * from (select * from public.messages where ${where} order by created_at desc limit 200) m
       order by created_at asc`,
      params
    );
    const column = c.buyer_id === req.user.id ? 'buyer_read_at' : 'seller_read_at';
    await query(`update public.conversations set ${column} = now() where id = $1`, [c.id]);
    res.json({ items: rows.map(message) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/messages', auth, async (req, res) => {
  try {
    const c = await findConversation(req.params.id, req.user.id);
    if (!c) return res.status(404).json({ message: 'Чат олдсонгүй' });
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ message: 'Мессеж хоосон байна' });
    if (body.length > MAX_BODY) return res.status(400).json({ message: 'Мессеж хэт урт байна' });
    const other = c.buyer_id === req.user.id ? c.seller_id : c.buyer_id;
    if (await isBlocked(req.user.id, other)) {
      return res.status(403).json({ message: 'Энэ хэрэглэгчтэй чатлах боломжгүй' });
    }
    const { rows } = await query(
      'insert into public.messages (conversation_id, sender_id, body) values ($1, $2, $3) returning *',
      [c.id, req.user.id, body]
    );
    const column = c.buyer_id === req.user.id ? 'buyer_read_at' : 'seller_read_at';
    await query(
      `update public.conversations set last_message_at = $2, ${column} = $2 where id = $1`,
      [c.id, rows[0].created_at]
    );
    res.status(201).json(message(rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
