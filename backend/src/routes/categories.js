const express = require('express');
const { query } = require('../config/db');
const serialize = require('../lib/serialize');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await query('select * from public.categories order by sort_order asc');
    res.json(rows.map(serialize.category));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
