import express, { Request, Response } from 'express';
import { google } from 'googleapis';
import { db } from '../../lib/db.js';
import crypto from 'crypto';
import { Accountant } from '../../types/index.js';

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_LOGIN_REDIRECT_URI = process.env.GOOGLE_LOGIN_REDIRECT_URI || 'http://localhost:3001/api/auth/google/callback';

/**
 * GET /api/auth/google
 * Initiates Google OAuth login flow
 */
router.get('/', (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(500).json({ error: 'Google OAuth not configured' });
    return;
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_LOGIN_REDIRECT_URI
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'select_account'
  });

  res.json({ authUrl });
});

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;

  if (error) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=google_auth_failed`);
    return;
  }

  if (!code || typeof code !== 'string') {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=no_code`);
    return;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_LOGIN_REDIRECT_URI
    );

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    const googleEmail = userInfo.data.email;
    const googleName = userInfo.data.name || 'Unknown';

    if (!googleEmail) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/login?error=no_email`);
      return;
    }

    // Check if user exists
    let accountant = await db.query<Accountant>(
      'SELECT id, email, practice_name, api_token FROM accountants WHERE email = $1',
      [googleEmail.toLowerCase()]
    );

    let apiToken: string;
    let accountantId: string;
    let practiceName: string;

    if (accountant.rows.length === 0) {
      // Create new account
      apiToken = crypto.randomBytes(32).toString('hex');

      const newAccountant = await db.query<Accountant>(
        `INSERT INTO accountants (email, password_hash, practice_name, api_token)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, practice_name, api_token`,
        [
          googleEmail.toLowerCase(),
          '', // No password for Google auth users
          googleName, // Use Google name as practice name initially
          apiToken
        ]
      );

      accountantId = newAccountant.rows[0].id;
      practiceName = newAccountant.rows[0].practice_name;
    } else {
      // Existing account - update token if needed
      apiToken = accountant.rows[0].api_token || crypto.randomBytes(32).toString('hex');
      accountantId = accountant.rows[0].id;
      practiceName = accountant.rows[0].practice_name;

      if (!accountant.rows[0].api_token) {
        await db.query(
          'UPDATE accountants SET api_token = $1 WHERE id = $2',
          [apiToken, accountantId]
        );
      }
    }

    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/google-callback?token=${encodeURIComponent(apiToken)}&id=${encodeURIComponent(accountantId)}&email=${encodeURIComponent(googleEmail)}&practice_name=${encodeURIComponent(practiceName)}`;

    console.log('[Google Auth] Redirecting with token length:', apiToken.length);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
});

export default router;
