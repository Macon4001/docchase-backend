import express, { Request, Response } from 'express';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { AuthenticatedRequest, Client } from '../types/index.js';

const router = express.Router();

// Get all clients for the authenticated accountant
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;

    const result = await db.query<Client>(
      `SELECT * FROM clients
       WHERE accountant_id = $1
       ORDER BY created_at DESC`,
      [accountantId]
    );

    res.json({ clients: result.rows });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get single client by ID
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;
    const clientId = req.params.id;

    const result = await db.query<Client>(
      `SELECT * FROM clients
       WHERE id = $1 AND accountant_id = $2`,
      [clientId, accountantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json({ client: result.rows[0] });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Create new client
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;
    const { name, phone, email } = req.body;

    if (!name || !phone) {
      res.status(400).json({ error: 'Name and phone are required' });
      return;
    }

    // Check subscription limits
    const accountant = await db.query(
      `SELECT client_limit, subscription_status FROM accountants WHERE id = $1`,
      [accountantId]
    );

    if (!accountant.rows[0]) {
      res.status(404).json({ error: 'Accountant not found' });
      return;
    }

    const clientLimit = accountant.rows[0].client_limit || 1;

    // Count current clients
    const clientCount = await db.query(
      'SELECT COUNT(*) FROM clients WHERE accountant_id = $1',
      [accountantId]
    );

    const currentCount = parseInt(clientCount.rows[0].count);

    if (currentCount >= clientLimit) {
      res.status(403).json({
        error: 'Client limit reached',
        upgrade: true,
        currentCount,
        limit: clientLimit
      });
      return;
    }

    // Check if client with this phone already exists for this accountant
    const existing = await db.query<Client>(
      'SELECT id FROM clients WHERE accountant_id = $1 AND phone = $2',
      [accountantId, phone]
    );

    if (existing.rows.length > 0) {
      res.status(400).json({ error: 'Client with this phone number already exists' });
      return;
    }

    const result = await db.query<Client>(
      `INSERT INTO clients (accountant_id, name, phone, email)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [accountantId, name, phone, email || null]
    );

    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client
router.put('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;
    const clientId = req.params.id;
    const { name, phone, email, status } = req.body;

    const result = await db.query<Client>(
      `UPDATE clients
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email),
           status = COALESCE($4, status),
           updated_at = NOW()
       WHERE id = $5 AND accountant_id = $6
       RETURNING *`,
      [name, phone, email, status, clientId, accountantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Delete client
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;
    const clientId = req.params.id;

    const result = await db.query(
      'DELETE FROM clients WHERE id = $1 AND accountant_id = $2 RETURNING id',
      [clientId, accountantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    res.json({ success: true, message: 'Client deleted' });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default router;
