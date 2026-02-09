import express, { Request, Response } from 'express';
import { getAuthUrl } from '../../lib/google-drive.js';
import { auth } from '../../middleware/auth.js';
import { AuthenticatedRequest } from '../../types/index.js';

const router = express.Router();

/**
 * GET /api/settings/google-auth
 * Returns the Google OAuth URL for the accountant to authorize
 */
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const accountantId = (req as AuthenticatedRequest).accountant.id;

    // Pass accountant ID in state so we know who's connecting in callback
    const authUrl = getAuthUrl(accountantId.toString());

    res.json({
      success: true,
      authUrl: authUrl
    });
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL'
    });
  }
});

export default router;
