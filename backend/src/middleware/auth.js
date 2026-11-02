const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');

async function findUser(userId) {
  if (!serialize.isUuid(userId)) return null;
  const { rows } = await query('select * from public.users where id = $1', [userId]);
  return serialize.user(rows[0]);
}

function readToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.split(' ')[1];
}

async function auth(req, res, next) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Нэвтрэх шаардлагатай' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Буруу эсвэл хугацаа дууссан токен' });
  }

  try {
    const user = await findUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'Хэрэглэгч олдсонгүй' });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

async function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = (await findUser(decoded.userId)) || undefined;
  } catch {
    // Invalid token on a public route: continue as a guest.
  }
  next();
}

module.exports = { auth, optionalAuth };
