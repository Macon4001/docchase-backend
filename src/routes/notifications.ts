import express, { Request, Response } from 'express';
import { db } from '../lib/db.js';
import { auth } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = express.Router();

interface Notification {
  id: string;
  accountant_id: string;
  type: string;
  title: string;
  message: string;
  client_name?: string;
  campaign_name?: string;
  read: boolean;
  created_at: string;
}

/**
 * GET /api/notifications
 * Get all notifications for the authenticated user
 */
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  const authenticatedReq = req as AuthenticatedRequest;
  const accountantId = authenticatedReq.accountant?.id;

  if (!accountantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Get all notifications
    const notificationsResult = await db.query<Notification>(
      `SELECT * FROM notifications
       WHERE accountant_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [accountantId]
    );

    // Get unread count
    const unreadResult = await db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM notifications WHERE accountant_id = $1 AND read = FALSE',
      [accountantId]
    );

    res.json({
      notifications: notificationsResult.rows,
      unread_count: parseInt(unreadResult.rows[0]?.count || '0')
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark a notification as read
 */
router.post('/:id/read', auth, async (req: Request, res: Response): Promise<void> => {
  const authenticatedReq = req as AuthenticatedRequest;
  const accountantId = authenticatedReq.accountant?.id;
  const { id } = req.params;

  if (!accountantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await db.query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND accountant_id = $2 RETURNING *',
      [id, accountantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ success: true, notification: result.rows[0] });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read
 */
router.post('/read-all', auth, async (req: Request, res: Response): Promise<void> => {
  const authenticatedReq = req as AuthenticatedRequest;
  const accountantId = authenticatedReq.accountant?.id;

  if (!accountantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    await db.query(
      'UPDATE notifications SET read = TRUE WHERE accountant_id = $1 AND read = FALSE',
      [accountantId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/**
 * Helper function to create a notification
 * This can be called from other parts of the application
 */
export async function createNotification(
  accountantId: string,
  type: string,
  title: string,
  message: string,
  clientName?: string,
  campaignName?: string
): Promise<void> {
  try {
    console.log(`🔔 Creating notification for accountant ${accountantId}: ${title}`);
    const result = await db.query(
      `INSERT INTO notifications (accountant_id, type, title, message, client_name, campaign_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [accountantId, type, title, message, clientName, campaignName]
    );
    console.log(`✅ Notification created successfully: ${result.rows[0].id}`);
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    console.error('Notification details:', { accountantId, type, title, message, clientName, campaignName });
    throw error; // Re-throw to see the error in calling code
  }
}

export default router;
