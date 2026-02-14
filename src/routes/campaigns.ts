import express, { Request, Response } from 'express';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { AuthenticatedRequest, Campaign, Client } from '../types/index.js';
import { sendDocumentRequest } from '../lib/twilio.js';

const router = express.Router();

// Get all campaigns for the authenticated accountant with statistics
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;

    const result = await db.query<Campaign>(
      `SELECT
        c.*,
        COUNT(cc.id) as total_clients,
        COUNT(cc.id) FILTER (WHERE cc.status = 'pending') as pending,
        COUNT(cc.id) FILTER (WHERE cc.status = 'received') as received,
        COUNT(cc.id) FILTER (WHERE cc.status = 'failed') as failed
       FROM campaigns c
       LEFT JOIN campaign_clients cc ON c.id = cc.campaign_id
       WHERE c.accountant_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [accountantId]
    );

    res.json({ campaigns: result.rows });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Get single campaign by ID with statistics
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

    // Get campaign statistics
    const statsResult = await db.query<{
      total_clients: string;
      pending: string;
      received: string;
      failed: string;
    }>(
      `SELECT
        COUNT(*) as total_clients,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'received') as received,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
       FROM campaign_clients
       WHERE campaign_id = $1`,
      [campaignId]
    );

    const stats = statsResult.rows[0] || {
      total_clients: '0',
      pending: '0',
      received: '0',
      failed: '0'
    };

    res.json({
      campaign: result.rows[0],
      stats: {
        total_clients: parseInt(stats.total_clients),
        pending: parseInt(stats.pending),
        received: parseInt(stats.received),
        failed: parseInt(stats.failed)
      }
    });
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
      flag_after_day_9,
      reminder_1_days,
      reminder_2_days,
      reminder_3_days,
      reminder_send_time,
      initial_message
    } = req.body;

    if (!name || !period) {
      res.status(400).json({ error: 'Name and period are required' });
      return;
    }

    // Create campaign with custom schedule settings (status defaults to 'draft')
    const campaignResult = await db.query<Campaign>(
      `INSERT INTO campaigns (
        accountant_id, name, document_type, period, status,
        reminder_day_3, reminder_day_6, flag_after_day_9,
        reminder_1_days, reminder_2_days, reminder_3_days, reminder_send_time,
        initial_message
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        accountantId,
        name,
        document_type || 'bank_statement',
        period,
        'draft', // Always create campaigns in draft status
        reminder_day_3 !== false,
        reminder_day_6 !== false,
        flag_after_day_9 !== false,
        reminder_1_days || 3,
        reminder_2_days || 6,
        reminder_3_days || 9,
        reminder_send_time || '10:00',
        initial_message || null
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

    // Check subscription limits (for free plan)
    const accountant = await db.query(
      `SELECT subscription_plan, chase_limit, chases_used FROM accountants WHERE id = $1`,
      [accountantId]
    );

    if (!accountant.rows[0]) {
      res.status(404).json({ error: 'Accountant not found' });
      return;
    }

    const acc = accountant.rows[0];

    // Enforce chase limit for free plan
    if (acc.subscription_plan === 'free') {
      const chaseLimit = acc.chase_limit || 3;
      const chasesUsed = acc.chases_used || 0;

      if (chasesUsed >= chaseLimit) {
        res.status(403).json({
          error: 'Chase limit reached on free plan',
          upgrade: true,
          chasesUsed,
          limit: chaseLimit
        });
        return;
      }
    }

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

    // Get accountant details for practice name and assistant name
    const accountantResult = await db.query<{ practice_name: string; amy_name: string }>(
      `SELECT practice_name, amy_name FROM accountants WHERE id = $1`,
      [accountantId]
    );
    const practiceName = accountantResult.rows[0]?.practice_name || 'your accountant';
    const assistantName = accountantResult.rows[0]?.amy_name || 'Amy';

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

    console.log(`\n🚀 Starting campaign "${campaign.name}" (ID: ${campaignId})`);
    console.log(`📊 Sending messages to ${clientsResult.rows.length} clients...\n`);

    // Send messages to all clients
    for (const client of clientsResult.rows) {
      try {
        console.log(`📤 Preparing message for ${client.name}...`);

        // Create document description (e.g., "January 2026 bank statement")
        const documentDescription = `${campaign.period} ${campaign.document_type.replace('_', ' ')}`;

        console.log(`📱 Sending WhatsApp to ${client.phone} using approved template...`);

        // Send WhatsApp message using approved Twilio template
        await sendDocumentRequest(
          client.phone,
          client.name,
          practiceName,
          documentDescription,
          accountantId,
          client.id,
          campaignId
        );

        // Update campaign_clients to mark first message sent
        const timestamp = new Date();
        await db.query(
          `UPDATE campaign_clients
           SET first_message_sent_at = $1, status = 'pending'
           WHERE id = $2`,
          [timestamp, client.campaign_client_id]
        );

        results.success++;
        console.log(`✅ [${timestamp.toISOString()}] First message sent to ${client.name} (${client.phone})`);
        console.log(`   Status: pending | Reminder schedule: ${campaign.reminder_1_days || 3}, ${campaign.reminder_2_days || 6}, ${campaign.reminder_3_days || 9} days\n`);
      } catch (error) {
        results.failed++;
        results.errors.push({
          clientName: client.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`❌ [${new Date().toISOString()}] Failed to send to ${client.name}:`, error);
        console.error(`   Phone: ${client.phone}\n`);
      }
    }

    // Update campaign status to active
    await db.query(
      `UPDATE campaigns
       SET status = 'active'
       WHERE id = $1`,
      [campaignId]
    );

    // Increment chase counter for free plan users
    if (acc.subscription_plan === 'free') {
      await db.query(
        'UPDATE accountants SET chases_used = chases_used + 1 WHERE id = $1',
        [accountantId]
      );
      console.log(`📊 Free plan chase counter incremented: ${acc.chases_used + 1}/${acc.chase_limit || 3}`);
    }

    console.log(`\n📈 Campaign Start Summary:`);
    console.log(`   Campaign: ${campaign.name}`);
    console.log(`   Total Clients: ${clientsResult.rows.length}`);
    console.log(`   ✅ Successfully Sent: ${results.success}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log(`   Campaign Status: active`);
    console.log(`   Next Check: Reminders will be sent based on custom schedule`);
    console.log(`   Reminder Days: ${campaign.reminder_1_days || 3}, ${campaign.reminder_2_days || 6}, ${campaign.reminder_3_days || 9}`);
    console.log(`   Send Time: ${campaign.reminder_send_time || '10:00'}\n`);

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

// Update campaign
router.patch('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;
    const campaignId = req.params.id;
    const {
      name,
      period,
      reminder_1_days,
      reminder_2_days,
      reminder_3_days,
      reminder_send_time,
      initial_message,
      reminder_day_3,
      reminder_day_6,
      flag_after_day_9
    } = req.body;

    // Build dynamic update query based on provided fields
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (period !== undefined) {
      updates.push(`period = $${paramIndex++}`);
      values.push(period);
    }
    if (reminder_1_days !== undefined) {
      updates.push(`reminder_1_days = $${paramIndex++}`);
      values.push(reminder_1_days);
    }
    if (reminder_2_days !== undefined) {
      updates.push(`reminder_2_days = $${paramIndex++}`);
      values.push(reminder_2_days);
    }
    if (reminder_3_days !== undefined) {
      updates.push(`reminder_3_days = $${paramIndex++}`);
      values.push(reminder_3_days);
    }
    if (reminder_send_time !== undefined) {
      updates.push(`reminder_send_time = $${paramIndex++}`);
      values.push(reminder_send_time);
    }
    if (initial_message !== undefined) {
      updates.push(`initial_message = $${paramIndex++}`);
      values.push(initial_message);
    }
    if (reminder_day_3 !== undefined) {
      updates.push(`reminder_day_3 = $${paramIndex++}`);
      values.push(reminder_day_3);
    }
    if (reminder_day_6 !== undefined) {
      updates.push(`reminder_day_6 = $${paramIndex++}`);
      values.push(reminder_day_6);
    }
    if (flag_after_day_9 !== undefined) {
      updates.push(`flag_after_day_9 = $${paramIndex++}`);
      values.push(flag_after_day_9);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    // Add campaignId and accountantId to values
    values.push(campaignId, accountantId);

    const result = await db.query<Campaign>(
      `UPDATE campaigns
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND accountant_id = $${paramIndex++}
       RETURNING *`,
      values
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
