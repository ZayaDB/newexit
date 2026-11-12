// End-to-end test of every API endpoint against a real Postgres database.
// Creates its own test accounts/products (emails *@test.newexit, titles with a
// unique tag) and deletes them afterwards, so existing data is left alone.
// Still best run against a dev/local database:  npm test
require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const { pool } = require('../src/config/db');

const TAG = `t${crypto.randomBytes(4).toString('hex')}`;
const PASSWORD = 'pass1234';
const email = (who) => `${who}.${TAG}@test.newexit`;
const PHONE_BASE = String(crypto.randomInt(10000000, 100000000));
const phone = (n) => `+976${PHONE_BASE}${n}`;

let server;
let base;
const tokens = {};
const ids = {};

async function api(method, url, { body, token } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(who) {
  const r = await api('POST', '/auth/login/email', { body: { email: email(who), password: PASSWORD } });
  assert.equal(r.status, 200, `${who} login`);
  tokens[who] = r.body.token;
  ids[who] = r.body.user.id;
}

async function createProduct(title, extra = {}) {
  const r = await api('POST', '/products', {
    token: tokens.seller,
    body: { title: `${title} ${TAG}`, category: 'furniture', price: 100000, location: 'Сөүл, Мапо', ...extra },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;

  // A mover account can't be made through the API, so insert it directly.
  const hash = await bcrypt.hash(PASSWORD, 10);
  await pool.query(
    "insert into public.users (name, email, password, role, is_verified) values ($1, $2, $3, 'mover', true)",
    ['Test Mover', email('mover'), hash]
  );
  await pool.query(
    "insert into public.users (name, email, password, role, is_verified) values ($1, $2, $3, 'admin', true)",
    ['Test Admin', email('admin'), hash]
  );
});

after(async () => {
  const users = await pool.query("select id from public.users where email like $1", [`%.${TAG}@test.newexit`]);
  const userIds = [...new Set([...users.rows.map((u) => u.id), ...(ids.gone ? [ids.gone] : [])])];
  if (userIds.length) {
    await pool.query('delete from public.orders where buyer_id = any($1) or seller_id = any($1)', [userIds]);
    await pool.query('delete from public.users where id = any($1)', [userIds]);
  }
  server.close();
  await pool.end();
});

test('health', async () => {
  const r = await api('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.database, 'ok');
});

test('register', async () => {
  const buyer = await api('POST', '/auth/register', {
    body: { name: 'Тест Худалдан авагч', email: email('BUYER'), phone: phone(1), password: PASSWORD },
  });
  assert.equal(buyer.status, 201, JSON.stringify(buyer.body));
  assert.equal(buyer.body.user.email, email('buyer'), 'email is lower-cased');
  assert.equal(buyer.body.user.points, 0, 'new accounts start with 0 points');
  assert.equal(buyer.body.user.role, 'buyer');
  assert.equal(buyer.body.user.password, undefined);

  for (const who of ['seller', 'other']) {
    const r = await api('POST', '/auth/register', { body: { name: `Тест ${who}`, email: email(who), password: PASSWORD } });
    assert.equal(r.status, 201);
  }

  assert.equal((await api('POST', '/auth/register', {
    body: { name: 'x', email: email('buyer'), password: 'x' },
  })).status, 409);
  assert.equal((await api('POST', '/auth/register', {
    body: { name: 'x', phone: phone(1), password: 'x' },
  })).status, 409);
  assert.equal((await api('POST', '/auth/register', { body: { name: 'x' } })).status, 400);
});

test('login with email and phone', async () => {
  for (const who of ['buyer', 'seller', 'other', 'mover']) await login(who);

  assert.equal((await api('POST', '/auth/login/email', {
    body: { email: email('buyer'), password: 'wrong' },
  })).status, 401);
  assert.equal((await api('POST', '/auth/login/email', { body: {} })).status, 401);

  const byPhone = await api('POST', '/auth/login/phone', { body: { phone: phone(1), password: PASSWORD } });
  assert.equal(byPhone.status, 200);
  assert.equal(byPhone.body.user.email, email('buyer'));
  assert.equal((await api('POST', '/auth/login/phone', { body: { phone: phone(1), password: 'no' } })).status, 401);

  // Korean numbers match however they're typed
  const kr = `010${PHONE_BASE}`;
  const reg = await api('POST', '/auth/register', {
    body: { name: 'KR', email: email('kr'), phone: kr.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3'), password: PASSWORD },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.user.phone, kr);
  for (const typed of [kr, `+82 ${kr.slice(1)}`, kr.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1 $2 $3')]) {
    const r = await api('POST', '/auth/login/phone', { body: { phone: typed, password: PASSWORD } });
    assert.equal(r.status, 200, typed);
  }
  assert.equal((await api('POST', '/auth/register', {
    body: { name: 'dup', phone: `+82-${kr.slice(1)}`, password: 'x' },
  })).status, 409);
});

test('me', async () => {
  const r = await api('GET', '/auth/me', { token: tokens.buyer });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.id, ids.buyer);
  assert.equal((await api('GET', '/auth/me')).status, 401);
  assert.equal((await api('GET', '/auth/me', { token: 'garbage' })).status, 401);
});

test('categories', async () => {
  const r = await api('GET', '/categories');
  assert.equal(r.status, 200);
  const keys = r.body.map((c) => c.key);
  for (const k of ['all', 'furniture', 'electronics', 'clothing', 'kitchen', 'other']) assert.ok(keys.includes(k), k);
  assert.equal(r.body[0].key, 'all');
  assert.ok(r.body[0]._id);
  ids.furnitureCategory = r.body.find((c) => c.key === 'furniture')._id;
  ids.allCategory = r.body.find((c) => c.key === 'all')._id;
});

test('create product', async () => {
  const lamp = await createProduct('Чийдэн', {
    category: ids.furnitureCategory,
    price: 15000,
    condition: 'good',
    images: ['https://example.com/a.jpg'],
    dimensions: { width: 20, height: 40 },
  });
  assert.equal(lamp.seller.name, 'Тест seller');
  assert.equal(lamp.seller.email, undefined);
  assert.equal(lamp.category.key, 'furniture');
  assert.equal(lamp.isFree, false);
  assert.equal(lamp.status, 'active');
  assert.deepEqual(lamp.dimensions, { unit: 'cm', width: 20, height: 40 });
  ids.lamp = lamp._id;

  const free = await createProduct('Ном', { category: 'other', price: 0 });
  assert.equal(free.isFree, true);
  ids.fridge = (await createProduct('Хөргөгч', { category: 'electronics', price: 420000 }))._id;
  ids.table = (await createProduct('Ширээ', { price: 180000 }))._id;
  ids.race = (await createProduct('Сандал', { price: 50000 }))._id;

  const bad = (body) => api('POST', '/products', { token: tokens.seller, body });
  assert.equal((await api('POST', '/products', { body: { title: 'x' } })).status, 401);
  assert.equal((await bad({ title: 'x' })).status, 400);
  assert.equal((await bad({ title: 'x', category: 'nope', price: 1, location: 'y' })).status, 400);
  assert.equal((await bad({ title: 'x', category: 'other', price: -5, location: 'y' })).status, 400);
  assert.equal((await bad({ title: 'x', category: 'other', price: 1, location: 'y', condition: 'broken' })).status, 400);
});

test('product list, filters, sort, paging', async () => {
  const mine = await api('GET', `/products?search=${TAG}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.total, 5);
  assert.ok(mine.body.items.every((p) => p.seller.name === 'Тест seller' && p.category.nameMn));

  assert.equal((await api('GET', `/products?search=Хөргөгч ${TAG}`)).body.total, 1);
  assert.equal((await api('GET', `/products?search=${TAG}&category=electronics`)).body.total, 1);
  assert.equal((await api('GET', `/products?search=${TAG}&category=${ids.furnitureCategory}`)).body.total, 3);
  assert.equal((await api('GET', `/products?search=${TAG}&category=all`)).body.total, 5);
  assert.equal((await api('GET', `/products?search=${TAG}&category=${ids.allCategory}`)).body.total, 5);
  assert.equal((await api('GET', `/products?search=${TAG}&free=true`)).body.total, 1);
  assert.equal((await api('GET', `/products?search=${TAG}&featured=true`)).body.total, 0);
  assert.equal((await api('GET', `/products?search=%25${TAG}`)).body.total, 0, '% is matched literally');

  const prices = async (sort) =>
    (await api('GET', `/products?search=${TAG}&sort=${sort}`)).body.items.map((p) => p.price);
  assert.deepEqual(await prices('price_asc'), [0, 15000, 50000, 180000, 420000]);
  assert.deepEqual(await prices('price_desc'), [420000, 180000, 50000, 15000, 0]);
  assert.equal((await api('GET', `/products?search=${TAG}&sort=popular`)).status, 200);

  const page2 = await api('GET', `/products?search=${TAG}&limit=3&page=2`);
  assert.equal(page2.body.items.length, 2);
  assert.equal(page2.body.page, 2);
  assert.equal(page2.body.total, 5);
});

test('product detail increments views', async () => {
  const a = await api('GET', `/products/${ids.lamp}`);
  assert.equal(a.status, 200);
  assert.ok('location' in a.body.seller);
  const b = await api('GET', `/products/${ids.lamp}`);
  assert.equal(b.body.viewCount, a.body.viewCount + 1);
  assert.equal((await api('GET', '/products/00000000-0000-0000-0000-000000000000')).status, 404);
  assert.equal((await api('GET', '/products/665f1c2e8b3f4a0012345678')).status, 404);
});

test('create order: waits for bank transfer', async () => {
  await pool.query('update public.users set points = 5000 where id = $1', [ids.buyer]);

  const info = await api('GET', '/orders/payment-info');
  assert.equal(info.status, 200);
  assert.equal(info.body.bankAccount.accountNumber, '354601-04-120996');
  assert.equal(info.body.bankAccount.accountHolder, 'TSOGTGEREL BAASANTSEREN');

  const r = await api('POST', '/orders', {
    token: tokens.buyer,
    body: { productId: ids.fridge, paymentMethod: 'bank', pointsUsed: 1000, deliveryAddress: 'Улаанбаатар' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const { order, delivery, bankAccount } = r.body;
  assert.equal(order.itemPrice, 420000);
  assert.equal(order.totalAmount, 420000 + 30000 + 20000 - 1000);
  assert.equal(order.status, 'pending');
  assert.equal(order.paymentStatus, 'pending');
  assert.equal(order.paymentMethod, 'bank');
  assert.equal(order.deliveryAddress, 'Улаанбаатар');
  assert.equal(order.product.status, 'sold', 'reserved while waiting for payment');
  assert.equal(order.buyer.email, email('buyer'));
  assert.equal(order.seller.name, 'Тест seller');
  assert.equal(delivery, null, 'no delivery until paid');
  assert.equal(bankAccount.accountNumber, '354601-04-120996');
  ids.order = order._id;

  const detail = await api('GET', `/orders/${ids.order}`, { token: tokens.buyer });
  assert.equal(detail.body.delivery, null);
  assert.equal(detail.body.bankAccount.accountNumber, '354601-04-120996');

  const me = await api('GET', '/auth/me', { token: tokens.buyer });
  assert.equal(me.body.user.points, 4000);

  assert.equal((await api('GET', `/products?search=Хөргөгч ${TAG}`)).body.total, 0, 'reserved items leave the list');
  assert.equal((await api('POST', '/orders', { token: tokens.other, body: { productId: ids.fridge } })).status, 404);
});

test('admin confirms the transfer: order paid, delivery starts', async () => {
  await login('admin');
  assert.equal((await api('GET', '/orders/admin/pending', { token: tokens.buyer })).status, 403);
  const pending = await api('GET', '/orders/admin/pending', { token: tokens.admin });
  assert.equal(pending.status, 200);
  assert.ok(pending.body.items.some((x) => x.order._id === ids.order));

  assert.equal((await api('POST', `/orders/${ids.order}/confirm-payment`, { token: tokens.buyer })).status, 403);
  const r = await api('POST', `/orders/${ids.order}/confirm-payment`, { token: tokens.admin });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.order.status, 'confirmed');
  assert.equal(r.body.order.paymentStatus, 'paid');
  assert.ok(r.body.order.paidAt);
  assert.equal(r.body.order.statusHistory.length, 2);
  const { delivery } = r.body;
  assert.match(delivery.trackingNumber, /^NE\d+KR$/);
  assert.equal(delivery.currentStatus, 'confirmed');
  assert.equal(delivery.driver, undefined, 'no driver assigned yet');
  assert.deepEqual(delivery.timeline.map((t) => t.completed), [true, false, false, false]);
  assert.match(delivery.estimatedArrival, /^\d{4}\.\d{2}\.\d{2} ~ \d{2}\.\d{2}$/);
  ids.tracking = delivery.trackingNumber;

  assert.equal((await api('POST', `/orders/${ids.order}/confirm-payment`, { token: tokens.admin })).status, 409);
  assert.equal((await api('POST', `/orders/${ids.order}/cancel`, { token: tokens.buyer })).status, 409, 'paid orders cannot be cancelled');
  const after = await api('GET', `/orders/${ids.order}`, { token: tokens.buyer });
  assert.equal(after.body.bankAccount, undefined);
});

test('order validation', async () => {
  const plain = await api('POST', '/orders', {
    token: tokens.other,
    body: { productId: ids.table, includeDelivery: false, includeAssembly: false },
  });
  assert.equal(plain.status, 201);
  assert.equal(plain.body.order.totalAmount, 180000);
  assert.equal(plain.body.order.deliveryAddress, undefined);

  const order = (token, body) => api('POST', '/orders', { token, body });
  assert.equal((await order(undefined, { productId: ids.lamp })).status, 401);
  assert.equal((await order(tokens.seller, { productId: ids.lamp })).status, 400, 'cannot buy own item');
  assert.equal((await order(tokens.buyer, { productId: ids.lamp, pointsUsed: 999999 })).status, 400, 'not enough points');
  assert.equal((await order(tokens.buyer, { productId: ids.lamp, pointsUsed: -1 })).status, 400);
  assert.equal((await order(tokens.buyer, { productId: ids.lamp, paymentMethod: 'bitcoin' })).status, 400);
  assert.equal((await order(tokens.buyer, { productId: ids.lamp, paymentMethod: 'card' })).status, 400, 'bank transfer only');
  assert.equal((await order(tokens.buyer, { productId: 'not-an-id' })).status, 404);
});

test('two buyers racing for the same item: only one wins', async () => {
  const results = await Promise.all([
    api('POST', '/orders', { token: tokens.buyer, body: { productId: ids.race } }),
    api('POST', '/orders', { token: tokens.other, body: { productId: ids.race } }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 404]);
});

test('get order (buyer, seller, mover only)', async () => {
  for (const who of ['buyer', 'seller', 'mover']) {
    const r = await api('GET', `/orders/${ids.order}`, { token: tokens[who] });
    assert.equal(r.status, 200, who);
    assert.match(r.body.order.product.title, /Хөргөгч/);
    assert.equal(r.body.order.seller.name, 'Тест seller');
    assert.equal(r.body.delivery.trackingNumber, ids.tracking);
  }
  assert.equal((await api('GET', `/orders/${ids.order}`, { token: tokens.other })).status, 404);
  assert.equal((await api('GET', `/orders/${ids.order}`)).status, 401);
  assert.equal((await api('GET', '/orders/00000000-0000-0000-0000-000000000000', { token: tokens.buyer })).status, 404);
});

test('delivery tracking', async () => {
  const byOrder = await api('GET', `/deliveries/order/${ids.order}`, { token: tokens.buyer });
  assert.equal(byOrder.status, 200);
  assert.equal(byOrder.body.currentStatus, 'confirmed');
  assert.equal(byOrder.body.order.product.price, 420000);
  assert.equal(byOrder.body.order.product.description, undefined);

  const byTracking = await api('GET', `/deliveries/tracking/${ids.tracking}`, { token: tokens.mover });
  assert.equal(byTracking.status, 200);
  assert.equal(byTracking.body._id, byOrder.body._id);

  assert.equal((await api('GET', `/deliveries/order/${ids.order}`, { token: tokens.other })).status, 404);
  assert.equal((await api('GET', '/deliveries/tracking/NE000KR', { token: tokens.buyer })).status, 404);
  assert.equal((await api('GET', `/deliveries/order/${ids.order}`)).status, 401);
});

test('bad JSON and unknown routes', async () => {
  assert.equal((await api('POST', '/auth/login/email', { body: '{bad' })).status, 400);
  assert.equal((await api('GET', '/nope')).status, 404);
});

test('image upload and download', async () => {
  // 1x1 PNG
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  assert.equal((await api('POST', '/images', { body: { data: png, contentType: 'image/png' } })).status, 401);

  const up = await api('POST', '/images', { token: tokens.seller, body: { data: `data:image/png;base64,${png}` } });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.match(up.body.url, /^http:\/\/127\.0\.0\.1:\d+\/api\/images\/[0-9a-f-]{36}\.png$/);

  const res = await fetch(up.body.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), Buffer.from(png, 'base64'));

  const bad = (body) => api('POST', '/images', { token: tokens.seller, body });
  assert.equal((await bad({ data: png, contentType: 'image/gif' })).status, 400);
  assert.equal((await bad({})).status, 400);
  const tooBig = Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64');
  assert.equal((await bad({ data: tooBig, contentType: 'image/jpeg' })).status, 413);
  assert.equal((await api('GET', '/images/..%2F..%2Fpackage.json')).status, 404);
  assert.equal((await api('GET', '/images/00000000-0000-0000-0000-000000000000.png')).status, 404);

  const product = await createProduct('Зурагтай', { images: [up.body.url] });
  assert.deepEqual(product.images, [up.body.url]);

  fs.rmSync(path.join(__dirname, '..', 'uploads', up.body.url.split('/').pop()), { force: true });
});

test('my listings and my orders', async () => {
  const mine = await api('GET', '/products/mine', { token: tokens.seller });
  assert.equal(mine.status, 200);
  assert.ok(mine.body.items.length >= 5);
  assert.ok(mine.body.items.every((p) => p.seller.name === 'Тест seller'));
  assert.ok(mine.body.items.some((p) => p.status === 'sold'), 'sold items are listed too');
  const dates = mine.body.items.map((p) => p.createdAt);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.equal((await api('GET', '/products/mine', { token: tokens.mover })).body.total, 0);
  assert.equal((await api('GET', '/products/mine')).status, 401);

  const buyer = await api('GET', '/orders/mine', { token: tokens.buyer });
  assert.equal(buyer.status, 200);
  assert.ok(buyer.body.purchases.length >= 1);
  assert.equal(buyer.body.sales.length, 0);
  const first = buyer.body.purchases.find((x) => x.order._id === ids.order);
  assert.match(first.order.product.title, /Хөргөгч/);
  assert.equal(first.delivery.trackingNumber, ids.tracking);

  const seller = await api('GET', '/orders/mine', { token: tokens.seller });
  assert.equal(seller.body.purchases.length, 0);
  assert.ok(seller.body.sales.length >= 3);
  assert.equal((await api('GET', '/orders/mine')).status, 401);
});

test('buyer cancels an unpaid order: item back on sale, points returned', async () => {
  const p = await createProduct('Сандал');
  await pool.query('update public.users set points = 300 where id = $1', [ids.other]);
  const r = await api('POST', '/orders', { token: tokens.other, body: { productId: p._id, pointsUsed: 300 } });
  assert.equal(r.status, 201);
  const id = r.body.order._id;
  assert.equal((await api('POST', `/orders/${id}/cancel`, { token: tokens.buyer })).status, 404, 'not your order');
  const c = await api('POST', `/orders/${id}/cancel`, { token: tokens.other });
  assert.equal(c.status, 200);
  assert.equal(c.body.order.status, 'cancelled');
  assert.equal((await api('GET', `/products/${p._id}`)).body.status, 'active');
  assert.equal((await api('GET', '/auth/me', { token: tokens.other })).body.user.points, 300);
  assert.equal((await api('POST', `/orders/${id}/cancel`, { token: tokens.other })).status, 409);
});

test('chat between buyer and seller', async () => {
  const p = await createProduct('Шүүгээ');
  assert.equal((await api('POST', '/chats', { token: tokens.seller, body: { productId: p._id } })).status, 400);
  const open = await api('POST', '/chats', { token: tokens.buyer, body: { productId: p._id } });
  assert.equal(open.status, 201, JSON.stringify(open.body));
  assert.equal(open.body.otherUser.name, 'Тест seller');
  const again = await api('POST', '/chats', { token: tokens.buyer, body: { productId: p._id } });
  assert.equal(again.body._id, open.body._id, 'same chat is reused');
  const cid = open.body._id;

  const sent = await api('POST', `/chats/${cid}/messages`, { token: tokens.buyer, body: { body: '  Сайн уу?  ' } });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.body, 'Сайн уу?');
  assert.equal((await api('POST', `/chats/${cid}/messages`, { token: tokens.buyer, body: { body: '   ' } })).status, 400);
  assert.equal((await api('POST', `/chats/${cid}/messages`, { token: tokens.buyer, body: { body: 'x'.repeat(1001) } })).status, 400);
  assert.equal((await api('GET', `/chats/${cid}/messages`, { token: tokens.other })).status, 404, 'outsiders cannot read');

  const sellerList = await api('GET', '/chats', { token: tokens.seller });
  const conv = sellerList.body.items.find((c) => c._id === cid);
  assert.equal(conv.unreadCount, 1);
  assert.equal(conv.lastMessage.body, 'Сайн уу?');
  assert.equal(conv.otherUser.name, 'Тест Худалдан авагч');

  const msgs = await api('GET', `/chats/${cid}/messages`, { token: tokens.seller });
  assert.equal(msgs.body.items.length, 1);
  assert.equal(msgs.body.items[0].sender, ids.buyer);
  assert.equal((await api('GET', '/chats', { token: tokens.seller })).body.unreadTotal, 0, 'reading clears unread');

  const reply = await api('POST', `/chats/${cid}/messages`, { token: tokens.seller, body: { body: 'Сайн байна уу' } });
  const newer = await api('GET', `/chats/${cid}/messages?after=${encodeURIComponent(sent.body.createdAt)}`, { token: tokens.buyer });
  assert.deepEqual(newer.body.items.map((m) => m._id), [reply.body._id]);
  ids.chat = cid;
  ids.chatMessage = reply.body._id;
  ids.chatProduct = p._id;
});

test('report and block', async () => {
  assert.equal((await api('POST', '/reports', { token: tokens.buyer, body: { targetType: 'message', targetId: ids.chatMessage, reason: 'spam' } })).status, 201);
  assert.equal((await api('POST', '/reports', { token: tokens.buyer, body: { targetType: 'product', targetId: ids.chatProduct } })).status, 201);
  assert.equal((await api('POST', '/reports', { token: tokens.buyer, body: { targetType: 'nope', targetId: ids.chatProduct } })).status, 400);

  assert.equal((await api('POST', '/blocks', { token: tokens.buyer, body: { userId: ids.buyer } })).status, 400);
  assert.equal((await api('POST', '/blocks', { token: tokens.buyer, body: { userId: ids.seller } })).status, 201);
  const blocks = await api('GET', '/blocks', { token: tokens.buyer });
  assert.deepEqual(blocks.body.items.map((b) => b.id), [ids.seller]);

  assert.ok(!(await api('GET', '/chats', { token: tokens.buyer })).body.items.some((c) => c._id === ids.chat), 'blocked chat hidden');
  assert.equal((await api('POST', `/chats/${ids.chat}/messages`, { token: tokens.seller, body: { body: 'hi' } })).status, 403);
  const list = await api('GET', `/products?search=${TAG}`, { token: tokens.buyer });
  assert.equal(list.body.total, 0, 'blocked seller products hidden');

  assert.equal((await api('DELETE', `/blocks/${ids.seller}`, { token: tokens.buyer })).status, 200);
  assert.ok((await api('GET', `/products?search=${TAG}`, { token: tokens.buyer })).body.total > 0);
  assert.equal((await api('POST', `/chats/${ids.chat}/messages`, { token: tokens.seller, body: { body: 'hi' } })).status, 201);
});

test('profile edit and password change', async () => {
  const r = await api('PATCH', '/auth/me', { token: tokens.other, body: { name: ' Шинэ нэр ', location: 'Бусан' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'Шинэ нэр');
  assert.equal(r.body.user.location, 'Бусан');
  assert.equal((await api('PATCH', '/auth/me', { token: tokens.other, body: { name: '' } })).status, 400);
  assert.equal((await api('PATCH', '/auth/me', { token: tokens.other, body: { language: 'xx' } })).status, 400);

  assert.equal((await api('POST', '/auth/password', { token: tokens.other, body: { currentPassword: 'wrong', newPassword: 'newpass1' } })).status, 400);
  assert.equal((await api('POST', '/auth/password', { token: tokens.other, body: { currentPassword: PASSWORD, newPassword: '123' } })).status, 400);
  assert.equal((await api('POST', '/auth/password', { token: tokens.other, body: { currentPassword: PASSWORD, newPassword: 'newpass1' } })).status, 200);
  assert.equal((await api('POST', '/auth/login/email', { body: { email: email('other'), password: 'newpass1' } })).status, 200);
  assert.equal((await api('POST', '/auth/login/email', { body: { email: email('other'), password: PASSWORD } })).status, 401);
});

test('delete account', async () => {
  const reg = await api('POST', '/auth/register', { body: { name: 'Gone', email: email('gone'), password: PASSWORD } });
  assert.equal(reg.status, 201);
  const token = reg.body.token;
  ids.gone = reg.body.user.id;
  const r0 = await api('POST', '/products', {
    token,
    body: { title: `Устах ${TAG}`, category: 'furniture', price: 1000, location: 'Сөүл' },
  });
  const forSale = await createProduct('Захиалах');
  await api('POST', '/orders', { token, body: { productId: forSale._id } });

  assert.equal((await api('DELETE', '/auth/me', { token, body: { password: 'wrong' } })).status, 400);
  assert.equal((await api('DELETE', '/auth/me', { token, body: { password: PASSWORD } })).status, 200);

  assert.equal((await api('GET', '/auth/me', { token })).status, 401, 'token stops working');
  assert.equal((await api('POST', '/auth/login/email', { body: { email: email('gone'), password: PASSWORD } })).status, 401);
  assert.equal((await api('GET', `/products/${r0.body._id}`)).status, 404, 'listings hidden from the public');
  assert.equal((await api('GET', `/products/${forSale._id}`)).body.status, 'active', 'unpaid purchase released');
  const row = await pool.query('select name, email, phone, password from public.users where id = $1', [ids.gone]);
  assert.deepEqual(row.rows[0], { name: 'Устгагдсан хэрэглэгч', email: null, phone: null, password: null });
  // Same email can register again.
  assert.equal((await api('POST', '/auth/register', { body: { name: 'Back', email: email('gone'), password: PASSWORD } })).status, 201);
});

test('delivery driver workflow', async () => {
  assert.equal((await api('GET', '/deliveries/jobs', { token: tokens.buyer })).status, 403);
  const avail = await api('GET', '/deliveries/jobs?scope=available', { token: tokens.mover });
  assert.equal(avail.status, 200);
  const job = avail.body.items.find((j) => j.order._id === ids.order);
  assert.ok(job, 'paid order waits for a driver');
  assert.equal(job.order.buyer.name, 'Тест Худалдан авагч');
  assert.equal(job.order.product.title.startsWith('Хөргөгч'), true);

  assert.equal((await api('POST', `/deliveries/${job._id}/accept`, { token: tokens.buyer })).status, 403);
  assert.equal((await api('POST', `/deliveries/${job._id}/status`, { token: tokens.mover, body: { status: 'picked_up' } })).status, 403, 'must accept first');
  const acc = await api('POST', `/deliveries/${job._id}/accept`, { token: tokens.mover });
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  assert.equal(acc.body.driver.name, 'Test Mover');
  assert.equal((await api('POST', `/deliveries/${job._id}/accept`, { token: tokens.admin })).status, 409, 'already taken');

  const step = (status, extra = {}) =>
    api('POST', `/deliveries/${job._id}/status`, { token: tokens.mover, body: { status, ...extra } });
  assert.equal((await step('delivered')).status, 409, 'no skipping steps');
  assert.equal((await step('nope')).status, 400);
  assert.equal((await step('picked_up')).status, 200);
  assert.equal((await step('picked_up')).status, 409, 'not twice');
  const shipped = await step('in_transit', { carrier: 'CJ Logistics', carrierTracking: 'CJ123456' });
  assert.equal(shipped.status, 200);
  assert.equal(shipped.body.carrier, 'CJ Logistics');
  assert.equal(shipped.body.carrierTracking, 'CJ123456');
  const mine = await api('GET', '/deliveries/jobs?scope=mine', { token: tokens.mover });
  assert.ok(mine.body.items.some((j) => j._id === job._id));
  const done = await step('delivered');
  assert.equal(done.status, 200);
  assert.equal(done.body.currentStatus, 'delivered');
  assert.deepEqual(done.body.timeline.map((t) => t.completed), [true, true, true, true]);
  assert.ok(done.body.timeline.every((t) => t.timestamp));

  const order = await api('GET', `/orders/${ids.order}`, { token: tokens.buyer });
  assert.equal(order.body.order.status, 'delivered');
  assert.equal(order.body.delivery.carrierTracking, 'CJ123456');
  assert.equal(order.body.canReview, true);
  const history = await api('GET', '/deliveries/jobs?scope=done', { token: tokens.mover });
  assert.ok(history.body.items.some((j) => j._id === job._id));
});

test('notifications and push tokens', async () => {
  const list = await api('GET', '/notifications', { token: tokens.buyer });
  assert.equal(list.status, 200);
  const titles = list.body.items.map((n) => n.title);
  for (const t of ['Төлбөр баталгаажлаа', 'Жолооч томилогдлоо', 'Бараа илгээгдлээ', 'Бараа хүргэгдлээ']) {
    assert.ok(titles.includes(t), t);
  }
  assert.ok(list.body.unread >= 4);
  assert.match(list.body.items[0].data.url, /^\//);
  const sellerList = await api('GET', '/notifications', { token: tokens.seller });
  assert.ok(sellerList.body.items.some((n) => n.title === 'Таны бараа захиалагдлаа'));
  const moverList = await api('GET', '/notifications', { token: tokens.mover });
  assert.ok(moverList.body.items.some((n) => n.title === 'Шинэ хүргэлтийн ажил'));

  assert.equal((await api('POST', '/notifications/read', { token: tokens.buyer, body: {} })).status, 200);
  assert.equal((await api('GET', '/notifications', { token: tokens.buyer })).body.unread, 0);

  assert.equal((await api('POST', '/notifications/push-token', { token: tokens.buyer, body: { token: 'junk' } })).status, 400);
  const tok = `ExponentPushToken[${TAG}xxxxxxxxxx]`;
  assert.equal((await api('POST', '/notifications/push-token', { token: tokens.buyer, body: { token: tok, platform: 'ios' } })).status, 200);
  assert.equal((await api('POST', '/notifications/push-token', { token: tokens.buyer, body: { token: tok, platform: 'ios' } })).status, 200, 'idempotent');
  const saved = await pool.query('select user_id from public.push_tokens where token = $1', [tok]);
  assert.equal(saved.rows[0].user_id, ids.buyer);
  assert.equal((await api('DELETE', '/notifications/push-token', { token: tokens.buyer, body: { token: tok } })).status, 200);
  assert.equal((await pool.query('select 1 from public.push_tokens where token = $1', [tok])).rowCount, 0);
});

test('reviews and seller profile', async () => {
  const review = (token, body) => api('POST', '/reviews', { token, body });
  assert.equal((await review(tokens.other, { orderId: ids.order, rating: 5 })).status, 404, 'only the buyer');
  assert.equal((await review(tokens.buyer, { orderId: ids.order, rating: 7 })).status, 400);
  const r = await review(tokens.buyer, { orderId: ids.order, rating: 5, comment: 'Маш сайн!' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal((await review(tokens.buyer, { orderId: ids.order, rating: 4 })).status, 409, 'once per order');

  const order = await api('GET', `/orders/${ids.order}`, { token: tokens.buyer });
  assert.equal(order.body.review.rating, 5);
  assert.equal(order.body.canReview, false);

  // An unpaid order can't be reviewed yet.
  const p = await createProduct('Үнэлгээгүй');
  const o = await api('POST', '/orders', { token: tokens.buyer, body: { productId: p._id } });
  assert.equal((await review(tokens.buyer, { orderId: o.body.order._id, rating: 5 })).status, 409);
  await api('POST', `/orders/${o.body.order._id}/cancel`, { token: tokens.buyer });

  const profile = await api('GET', `/users/${ids.seller}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.name, 'Тест seller');
  assert.ok(profile.body.user.createdAt);
  assert.equal(profile.body.user.email, undefined, 'no private data');
  assert.equal(profile.body.stats.reviewCount, 1);
  assert.equal(profile.body.stats.rating, 5);
  assert.equal(profile.body.reviews[0].comment, 'Маш сайн!');
  assert.equal(profile.body.reviews[0].reviewer.name, 'Тест Худалдан авагч');
  assert.ok(profile.body.products.every((x) => x.status === 'active'));
  assert.equal((await api('GET', '/users/00000000-0000-0000-0000-000000000000')).status, 404);
  const sellerNotes = await api('GET', '/notifications', { token: tokens.seller });
  assert.ok(sellerNotes.body.items.some((n) => n.type === 'review'));
});

test('edit, mark sold and delete a listing', async () => {
  const p = await createProduct('Засах');
  const patch = (token, body) => api('PATCH', `/products/${p._id}`, { token, body });
  assert.equal((await patch(tokens.other, { price: 1 })).status, 404, 'not mine');
  const r = await patch(tokens.seller, { title: `Засагдсан ${TAG}`, price: 0, condition: 'good', category: 'electronics' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.price, 0);
  assert.equal(r.body.isFree, true);
  assert.equal(r.body.category.key, 'electronics');
  assert.equal((await patch(tokens.seller, { price: -5 })).status, 400);
  assert.equal((await patch(tokens.seller, { status: 'hidden' })).status, 400);
  assert.equal((await patch(tokens.seller, {})).status, 400);

  assert.equal((await patch(tokens.seller, { status: 'sold' })).body.status, 'sold');
  assert.equal((await api('GET', `/products?search=Засагдсан ${TAG}`)).body.total, 0, 'sold leaves the list');
  assert.equal((await patch(tokens.seller, { status: 'active' })).body.status, 'active');

  // With an open order the seller can't flip the status or delete it.
  const o = await api('POST', '/orders', { token: tokens.buyer, body: { productId: p._id } });
  assert.equal(o.status, 201);
  assert.equal((await patch(tokens.seller, { status: 'active' })).status, 409);
  assert.equal((await api('DELETE', `/products/${p._id}`, { token: tokens.seller })).status, 409);
  const mine = (await api('GET', '/products/mine', { token: tokens.seller })).body.items.find((x) => x._id === p._id);
  assert.equal(mine.ordered, true);
  assert.equal(mine.openOrder, true);
  await api('POST', `/orders/${o.body.order._id}/cancel`, { token: tokens.buyer });

  // Ordered once (cancelled) -> hidden instead of deleted.
  assert.equal((await api('DELETE', `/products/${p._id}`, { token: tokens.seller })).status, 200);
  assert.equal((await api('GET', `/products/${p._id}`)).status, 404);
  assert.equal((await api('GET', `/products/${p._id}`, { token: tokens.seller })).body.status, 'hidden', 'seller still sees it');

  // Never ordered -> really deleted.
  const q = await createProduct('Устгах');
  assert.equal((await api('DELETE', `/products/${q._id}`, { token: tokens.seller })).status, 200);
  assert.equal((await pool.query('select 1 from public.products where id = $1', [q._id])).rowCount, 0);
});

test('photos in chat and read receipts', async () => {
  const p = await createProduct('Зурагтай чат');
  const conv = await api('POST', '/chats', { token: tokens.other, body: { productId: p._id } });
  assert.equal(conv.status, 201);
  const cid = conv.body._id;
  const img = `${base}/images/${crypto.randomUUID()}.jpg`;
  const sent = await api('POST', `/chats/${cid}/messages`, { token: tokens.other, body: { image: img } });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.image, img);
  assert.equal(sent.body.body, '');
  assert.equal((await api('POST', `/chats/${cid}/messages`, { token: tokens.other, body: { image: 'https://evil.example/x.jpg' } })).status, 400);
  assert.equal((await api('POST', `/chats/${cid}/messages`, { token: tokens.other, body: {} })).status, 400);

  await api('GET', `/chats/${cid}/messages`, { token: tokens.seller });
  const view = await api('GET', `/chats/${cid}`, { token: tokens.other });
  assert.ok(new Date(view.body.otherReadAt) >= new Date(sent.body.createdAt), 'seller has read it');
  const list = await api('GET', '/chats', { token: tokens.seller });
  assert.equal(list.body.items.find((c) => c._id === cid).lastMessage.image, img);
});

test('admin: reports, listings, users', async () => {
  assert.equal((await api('GET', '/admin/stats', { token: tokens.buyer })).status, 403);
  const stats = await api('GET', '/admin/stats', { token: tokens.admin });
  assert.equal(stats.status, 200);
  assert.equal(typeof stats.body.openReports, 'number');

  const p = await createProduct('Мэдээлэгдсэн');
  assert.equal((await api('POST', '/reports', { token: tokens.other, body: { targetType: 'product', targetId: p._id, reason: 'хуурамч' } })).status, 201);
  const open = await api('GET', '/admin/reports?status=open', { token: tokens.admin });
  const report = open.body.items.find((x) => x.targetId === p._id);
  assert.ok(report);
  assert.equal(report.product.title, p.title);
  assert.equal((await api('POST', `/admin/reports/${report._id}/resolve`, { token: tokens.admin, body: { action: 'nope' } })).status, 400);
  assert.equal((await api('POST', `/admin/reports/${report._id}/resolve`, { token: tokens.admin, body: { action: 'hide_product' } })).status, 200);
  assert.equal((await api('GET', `/products/${p._id}`)).status, 404, 'hidden');
  const resolved = await api('GET', '/admin/reports?status=resolved', { token: tokens.admin });
  assert.equal(resolved.body.items.find((x) => x._id === report._id).action, 'hide_product');

  const found = await api('GET', `/admin/products?search=Мэдээлэгдсэн ${TAG}&status=hidden`, { token: tokens.admin });
  assert.equal(found.body.items.length, 1);
  const shown = await api('POST', `/admin/products/${p._id}/visibility`, { token: tokens.admin, body: { hidden: false } });
  assert.equal(shown.body.status, 'active');

  const users = await api('GET', `/admin/users?search=${encodeURIComponent(email('other'))}`, { token: tokens.admin });
  assert.equal(users.body.items.length, 1);
  assert.equal(users.body.items[0]._id, ids.other);
  const patchUser = (body) => api('PATCH', `/admin/users/${ids.other}`, { token: tokens.admin, body });
  assert.equal((await patchUser({ role: 'king' })).status, 400);
  assert.equal((await patchUser({ role: 'mover' })).body.role, 'mover');
  assert.equal((await patchUser({ role: 'buyer', isVerified: true })).body.isVerified, true);
  assert.equal((await patchUser({ suspended: true })).body.suspended, true);
  assert.equal((await api('GET', '/auth/me', { token: tokens.other })).status, 403, 'suspended users are locked out');
  assert.equal((await api('POST', '/auth/login/email', { body: { email: email('other'), password: 'newpass1' } })).status, 403);
  assert.equal((await patchUser({ suspended: false })).body.suspended, false);
  assert.equal((await api('GET', '/auth/me', { token: tokens.other })).status, 200);
  assert.equal((await api('PATCH', `/admin/users/${ids.admin}`, { token: tokens.admin, body: { role: 'buyer' } })).status, 400, 'not yourself');
});
