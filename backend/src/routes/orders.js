const express = require('express');
const Order = require('../models/Order');
const Delivery = require('../models/Delivery');
const Product = require('../models/Product');
const { auth } = require('../middleware/auth');

const router = express.Router();

function generateOrderNumber() {
  return `NE${Date.now().toString().slice(-6)}`;
}

function generateTrackingNumber() {
  return `NE${Math.floor(Math.random() * 1e9)}KR`;
}

router.post('/', auth, async (req, res) => {
  try {
    const {
      productId,
      paymentMethod = 'card',
      includeDelivery = true,
      includeAssembly = true,
      pointsUsed = 0,
      deliveryAddress,
    } = req.body;

    const product = await Product.findById(productId).populate('seller');
    if (!product || product.status !== 'active') {
      return res.status(404).json({ message: 'Бараа олдсонгүй' });
    }

    const itemPrice = product.price;
    const deliveryFee = includeDelivery ? 30000 : 0;
    const assemblyFee = includeAssembly ? 20000 : 0;
    const totalAmount = Math.max(0, itemPrice + deliveryFee + assemblyFee - pointsUsed);

    const now = new Date();
    const order = await Order.create({
      orderNumber: generateOrderNumber(),
      buyer: req.user._id,
      seller: product.seller._id,
      product: product._id,
      itemPrice,
      deliveryFee,
      assemblyFee,
      pointsUsed,
      totalAmount,
      paymentMethod,
      paymentStatus: 'paid',
      status: 'confirmed',
      deliveryAddress: deliveryAddress || 'Улаанбаатар, Монгол',
      includeAssembly,
      includeDelivery,
      statusHistory: [
        { status: 'confirmed', label: 'Захиалга батлагдсан', timestamp: now },
        {
          status: 'preparing',
          label: 'Бэлтгэгдэж байна',
          timestamp: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
        {
          status: 'shipping',
          label: 'Хүргэлтэнд гарсан',
          timestamp: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        },
      ],
    });

    const delivery = await Delivery.create({
      order: order._id,
      trackingNumber: generateTrackingNumber(),
      departureDate: now,
      estimatedArrival: '2024.05.24 ~ 05.27',
      currentStatus: 'out_for_delivery',
      timeline: [
        {
          status: 'confirmed',
          labelMn: 'Захиалга батлагдсан',
          timestamp: now,
          completed: true,
        },
        {
          status: 'preparing',
          labelMn: 'Бэлтгэгдэж байна',
          timestamp: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          completed: true,
        },
        {
          status: 'out_for_delivery',
          labelMn: 'Хүргэлтэнд гарсан',
          timestamp: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          completed: true,
        },
        {
          status: 'delivered',
          labelMn: 'Хүргэгдсэн',
          timestamp: null,
          completed: false,
        },
      ],
      driver: {
        name: 'Мөнх-Эрдэнэ',
        phone: '+82 10-1234-5678',
        rating: 4.9,
        role: 'Хүргэлтийн жолооч',
        isOnline: true,
      },
      eta: '2-4 өдөр',
    });

    await Product.findByIdAndUpdate(productId, { status: 'sold' });

    const populated = await Order.findById(order._id)
      .populate('product')
      .populate('buyer', 'name email phone')
      .populate('seller', 'name');

    res.status(201).json({ order: populated, delivery });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('product')
      .populate('buyer', 'name')
      .populate('seller', 'name');

    if (!order) {
      return res.status(404).json({ message: 'Захиалга олдсонгүй' });
    }

    const delivery = await Delivery.findOne({ order: order._id });
    res.json({ order, delivery });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
