import express, { Request, Response } from 'express';
import { db } from '../../lib/db.js';
import { auth } from '../../middleware/auth.js';
import { AuthenticatedRequest, Accountant } from '../../types/index.js';

const router = express.Router();

/**
 * GET /api/settings
 * Get current accountant's settings
 */
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountantId = (req as AuthenticatedRequest).accountant.id;

    const result = await db.query<Accountant>(
      `SELECT
        id,
        email,
        practice_name,
        amy_name,
        amy_tone,
        google_drive_folder_id,
        google_drive_connected_at,
        notification_email,
        notification_stuck,
        created_at
      FROM accountants
      WHERE id = $1`,
      [accountantId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Accountant not found' });
      return;
    }

    const accountant = result.rows[0];

    res.json({
      success: true,
      settings: {
        email: accountant.email,
        practiceName: accountant.practice_name,
        amyName: accountant.amy_name || 'Amy',
        amyTone: accountant.amy_tone || 'friendly',
        googleDriveConnected: !!accountant.google_drive_connected_at,
        googleDriveConnectedAt: accountant.google_drive_connected_at,
        notificationEmail: accountant.notification_email,
        notificationStuck: accountant.notification_stuck
      }
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/settings
 * Update accountant's settings
 */
router.put('/', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountantId = (req as AuthenticatedRequest).accountant.id;
    const {
      practiceName,
      amyName,
      amyTone,
      notificationEmail,
      notificationStuck
    } = req.body;

    await db.query(
      `UPDATE accountants
      SET
        practice_name = COALESCE($1, practice_name),
        amy_name = COALESCE($2, amy_name),
        amy_tone = COALESCE($3, amy_tone),
        notification_email = COALESCE($4, notification_email),
        notification_stuck = COALESCE($5, notification_stuck),
        updated_at = NOW()
      WHERE id = $6`,
      [practiceName, amyName, amyTone, notificationEmail, notificationStuck, accountantId]
    );

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

/**
 * DELETE /api/settings/google
 * Disconnect Google Drive
 */
router.delete('/google', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountantId = (req as AuthenticatedRequest).accountant.id;

    await db.query(
      `UPDATE accountants
      SET
        google_drive_token = NULL,
        google_drive_folder_id = NULL,
        google_drive_connected_at = NULL,
        updated_at = NOW()
      WHERE id = $1`,
      [accountantId]
    );

    res.json({ success: true, message: 'Google Drive disconnected' });
  } catch (error) {
    console.error('Error disconnecting Google:', error);
    res.status(500).json({ success: false, error: 'Failed to disconnect' });
  }
});

export default router;
