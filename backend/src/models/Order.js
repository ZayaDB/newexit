const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    itemPrice: { type: Number, required: true },
    deliveryFee: { type: Number, default: 30000 },
    assemblyFee: { type: Number, default: 20000 },
    pointsUsed: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: 'KRW' },
    paymentMethod: {
      type: String,
      enum: ['card', 'zpay', 'points', 'bank'],
      default: 'card',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded', 'failed'],
      default: 'pending',
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'shipping', 'delivered', 'cancelled'],
      default: 'pending',
    },
    deliveryAddress: String,
    includeAssembly: { type: Boolean, default: true },
    includeDelivery: { type: Boolean, default: true },
    statusHistory: [
      {
        status: String,
        label: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
