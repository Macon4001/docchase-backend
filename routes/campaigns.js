import express from 'express';
import { db } from '../lib/db.js';
import { auth } from '../middleware/auth.js';
import { sendWhatsApp } from '../lib/twilio.js';
import { generateAmyResponse } from '../lib/claude.js';

const router = express.Router();

// Get all campaigns
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM campaigns
       WHERE accountant_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ campaigns: result.rows });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Create campaign
router.post('/', auth, async (req, res) => {
  try {
    const {
      name,
      document_type = 'bank_statement',
      period,
      client_ids = [],
      reminder_day_3 = true,
      reminder_day_6 = true,
      flag_after_day_9 = true,
    } = req.body;

    if (!name || !period || name.length < 2) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    // Create campaign
    const campaignResult = await db.query(
      `INSERT INTO campaigns (accountant_id, name, document_type, period, reminder_day_3, reminder_day_6, flag_after_day_9)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, name, document_type, period, reminder_day_3, reminder_day_6, flag_after_day_9]
    );

    const campaign = campaignResult.rows[0];

    // Add clients to campaign
    if (client_ids.length > 0) {
      const values = client_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      await db.query(
        `INSERT INTO campaign_clients (campaign_id, client_id)
         VALUES ${values}`,
        [campaign.id, ...client_ids]
      );
    }

    res.json({ campaign });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Start campaign - send messages to all clients
router.post('/:id/start', auth, async (req, res) => {
  try {
    const campaignId = req.params.id;

    // Verify ownership
    const campaignResult = await db.query(
      `SELECT * FROM campaigns WHERE id = $1 AND accountant_id = $2`,
      [campaignId, req.user.id]
    );

    if (!campaignResult.rows[0]) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = campaignResult.rows[0];

    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Campaign already started' });
    }

    // Get accountant info
    const accountantResult = await db.query(
      `SELECT * FROM accountants WHERE id = $1`,
      [req.user.id]
    );
    const accountant = accountantResult.rows[0];

    // Get all clients in campaign
    const clientsResult = await db.query(
      `SELECT c.* FROM clients c
       JOIN campaign_clients cc ON c.id = cc.client_id
       WHERE cc.campaign_id = $1`,
      [campaignId]
    );

    // Send messages to all clients
    const results = [];
    for (const client of clientsResult.rows) {
      try {
        const message = await generateAmyResponse(
          {
            id: client.id,
            name: client.name,
            amy_name: accountant.amy_name,
            amy_tone: accountant.amy_tone,
          },
          'initial_request',
          `${campaign.document_type} for ${campaign.period}`
        );

        await sendWhatsApp(client.phone, message, req.user.id, client.id);

        await db.query(
          `UPDATE campaign_clients
           SET status = 'sent', sent_at = NOW()
           WHERE campaign_id = $1 AND client_id = $2`,
          [campaignId, client.id]
        );

        results.push({ client_id: client.id, success: true });
      } catch (error) {
        console.error(`Failed to send to client ${client.id}:`, error);
        results.push({ client_id: client.id, success: false, error: error.message });
      }
    }

    // Update campaign status
    await db.query(
      `UPDATE campaigns SET status = 'active', started_at = NOW() WHERE id = $1`,
      [campaignId]
    );

    res.json({ success: true, results });
  } catch (error) {
    console.error('Start campaign error:', error);
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

export default router;
