import { db } from '../lib/db.js';

export const auth = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    // Look up accountant by API token
    const result = await db.query(
      `SELECT id, email, practice_name FROM accountants WHERE api_token = $1`,
      [token]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.accountant = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Export as 'authenticate' as well for compatibility
export const authenticate = auth;
