import express, { Request, Response } from 'express';
import { db } from '../lib/db.js';
import { auth } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';
import { sendEmail, shouldSendEmail } from '../lib/email.js';
import {
  documentReceivedEmail,
  clientStuckEmail,
  documentUploadedToDriveEmail,
  campaignStartedEmail,
  campaignCompleteEmail,
  genericNotificationEmail,
} from '../lib/email-templates.js';

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
 * POST /api/notifications/test-email
 * Send a test email to verify SMTP configuration
 */
router.post('/test-email', auth, async (req: Request, res: Response): Promise<void> => {
  const authenticatedReq = req as AuthenticatedRequest;
  const accountantId = authenticatedReq.accountant?.id;

  if (!accountantId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Get accountant email
    const accountantResult = await db.query<{ email: string }>(
      'SELECT email FROM accountants WHERE id = $1',
      [accountantId]
    );

    if (accountantResult.rows.length === 0) {
      res.status(404).json({ error: 'Accountant not found' });
      return;
    }

    const email = accountantResult.rows[0].email;

    // Import sendTestEmail function
    const { sendTestEmail } = await import('../lib/email.js');

    // Send test email
    const sent = await sendTestEmail(email);

    if (sent) {
      res.json({
        success: true,
        message: `Test email sent to ${email}`
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send test email. Please check your SMTP configuration.'
      });
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test email'
    });
  }
});

/**
 * Helper function to create a notification
 * This can be called from other parts of the application
 *
 * @param accountantId - The accountant's ID
 * @param type - Notification type (client_response, client_stuck, document_uploaded, etc.)
 * @param title - Notification title
 * @param message - Notification message
 * @param clientName - Optional client name
 * @param campaignName - Optional campaign name
 * @param metadata - Optional metadata for email customization
 */
export async function createNotification(
  accountantId: string,
  type: string,
  title: string,
  message: string,
  clientName?: string,
  campaignName?: string,
  metadata?: {
    documentType?: string;
    driveUrl?: string;
    daysSinceLastMessage?: number;
    clientCount?: number;
    period?: string;
    successCount?: number;
    totalCount?: number;
  }
): Promise<void> {
  try {
    console.log(`🔔 Creating notification for accountant ${accountantId}: ${title}`);

    // Create in-app notification
    const result = await db.query(
      `INSERT INTO notifications (accountant_id, type, title, message, client_name, campaign_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [accountantId, type, title, message, clientName, campaignName]
    );
    console.log(`✅ Notification created successfully: ${result.rows[0].id}`);

    // Send email notification (async, don't block)
    sendEmailNotification(accountantId, type, title, message, clientName, campaignName, metadata)
      .catch((error) => {
        console.error('❌ Error sending email notification:', error);
        // Don't throw - email failures shouldn't break notification creation
      });

  } catch (error) {
    console.error('❌ Error creating notification:', error);
    console.error('Notification details:', { accountantId, type, title, message, clientName, campaignName });
    throw error; // Re-throw to see the error in calling code
  }
}

/**
 * Send email notification based on type
 */
async function sendEmailNotification(
  accountantId: string,
  type: string,
  title: string,
  message: string,
  clientName?: string,
  campaignName?: string,
  metadata?: {
    documentType?: string;
    driveUrl?: string;
    daysSinceLastMessage?: number;
    clientCount?: number;
    period?: string;
    successCount?: number;
    totalCount?: number;
  }
): Promise<void> {
  // Check if user has email notifications enabled
  const emailCheck = await shouldSendEmail(accountantId, type);

  if (!emailCheck.enabled || !emailCheck.email) {
    console.log(`📧 Email notification skipped (disabled or no email): ${type} → ${emailCheck.email}`);
    return;
  }

  let emailData: { subject: string; html: string } | null = null;

  // Generate appropriate email template based on notification type
  switch (type) {
    case 'client_response':
    case 'document_received':
      if (clientName && metadata?.documentType) {
        emailData = documentReceivedEmail(
          clientName,
          metadata.documentType,
          campaignName
        );
      }
      break;

    case 'client_stuck':
      if (clientName && metadata?.daysSinceLastMessage) {
        emailData = clientStuckEmail(
          clientName,
          metadata.daysSinceLastMessage,
          campaignName
        );
      }
      break;

    case 'document_uploaded':
      if (clientName && metadata?.documentType && metadata?.driveUrl) {
        emailData = documentUploadedToDriveEmail(
          clientName,
          metadata.documentType,
          metadata.driveUrl
        );
      }
      break;

    case 'campaign_started':
      if (campaignName && metadata?.clientCount !== undefined && metadata?.period) {
        emailData = campaignStartedEmail(
          campaignName,
          metadata.clientCount,
          metadata.period
        );
      }
      break;

    case 'campaign_complete':
      if (campaignName && metadata?.successCount !== undefined && metadata?.totalCount !== undefined) {
        const successRate = (metadata.successCount / metadata.totalCount) * 100;
        emailData = campaignCompleteEmail(
          campaignName,
          metadata.successCount,
          metadata.totalCount,
          successRate
        );
      }
      break;

    default:
      // Generic notification email for unknown types
      emailData = genericNotificationEmail(title, message);
      break;
  }

  // Send email if we have data
  if (emailData && emailCheck.email) {
    await sendEmail(emailCheck.email, emailData.subject, emailData.html);
  }
}

export default router;
