import express from 'express';
import { db } from '../lib/db.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// Get all clients for authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM clients
       WHERE accountant_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ clients: result.rows });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Create new client
router.post('/', auth, async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    if (!name || !phone || name.length < 2 || phone.length < 10) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const result = await db.query(
      `INSERT INTO clients (accountant_id, name, phone, email)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, name, phone, email || null]
    );

    res.json({ client: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Client with this phone number already exists' });
    }
    console.error('Create client error:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Get single client
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM clients
       WHERE id = $1 AND accountant_id = $2`,
      [req.params.id, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client: result.rows[0] });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Update client
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, phone, email } = req.body;

    const result = await db.query(
      `UPDATE clients
       SET name = $1, phone = $2, email = $3, updated_at = NOW()
       WHERE id = $4 AND accountant_id = $5
       RETURNING *`,
      [name, phone, email || null, req.params.id, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client: result.rows[0] });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Delete client
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM clients
       WHERE id = $1 AND accountant_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
