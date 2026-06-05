const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, sparse: true, unique: true },
    phone: { type: String, sparse: true, unique: true },
    password: { type: String },
    role: {
      type: String,
      enum: ['buyer', 'seller', 'mover', 'admin'],
      default: 'buyer',
    },
    isVerified: { type: Boolean, default: false },
    avatar: String,
    location: { type: String, default: 'Сөүл, Солонгос' },
    points: { type: Number, default: 4580 },
    badge: String,
    language: { type: String, enum: ['mn', 'kr', 'en'], default: 'mn' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
