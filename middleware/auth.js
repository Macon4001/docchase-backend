import { db } from '../lib/db.js';

export const auth = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    // For now, we'll use a simple token lookup in the database
    // In production, you'd want to use JWT tokens
    const result = await db.query(
      `SELECT id, email, name FROM accountants WHERE api_token = $1`,
      [token]
    );

    if (!result.rows[0]) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};
