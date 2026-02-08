import express from 'express';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get dashboard data (active campaign + stats)
router.get('/', authenticate, async (req, res) => {
  try {
    const accountantId = req.accountant.id;

    // Get active campaign
    const campaignResult = await db.query(
      `SELECT * FROM campaigns
       WHERE accountant_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [accountantId]
    );

    const campaign = campaignResult.rows[0] || null;

    if (!campaign) {
      return res.json({
        campaign: null,
        stats: null,
      });
    }

    // Get campaign stats
    const statsResult = await db.query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE cc.status = 'received')::int as received,
         COUNT(*) FILTER (WHERE cc.status = 'pending')::int as pending,
         COUNT(*) FILTER (WHERE cc.status = 'stuck')::int as stuck
       FROM campaign_clients cc
       WHERE cc.campaign_id = $1`,
      [campaign.id]
    );

    // Get client details
    const clientsResult = await db.query(
      `SELECT c.id, c.name, cc.status, cc.updated_at
       FROM campaign_clients cc
       JOIN clients c ON cc.client_id = c.id
       WHERE cc.campaign_id = $1
       ORDER BY cc.updated_at DESC`,
      [campaign.id]
    );

    res.json({
      campaign,
      stats: {
        ...statsResult.rows[0],
        clients: clientsResult.rows,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

export default router;
