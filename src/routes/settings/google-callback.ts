import express, { Request, Response } from 'express';
import { getTokensFromCode, getOrCreateRootFolder, storeGoogleTokens } from '../../lib/google-drive.js';

const router = express.Router();

/**
 * GET /api/settings/google-callback
 * Handles the OAuth callback from Google
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error } = req.query;

    // Handle user denying access
    if (error) {
      console.error('Google OAuth error:', error);
      res.redirect('/settings?error=google_denied');
      return;
    }

    if (!code || typeof code !== 'string') {
      res.redirect('/settings?error=no_code');
      return;
    }

    // State contains the accountant ID
    const accountantId = state as string;

    if (!accountantId) {
      res.redirect('/settings?error=no_state');
      return;
    }

    // Exchange code for tokens
    const tokens = await getTokensFromCode(code);

    // Create the GettingDocs root folder in their Drive
    const rootFolder = await getOrCreateRootFolder(tokens);

    // Store tokens and folder ID in database
    await storeGoogleTokens(accountantId, tokens, rootFolder.id);

    // Redirect back to settings with success
    // In production, redirect to frontend URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/settings?google=connected`);

  } catch (error) {
    console.error('Error in Google OAuth callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/settings?error=google_failed`);
  }
});

export default router;
