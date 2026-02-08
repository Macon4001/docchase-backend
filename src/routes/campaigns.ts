import express, { Request, Response } from 'express';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { AuthenticatedRequest, Campaign } from '../types/index.js';

const router = express.Router();

// Get all campaigns for the authenticated accountant
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;

    const result = await db.query<Campaign>(
      `SELECT * FROM campaigns
       WHERE accountant_id = $1
       ORDER BY created_at DESC`,
      [accountantId]
    );

    res.json({ campaigns: result.rows });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get single campaign by ID
router.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;
    const campaignId = req.params.id;

    const result = await db.query<Campaign>(
      `SELECT * FROM campaigns
       WHERE id = $1 AND accountant_id = $2`,
      [campaignId, accountantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    res.json({ campaign: result.rows[0] });
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Create new campaign
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;
    const {
      name,
      document_type,
      period,
      client_ids,
      reminder_day_3,
      reminder_day_6,
      flag_after_day_9
    } = req.body;

    if (!name || !period) {
      res.status(400).json({ error: 'Name and period are required' });
      return;
    }

    // Create campaign
    const campaignResult = await db.query<Campaign>(
      `INSERT INTO campaigns (
        accountant_id, name, document_type, period,
        reminder_day_3, reminder_day_6, flag_after_day_9
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        accountantId,
        name,
        document_type || 'bank_statement',
        period,
        reminder_day_3 !== false,
        reminder_day_6 !== false,
        flag_after_day_9 !== false
      ]
    );

    const campaign = campaignResult.rows[0];

    // Add clients to campaign if provided
    if (client_ids && Array.isArray(client_ids) && client_ids.length > 0) {
      const values = client_ids.map((clientId, index) =>
        `($1, $${index + 2})`
      ).join(', ');

      await db.query(
        `INSERT INTO campaign_clients (campaign_id, client_id)
         VALUES ${values}`,
        [campaign.id, ...client_ids]
      );
    }

    res.json({ success: true, campaign });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Update campaign status
router.patch('/:id/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;
    const campaignId = req.params.id;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'Status is required' });
      return;
    }

    const result = await db.query<Campaign>(
      `UPDATE campaigns
       SET status = $1,
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END
       WHERE id = $2 AND accountant_id = $3
       RETURNING *`,
      [status, campaignId, accountantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    res.json({ success: true, campaign: result.rows[0] });
  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

export default router;
