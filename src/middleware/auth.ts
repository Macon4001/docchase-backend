import { Request, Response, NextFunction } from 'express';
import { db } from '../lib/db.js';
import { Accountant, AuthenticatedRequest } from '../types/index.js';

export const auth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[Auth] No token provided or invalid format');
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    console.log('[Auth] Received token:', token.substring(0, 10) + '...', 'length:', token.length);

    // Look up accountant by API token
    const result = await db.query<Accountant>(
      `SELECT id, email, practice_name FROM accountants WHERE api_token = $1`,
      [token]
    );

    console.log('[Auth] Database lookup result:', result.rows.length > 0 ? 'Found' : 'Not found');

    if (!result.rows[0]) {
      console.log('[Auth] Invalid token - no matching accountant');
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    console.log('[Auth] Authenticated:', result.rows[0].email);

    // Attach accountant to request
    (req as AuthenticatedRequest).accountant = {
      id: result.rows[0].id,
      email: result.rows[0].email,
      practice_name: result.rows[0].practice_name,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Export as 'authenticate' as well for compatibility
export const authenticate = auth;
