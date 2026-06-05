const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    title: { type: String, required: true, maxlength: 100 },
    shortDescription: { type: String, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'KRW' },
    quantity: { type: Number, default: 1, min: 1 },
    images: [{ type: String }],
    location: { type: String, required: true },
    condition: {
      type: String,
      enum: ['new', 'used', 'good', 'fair'],
      default: 'used',
    },
    badges: [{ type: String }],
    dimensions: {
      width: Number,
      height: Number,
      depth: Number,
      unit: { type: String, default: 'cm' },
    },
    deliveryOption: {
      type: String,
      enum: ['pickup', 'delivery', 'both'],
      default: 'delivery',
    },
    hasWarranty: { type: Boolean, default: false },
    isReturnable: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isFree: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
    favoriteCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'active', 'sold', 'hidden'],
      default: 'active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
