import express, { Request, Response } from 'express';
import { db } from '../../lib/db.js';
import { auth } from '../../middleware/auth.js';
import { AuthenticatedRequest, Accountant } from '../../types/index.js';
import { google } from 'googleapis';
import { getAccountantTokens, refreshTokensIfNeeded } from '../../lib/google-drive.js';

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
        contact_details,
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
        contactDetails: accountant.contact_details || '',
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
      contactDetails,
      notificationEmail,
      notificationStuck
    } = req.body;

    await db.query(
      `UPDATE accountants
      SET
        practice_name = COALESCE($1, practice_name),
        amy_name = COALESCE($2, amy_name),
        amy_tone = COALESCE($3, amy_tone),
        contact_details = COALESCE($4, contact_details),
        notification_email = COALESCE($5, notification_email),
        notification_stuck = COALESCE($6, notification_stuck),
        updated_at = NOW()
      WHERE id = $7`,
      [practiceName, amyName, amyTone, contactDetails, notificationEmail, notificationStuck, accountantId]
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

/**
 * Helper function to delete files from Google Drive
 */
async function deleteGoogleDriveFiles(accountantId: string): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;

  try {
    // Get accountant's Google tokens
    const accountantData = await getAccountantTokens(accountantId);

    if (!accountantData || !accountantData.tokens) {
      console.log('No Google Drive connection found, skipping file deletion');
      return { deleted: 0, errors: 0 };
    }

    const { tokens } = accountantData;
    const freshTokens = await refreshTokensIfNeeded(tokens);

    // Set up Google Drive API
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials(freshTokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get all documents for this accountant
    const documentsResult = await db.query<{ drive_file_id: string }>(
      'SELECT drive_file_id FROM documents WHERE accountant_id = $1 AND drive_file_id IS NOT NULL',
      [accountantId]
    );

    console.log(`Found ${documentsResult.rows.length} files to delete from Google Drive`);

    // Delete each file
    for (const doc of documentsResult.rows) {
      try {
        await drive.files.delete({ fileId: doc.drive_file_id });
        deleted++;
        console.log(`Deleted file ${doc.drive_file_id} from Google Drive`);
      } catch (error: any) {
        console.error(`Error deleting file ${doc.drive_file_id}:`, error.message);
        errors++;
      }
    }

    // Also delete CSV files if any
    const csvResult = await db.query<{ csv_drive_file_id: string }>(
      'SELECT csv_drive_file_id FROM documents WHERE accountant_id = $1 AND csv_drive_file_id IS NOT NULL',
      [accountantId]
    );

    for (const doc of csvResult.rows) {
      try {
        await drive.files.delete({ fileId: doc.csv_drive_file_id });
        deleted++;
        console.log(`Deleted CSV file ${doc.csv_drive_file_id} from Google Drive`);
      } catch (error: any) {
        console.error(`Error deleting CSV file ${doc.csv_drive_file_id}:`, error.message);
        errors++;
      }
    }

  } catch (error) {
    console.error('Error in deleteGoogleDriveFiles:', error);
    errors++;
  }

  return { deleted, errors };
}

/**
 * DELETE /api/settings/data
 * Delete specific data types (documents, clients, campaigns)
 * GDPR compliance - data deletion
 */
router.delete('/data', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountantId = (req as AuthenticatedRequest).accountant.id;
    const { type } = req.query; // 'documents', 'clients', 'campaigns'

    if (!type || !['documents', 'clients', 'campaigns'].includes(type as string)) {
      res.status(400).json({
        success: false,
        error: 'Invalid type. Must be one of: documents, clients, campaigns'
      });
      return;
    }

    let deletedCount = 0;
    let driveStats = { deleted: 0, errors: 0 };

    switch (type) {
      case 'documents':
        // Delete Google Drive files first
        driveStats = await deleteGoogleDriveFiles(accountantId);

        // Delete document records from database
        const docResult = await db.query(
          'DELETE FROM documents WHERE accountant_id = $1',
          [accountantId]
        );
        deletedCount = docResult.rowCount || 0;
        break;

      case 'clients':
        // Deleting clients will cascade to messages, documents, campaign_clients
        // But we should delete Drive files first
        driveStats = await deleteGoogleDriveFiles(accountantId);

        const clientResult = await db.query(
          'DELETE FROM clients WHERE accountant_id = $1',
          [accountantId]
        );
        deletedCount = clientResult.rowCount || 0;
        break;

      case 'campaigns':
        // Deleting campaigns will cascade to campaign_clients
        const campaignResult = await db.query(
          'DELETE FROM campaigns WHERE accountant_id = $1',
          [accountantId]
        );
        deletedCount = campaignResult.rowCount || 0;
        break;
    }

    res.json({
      success: true,
      message: `Deleted ${deletedCount} ${type}`,
      deletedCount,
      googleDrive: driveStats
    });

  } catch (error) {
    console.error('Error deleting data:', error);
    res.status(500).json({ success: false, error: 'Failed to delete data' });
  }
});

/**
 * DELETE /api/settings/account
 * Complete account deletion - GDPR Right to Erasure
 * This will delete the accountant and ALL associated data (cascades via foreign keys)
 */
router.delete('/account', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountantId = (req as AuthenticatedRequest).accountant.id;
    const { confirmation } = req.body;

    // Require email confirmation
    const accountantResult = await db.query<{ email: string }>(
      'SELECT email FROM accountants WHERE id = $1',
      [accountantId]
    );

    if (accountantResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Account not found' });
      return;
    }

    const accountantEmail = accountantResult.rows[0].email;

    // Verify confirmation matches email
    if (confirmation !== accountantEmail) {
      res.status(400).json({
        success: false,
        error: 'Email confirmation does not match. Please type your email address to confirm deletion.'
      });
      return;
    }

    console.log(`🗑️ Starting complete account deletion for ${accountantEmail}`);

    // Step 1: Delete all Google Drive files
    const driveStats = await deleteGoogleDriveFiles(accountantId);
    console.log(`📁 Deleted ${driveStats.deleted} files from Google Drive (${driveStats.errors} errors)`);

    // Step 2: Get counts before deletion (for logging)
    const stats = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM clients WHERE accountant_id = $1) as clients,
        (SELECT COUNT(*) FROM campaigns WHERE accountant_id = $1) as campaigns,
        (SELECT COUNT(*) FROM documents WHERE accountant_id = $1) as documents,
        (SELECT COUNT(*) FROM messages WHERE accountant_id = $1) as messages
    `, [accountantId]);

    const deletionStats = stats.rows[0];

    // Step 3: Delete the accountant record
    // This will CASCADE delete all related records:
    // - clients (which cascades to campaign_clients)
    // - campaigns (which cascades to campaign_clients, messages)
    // - messages
    // - documents
    await db.query('DELETE FROM accountants WHERE id = $1', [accountantId]);

    console.log(`✅ Account deletion complete for ${accountantEmail}`);
    console.log(`📊 Deleted: ${deletionStats.clients} clients, ${deletionStats.campaigns} campaigns, ${deletionStats.documents} documents, ${deletionStats.messages} messages`);

    res.json({
      success: true,
      message: 'Account and all associated data has been permanently deleted',
      stats: {
        ...deletionStats,
        googleDriveFiles: driveStats.deleted,
        googleDriveErrors: driveStats.errors
      }
    });

  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

export default router;
