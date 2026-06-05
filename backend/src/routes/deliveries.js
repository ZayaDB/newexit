const express = require('express');
const Delivery = require('../models/Delivery');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/tracking/:trackingNumber', auth, async (req, res) => {
  try {
    const delivery = await Delivery.findOne({
      trackingNumber: req.params.trackingNumber,
    }).populate({
      path: 'order',
      populate: { path: 'product', select: 'title images price' },
    });

    if (!delivery) {
      return res.status(404).json({ message: 'Хүргэлт олдсонгүй' });
    }

    res.json(delivery);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/order/:orderId', auth, async (req, res) => {
  try {
    const delivery = await Delivery.findOne({ order: req.params.orderId }).populate({
      path: 'order',
      populate: { path: 'product', select: 'title images price' },
    });

    if (!delivery) {
      return res.status(404).json({ message: 'Хүргэлт олдсонгүй' });
    }

    res.json(delivery);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
