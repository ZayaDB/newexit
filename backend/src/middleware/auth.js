const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Нэвтрэх шаардлагатай' });
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'Хэрэглэгч олдсонгүй' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Буруу эсвэл хугацаа дууссан токен' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next();
  }

  const token = header.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (!err && decoded?.userId) {
      req.user = await User.findById(decoded.userId).select('-password');
    }
    next();
  });
}

module.exports = { auth, optionalAuth };
