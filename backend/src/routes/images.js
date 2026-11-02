const express = require('express');
const imageStore = require('../lib/imageStore');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Netlify Functions accept at most ~6 MB per request, and base64 adds ~33%.
const MAX_BYTES = 4 * 1024 * 1024;

// POST /api/images  { data: "<base64>", contentType: "image/jpeg" }  ->  { url }
router.post('/', auth, async (req, res) => {
  try {
    const { contentType } = req.body || {};
    let { data } = req.body || {};
    if (typeof data !== 'string' || !data) {
      return res.status(400).json({ message: 'Зураг олдсонгүй' });
    }
    // Accept a full data URI too ("data:image/jpeg;base64,....")
    const match = data.match(/^data:([^;]+);base64,(.*)$/s);
    const type = match ? match[1] : contentType;
    if (match) data = match[2];

    if (!imageStore.TYPES[type]) {
      return res.status(400).json({ message: 'Зөвхөн JPG, PNG, WEBP зураг' });
    }
    const buffer = Buffer.from(data, 'base64');
    if (!buffer.length) {
      return res.status(400).json({ message: 'Зураг олдсонгүй' });
    }
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ message: 'Зураг хэт том байна (макс. 4MB)' });
    }

    const key = await imageStore.save(buffer, type);
    res.status(201).json({ url: `${req.protocol}://${req.get('host')}/api/images/${key}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/images/:key  ->  the image (public, cached forever: keys never change)
router.get('/:key', async (req, res) => {
  try {
    const image = await imageStore.load(req.params.key);
    if (!image) return res.status(404).json({ message: 'Зураг олдсонгүй' });
    res.set('Content-Type', image.contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(image.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
