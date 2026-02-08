import express from 'express';
import { db } from '../lib/db.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const router = express.Router();

// Register new accountant
router.post('/register', async (req, res) => {
  try {
    const { practice_name, email, password } = req.body;

    // Validate input
    if (!practice_name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already exists
    const existing = await db.query(
      'SELECT id FROM accountants WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Generate API token
    const api_token = crypto.randomBytes(32).toString('hex');

    // Create accountant
    const result = await db.query(
      `INSERT INTO accountants (email, password_hash, practice_name, api_token)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, practice_name, api_token`,
      [email.toLowerCase(), password_hash, practice_name, api_token]
    );

    const accountant = result.rows[0];

    res.json({
      success: true,
      accountant: {
        id: accountant.id,
        email: accountant.email,
        practice_name: accountant.practice_name,
      },
      token: accountant.api_token,
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find accountant
    const result = await db.query(
      'SELECT id, email, password_hash, practice_name, api_token FROM accountants WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accountant = result.rows[0];

    // Verify password
    const valid = await bcrypt.compare(password, accountant.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      success: true,
      accountant: {
        id: accountant.id,
        email: accountant.email,
        practice_name: accountant.practice_name,
      },
      token: accountant.api_token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
