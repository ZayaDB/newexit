const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    trackingNumber: { type: String, required: true, unique: true },
    route: { type: String, default: 'Солонгос -> Монгол' },
    origin: { type: String, default: 'Сөүл, Солонгос' },
    destination: { type: String, default: 'Улаанбаатар, Монгол' },
    company: { type: String, default: 'NEW EXIT Delivery' },
    departureDate: Date,
    estimatedArrival: String,
    currentStatus: {
      type: String,
      enum: ['confirmed', 'preparing', 'out_for_delivery', 'delivered'],
      default: 'confirmed',
    },
    timeline: [
      {
        status: String,
        labelMn: String,
        timestamp: Date,
        completed: { type: Boolean, default: false },
      },
    ],
    driver: {
      name: String,
      phone: String,
      rating: Number,
      avatar: String,
      role: String,
      isOnline: { type: Boolean, default: true },
    },
    eta: String,
    liveTrackingEnabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Delivery', deliverySchema);
