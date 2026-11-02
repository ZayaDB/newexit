const path = require('path');
const express = require('express');
const cors = require('cors');
const { query } = require('./config/db');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const { router: orderRoutes } = require('./routes/orders');
const deliveryRoutes = require('./routes/deliveries');
const imageRoutes = require('./routes/images');

const app = express();

// Behind Netlify's proxy: trust X-Forwarded-Proto so image URLs use https.
app.set('trust proxy', true);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', async (_req, res) => {
  try {
    await query('select 1');
    res.json({ status: 'ok', service: 'NEW EXIT API', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', service: 'NEW EXIT API', database: 'unreachable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/images', imageRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'Олдсонгүй' });
});

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Буруу JSON' });
  }
  console.error(err);
  res.status(500).json({ message: 'Серверийн алдаа' });
});

module.exports = app;
