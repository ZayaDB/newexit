const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function formatUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isVerified: user.isVerified,
    avatar: user.avatar,
    location: user.location,
    points: user.points,
    badge: user.badge,
    language: user.language,
  };
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || (!email && !phone) || !password) {
      return res.status(400).json({ message: 'Бүх заавал талбарыг бөглөнө үү' });
    }

    const exists = await User.findOne({
      $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    });
    if (exists) {
      return res.status(409).json({ message: 'Бүртгэлтэй хэрэглэгч байна' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      phone,
      password: hashed,
      isVerified: true,
    });

    const token = signToken(user._id);
    res.status(201).json({ token, user: formatUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/login/email', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Имэйл эсвэл нууц үг буруу' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Имэйл эсвэл нууц үг буруу' });
    }

    const token = signToken(user._id);
    res.json({ token, user: formatUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/login/phone', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Утас эсвэл нууц үг буруу' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: 'Утас эсвэл нууц үг буруу' });
    }

    const token = signToken(user._id);
    res.json({ token, user: formatUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/me', auth, async (req, res) => {
  res.json({ user: formatUser(req.user) });
});

module.exports = router;
