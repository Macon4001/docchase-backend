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

// Get collection activity over time (last 7 days)
router.get('/activity', authenticate, async (req: Request, res: Response): Promise<void> => {
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

    const campaign = campaignResult.rows[0];

    if (!campaign) {
      res.json({ activity: [] });
      return;
    }

    // Get daily document collection activity for last 7 days
    // Generate all 7 days and count status changes per day
    const activityResult = await db.query<{
      date: string;
      received: number;
      pending: number;
    }>(
      `WITH date_series AS (
         SELECT generate_series(
           CURRENT_DATE - INTERVAL '6 days',
           CURRENT_DATE,
           INTERVAL '1 day'
         )::date as date
       ),
       daily_stats AS (
         SELECT
           DATE(cc.updated_at) as date,
           COUNT(*) FILTER (WHERE cc.status = 'received')::int as received,
           COUNT(*) FILTER (WHERE cc.status = 'pending')::int as pending
         FROM campaign_clients cc
         WHERE cc.campaign_id = $1
         AND cc.updated_at >= CURRENT_DATE - INTERVAL '6 days'
         GROUP BY DATE(cc.updated_at)
       )
       SELECT
         ds.date::text,
         COALESCE(dst.received, 0) as received,
         COALESCE(dst.pending, 0) as pending
       FROM date_series ds
       LEFT JOIN daily_stats dst ON ds.date = dst.date
       ORDER BY ds.date ASC`,
      [campaign.id]
    );

    res.json({ activity: activityResult.rows });
  } catch (error) {
    console.error('Activity error:', error);
    res.status(500).json({ error: 'Failed to load activity data' });
  }
});

export default router;
