import express, { Response, Request } from 'express';
import { db } from '../lib/db.js';
import { authenticate } from '../middleware/auth.js';
import { AuthenticatedRequest, Campaign, DashboardData } from '../types/index.js';

const router = express.Router();

// Get dashboard data (active campaign + stats)
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant.id;

    // Get active campaign
    const campaignResult = await db.query<Campaign>(
      `SELECT * FROM campaigns
       WHERE accountant_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [accountantId]
    );

    const campaign = campaignResult.rows[0] || null;

    if (!campaign) {
      const response: DashboardData = {
        campaign: null,
        stats: null,
      };
      res.json(response);
      return;
    }

    // Get campaign stats
    const statsResult = await db.query<{
      total: number;
      received: number;
      pending: number;
      failed: number;
    }>(
      `SELECT
         COUNT(*)::int as total,
         COUNT(*) FILTER (WHERE cc.status = 'received')::int as received,
         COUNT(*) FILTER (WHERE cc.status = 'pending')::int as pending,
         COUNT(*) FILTER (WHERE cc.status = 'failed')::int as failed
       FROM campaign_clients cc
       WHERE cc.campaign_id = $1`,
      [campaign.id]
    );

    // Get client details
    const clientsResult = await db.query<{
      id: string;
      name: string;
      status: string;
      updated_at: Date;
    }>(
      `SELECT c.id, c.name, cc.status, cc.updated_at
       FROM campaign_clients cc
       JOIN clients c ON cc.client_id = c.id
       WHERE cc.campaign_id = $1
       ORDER BY cc.updated_at DESC`,
      [campaign.id]
    );

    const response: DashboardData = {
      campaign,
      stats: {
        ...statsResult.rows[0],
        clients: clientsResult.rows,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

export default router;
