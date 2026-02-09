import express, { Request, Response } from 'express';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { AuthenticatedRequest, Campaign, Client } from '../types/index.js';
import { sendWhatsApp } from '../lib/twilio.js';
import { generateInitialMessage } from '../lib/claude.js';

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

// Start campaign - send WhatsApp messages to all clients
router.post('/:id/start', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;
    const campaignId = req.params.id;

    // Get campaign details
    const campaignResult = await db.query<Campaign>(
      `SELECT * FROM campaigns
       WHERE id = $1 AND accountant_id = $2`,
      [campaignId, accountantId]
    );

    if (campaignResult.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const campaign = campaignResult.rows[0];

    if (campaign.status !== 'draft') {
      res.status(400).json({ error: 'Campaign has already been started' });
      return;
    }

    // Get accountant details for practice name
    const accountantResult = await db.query<{ practice_name: string }>(
      `SELECT practice_name FROM accountants WHERE id = $1`,
      [accountantId]
    );
    const practiceName = accountantResult.rows[0]?.practice_name || 'your accountant';

    // Get all clients in the campaign
    const clientsResult = await db.query<Client & { campaign_client_id: string }>(
      `SELECT c.*, cc.id as campaign_client_id
       FROM clients c
       JOIN campaign_clients cc ON c.id = cc.client_id
       WHERE cc.campaign_id = $1`,
      [campaignId]
    );

    if (clientsResult.rows.length === 0) {
      res.status(400).json({ error: 'No clients in campaign' });
      return;
    }

    const results = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ clientName: string; error: string }>,
    };

    // Send messages to all clients
    for (const client of clientsResult.rows) {
      try {
        // Generate personalized message using Claude
        const messageBody = await generateInitialMessage(
          client.name,
          campaign.document_type,
          campaign.period,
          practiceName
        );

        // Send WhatsApp message
        await sendWhatsApp(
          client.phone,
          messageBody,
          accountantId,
          client.id,
          campaignId
        );

        // Update campaign_clients to mark first message sent
        await db.query(
          `UPDATE campaign_clients
           SET first_message_sent_at = NOW(), status = 'pending'
           WHERE id = $1`,
          [client.campaign_client_id]
        );

        results.success++;
        console.log(`✅ Sent message to ${client.name} (${client.phone})`);
      } catch (error) {
        results.failed++;
        results.errors.push({
          clientName: client.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`❌ Failed to send to ${client.name}:`, error);
      }
    }

    // Update campaign status to active
    await db.query(
      `UPDATE campaigns
       SET status = 'active'
       WHERE id = $1`,
      [campaignId]
    );

    res.json({
      success: true,
      results: {
        total: clientsResult.rows.length,
        success: results.success,
        failed: results.failed,
        errors: results.errors,
      },
    });
  } catch (error) {
    console.error('Start campaign error:', error);
    res.status(500).json({ error: 'Failed to start campaign' });
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
