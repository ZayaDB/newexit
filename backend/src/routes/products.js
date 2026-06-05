const express = require('express');
const Product = require('../models/Product');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

function buildFilter(query) {
  const filter = { status: 'active' };
  if (query.category) filter.category = query.category;
  if (query.featured === 'true') filter.isFeatured = true;
  if (query.free === 'true') filter.isFree = true;
  if (query.search) {
    filter.$or = [
      { title: { $regex: query.search, $options: 'i' } },
      { shortDescription: { $regex: query.search, $options: 'i' } },
      { location: { $regex: query.search, $options: 'i' } },
    ];
  }
  return filter;
}

function buildSort(sort) {
  switch (sort) {
    case 'price_asc':
      return { price: 1 };
    case 'price_desc':
      return { price: -1 };
    case 'popular':
      return { viewCount: -1 };
    default:
      return { createdAt: -1 };
  }
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const filter = buildFilter(req.query);
    const sort = buildSort(req.query.sort);

    const [items, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'key nameMn icon color')
        .populate('seller', 'name isVerified avatar')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(filter),
    ]);

    res.json({ items, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $inc: { viewCount: 1 } },
      { new: true }
    )
      .populate('category', 'key nameMn icon color')
      .populate('seller', 'name isVerified avatar location');

    if (!product) {
      return res.status(404).json({ message: 'Бараа олдсонгүй' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const product = await Product.create({
      ...req.body,
      seller: req.user._id,
      status: req.body.status || 'active',
      isFree: req.body.price === 0,
    });

    const populated = await Product.findById(product._id)
      .populate('category', 'key nameMn icon color')
      .populate('seller', 'name isVerified avatar');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
