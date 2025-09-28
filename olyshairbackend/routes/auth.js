const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// register
router.post('/register', async (req,res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).send({ error: 'Missing fields' });
    if (await User.findOne({ email })) return res.status(409).send({ error: 'Email exists' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });
    const token = jwt.sign({ id:user._id }, JWT_SECRET, { expiresIn:'30d' });
    res.json({ token, user: { id:user._id, email:user.email, name:user.name, avatarUrl:user.avatarUrl } });
  } catch(err) { res.status(500).send({ error: err.message }); }
});

// login
router.post('/login', async (req,res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).send({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).send({ error: 'Invalid credentials' });
    const token = jwt.sign({ id:user._id }, JWT_SECRET, { expiresIn:'30d' });
    res.json({ token, user: { id:user._id, email:user.email, name:user.name, avatarUrl:user.avatarUrl } });
  } catch(err){ res.status(500).send({ error: err.message }); }
});

module.exports = router;
