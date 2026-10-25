// End-to-end test of every API endpoint against a real Postgres database.
// WARNING: resets the database to demo data. Run against a dev/local DB:
//   npm test
require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const { pool } = require('../src/config/db');

let server;
let base;
const tokens = {};
const state = {};

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

before(async () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'seed.sql'), 'utf8');
  await pool.query(seed);
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server.close();
  await pool.end();
});

test('health', async () => {
  const r = await api('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.database, 'ok');
});

test('login with email (all demo accounts)', async () => {
  for (const role of ['buyer', 'seller', 'mover']) {
    const r = await api('POST', '/auth/login/email', {
      body: { email: `${role}@newexit.mn`, password: 'demo1234' },
    });
    assert.equal(r.status, 200, `${role} login`);
    assert.ok(r.body.token);
    assert.equal(r.body.user.role, role);
    assert.equal(r.body.user.password, undefined);
    tokens[role] = r.body.token;
    state[`${role}Id`] = r.body.user.id;
  }
  assert.equal((await api('POST', '/auth/login/email', {
    body: { email: 'buyer@newexit.mn', password: 'wrong' },
  })).status, 401);
  assert.equal((await api('POST', '/auth/login/email', { body: {} })).status, 401);
});

test('login with phone', async () => {
  const r = await api('POST', '/auth/login/phone', {
    body: { phone: '+97699112233', password: 'demo1234' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, 'buyer@newexit.mn');
  assert.equal((await api('POST', '/auth/login/phone', {
    body: { phone: '+97699112233', password: 'nope' },
  })).status, 401);
});

test('register', async () => {
  const r = await api('POST', '/auth/register', {
    body: { name: 'Тест', email: 'New@Test.mn', password: 'pass1234' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, 'new@test.mn');
  assert.equal(r.body.user.points, 4580);
  tokens.newUser = r.body.token;

  assert.equal((await api('POST', '/auth/register', {
    body: { name: 'Тест', email: 'new@test.mn', password: 'x' },
  })).status, 409);
  assert.equal((await api('POST', '/auth/register', {
    body: { name: 'Тест', phone: '+97699112233', password: 'x' },
  })).status, 409);
  assert.equal((await api('POST', '/auth/register', { body: { name: 'x' } })).status, 400);

  const login = await api('POST', '/auth/login/email', {
    body: { email: 'new@test.mn', password: 'pass1234' },
  });
  assert.equal(login.status, 200);
});

test('me', async () => {
  const r = await api('GET', '/auth/me', { token: tokens.buyer });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'Баярцогт');
  assert.equal((await api('GET', '/auth/me')).status, 401);
  assert.equal((await api('GET', '/auth/me', { token: 'garbage' })).status, 401);
});

test('categories', async () => {
  const r = await api('GET', '/categories');
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 6);
  assert.equal(r.body[0].key, 'all');
  assert.ok(r.body[0]._id);
  assert.equal(r.body[1].nameMn, 'Тавилга');
  state.furnitureId = r.body.find((c) => c.key === 'furniture')._id;
});

test('product list, filters, sort, paging', async () => {
  const all = await api('GET', '/products');
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 6);
  assert.equal(all.body.items.length, 6);
  const first = all.body.items[0];
  assert.equal(first.title, 'Софа (3 хүний суудал)');
  assert.equal(first.category.nameMn, 'Тавилга');
  assert.equal(first.seller.name, 'Happy Store');
  assert.equal(first.seller.email, undefined);
  assert.deepEqual(first.dimensions, { width: 220, height: 90, depth: 85, unit: 'cm' });
  state.productId = all.body.items.find((p) => p.title === 'Хөргөгч')._id;
  state.otherProductId = all.body.items.find((p) => p.title === 'Хоолны ширээ')._id;

  assert.equal((await api('GET', `/products?category=${state.furnitureId}`)).body.total, 3);
  assert.equal((await api('GET', '/products?category=electronics')).body.total, 3);
  assert.equal((await api('GET', '/products?category=all')).body.total, 6);
  assert.equal((await api('GET', '/products?free=true')).body.total, 1);
  assert.equal((await api('GET', '/products?featured=true')).body.total, 6);
  assert.equal((await api('GET', '/products?search=хөргөгч')).body.total, 1);
  assert.equal((await api('GET', '/products?search=Мапо')).body.total, 1);
  assert.equal((await api('GET', '/products?search=%25')).body.total, 0);

  const asc = (await api('GET', '/products?sort=price_asc')).body.items.map((p) => p.price);
  assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
  const desc = (await api('GET', '/products?sort=price_desc')).body.items.map((p) => p.price);
  assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
  const pop = (await api('GET', '/products?sort=popular')).body.items.map((p) => p.viewCount);
  assert.deepEqual(pop, [...pop].sort((a, b) => b - a));

  const page2 = await api('GET', '/products?limit=4&page=2');
  assert.equal(page2.body.items.length, 2);
  assert.equal(page2.body.page, 2);
  assert.equal(page2.body.total, 6);
});

test('product detail increments views', async () => {
  const a = await api('GET', `/products/${state.productId}`);
  assert.equal(a.status, 200);
  assert.equal(a.body.seller.location, 'Сөүл, Каннам');
  const b = await api('GET', `/products/${state.productId}`);
  assert.equal(b.body.viewCount, a.body.viewCount + 1);
  assert.equal((await api('GET', '/products/00000000-0000-0000-0000-000000000000')).status, 404);
  assert.equal((await api('GET', '/products/665f1c2e8b3f4a0012345678')).status, 404);
});

test('create product', async () => {
  const r = await api('POST', '/products', {
    token: tokens.seller,
    body: {
      title: 'Ширээний чийдэн',
      category: state.furnitureId,
      price: 15000,
      location: 'Сөүл, Мапо',
      condition: 'good',
      images: ['https://example.com/a.jpg'],
      dimensions: { width: 20, height: 40 },
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.seller.name, 'Happy Store');
  assert.equal(r.body.category.key, 'furniture');
  assert.equal(r.body.isFree, false);
  assert.equal(r.body.status, 'active');
  assert.deepEqual(r.body.dimensions, { unit: 'cm', width: 20, height: 40 });
  state.newProductId = r.body._id;

  const free = await api('POST', '/products', {
    token: tokens.seller,
    body: { title: 'Үнэгүй ном', category: 'other', price: 0, location: 'Сөүл' },
  });
  assert.equal(free.status, 201);
  assert.equal(free.body.isFree, true);

  assert.equal((await api('GET', '/products')).body.total, 8);
  assert.equal((await api('POST', '/products', { body: { title: 'x' } })).status, 401);
  assert.equal((await api('POST', '/products', { token: tokens.seller, body: { title: 'x' } })).status, 400);
  assert.equal((await api('POST', '/products', {
    token: tokens.seller,
    body: { title: 'x', category: 'nope', price: 1, location: 'y' },
  })).status, 400);
  assert.equal((await api('POST', '/products', {
    token: tokens.seller,
    body: { title: 'x', category: 'other', price: -5, location: 'y' },
  })).status, 400);
  assert.equal((await api('POST', '/products', {
    token: tokens.seller,
    body: { title: 'x', category: 'other', price: 1, location: 'y', condition: 'broken' },
  })).status, 400);
});

test('create order (mock payment) + delivery', async () => {
  const r = await api('POST', '/orders', {
    token: tokens.buyer,
    body: { productId: state.productId, paymentMethod: 'zpay', pointsUsed: 1000 },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const { order, delivery } = r.body;
  assert.equal(order.itemPrice, 420000);
  assert.equal(order.totalAmount, 420000 + 30000 + 20000 - 1000);
  assert.equal(order.paymentStatus, 'paid');
  assert.equal(order.status, 'confirmed');
  assert.equal(order.product.title, 'Хөргөгч');
  assert.equal(order.product.status, 'sold');
  assert.equal(order.buyer.email, 'buyer@newexit.mn');
  assert.equal(order.seller.name, 'Happy Store');
  assert.equal(order.statusHistory.length, 3);
  assert.match(delivery.trackingNumber, /^NE\d+KR$/);
  assert.equal(delivery.order, order._id);
  assert.equal(delivery.timeline.length, 4);
  assert.equal(delivery.driver.name, 'Мөнх-Эрдэнэ');
  assert.match(delivery.estimatedArrival, /^\d{4}\.\d{2}\.\d{2} ~ \d{2}\.\d{2}$/);
  state.orderId = order._id;
  state.trackingNumber = delivery.trackingNumber;

  const me = await api('GET', '/auth/me', { token: tokens.buyer });
  assert.equal(me.body.user.points, 4580 - 1000);

  // sold product disappears from the list and can't be bought again
  assert.equal((await api('GET', '/products?search=Хөргөгч')).body.total, 0);
  assert.equal((await api('POST', '/orders', {
    token: tokens.newUser,
    body: { productId: state.productId },
  })).status, 404);
});

test('order validation', async () => {
  const noExtras = await api('POST', '/orders', {
    token: tokens.newUser,
    body: { productId: state.otherProductId, includeDelivery: false, includeAssembly: false },
  });
  assert.equal(noExtras.status, 201);
  assert.equal(noExtras.body.order.totalAmount, 180000);

  assert.equal((await api('POST', '/orders', { body: { productId: state.newProductId } })).status, 401);
  assert.equal((await api('POST', '/orders', {
    token: tokens.seller,
    body: { productId: state.newProductId },
  })).status, 400, 'seller cannot buy own product');
  assert.equal((await api('POST', '/orders', {
    token: tokens.buyer,
    body: { productId: state.newProductId, pointsUsed: 999999 },
  })).status, 400, 'not enough points');
  assert.equal((await api('POST', '/orders', {
    token: tokens.buyer,
    body: { productId: state.newProductId, paymentMethod: 'bitcoin' },
  })).status, 400);
  assert.equal((await api('POST', '/orders', {
    token: tokens.buyer,
    body: { productId: 'not-an-id' },
  })).status, 404);
});

test('two buyers racing for the same item: only one wins', async () => {
  const results = await Promise.all([
    api('POST', '/orders', { token: tokens.buyer, body: { productId: state.newProductId } }),
    api('POST', '/orders', { token: tokens.newUser, body: { productId: state.newProductId } }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 404]);
});

test('get order', async () => {
  for (const who of ['buyer', 'seller', 'mover']) {
    const r = await api('GET', `/orders/${state.orderId}`, { token: tokens[who] });
    assert.equal(r.status, 200, who);
    assert.equal(r.body.order.product.title, 'Хөргөгч');
    assert.equal(r.body.order.buyer.name, 'Баярцогт');
    assert.equal(r.body.order.seller.name, 'Happy Store');
    assert.equal(r.body.delivery.trackingNumber, state.trackingNumber);
  }
  assert.equal((await api('GET', `/orders/${state.orderId}`, { token: tokens.newUser })).status, 404);
  assert.equal((await api('GET', `/orders/${state.orderId}`)).status, 401);
  assert.equal((await api('GET', '/orders/00000000-0000-0000-0000-000000000000', { token: tokens.buyer })).status, 404);
});

test('delivery tracking', async () => {
  const byOrder = await api('GET', `/deliveries/order/${state.orderId}`, { token: tokens.buyer });
  assert.equal(byOrder.status, 200);
  assert.equal(byOrder.body.currentStatus, 'out_for_delivery');
  assert.equal(byOrder.body.order.product.title, 'Хөргөгч');
  assert.equal(byOrder.body.order.product.price, 420000);
  assert.equal(byOrder.body.order.product.description, undefined);

  const byTracking = await api('GET', `/deliveries/tracking/${state.trackingNumber}`, { token: tokens.mover });
  assert.equal(byTracking.status, 200);
  assert.equal(byTracking.body._id, byOrder.body._id);

  assert.equal((await api('GET', `/deliveries/order/${state.orderId}`, { token: tokens.newUser })).status, 404);
  assert.equal((await api('GET', '/deliveries/tracking/NE000KR', { token: tokens.buyer })).status, 404);
  assert.equal((await api('GET', `/deliveries/order/${state.orderId}`)).status, 401);
});

test('bad JSON and unknown routes', async () => {
  assert.equal((await api('POST', '/auth/login/email', { body: '{bad' })).status, 400);
  assert.equal((await api('GET', '/nope')).status, 404);
});
