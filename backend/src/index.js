require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/db');

const PORT = process.env.PORT || 3001;

async function start() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set (see backend/.env.example)');
  }
  await connectDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEW EXIT API running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
