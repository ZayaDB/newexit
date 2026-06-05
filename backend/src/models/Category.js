const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    nameMn: { type: String, required: true },
    nameEn: String,
    icon: String,
    color: String,
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
