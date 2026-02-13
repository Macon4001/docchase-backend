import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';

const ADMIN_EMAIL = 'macon4001@gmail.com';

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const accountant = (req as AuthenticatedRequest).accountant;

    if (!accountant) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (accountant.email !== ADMIN_EMAIL) {
      console.log(`[Admin] Access denied for ${accountant.email}`);
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    console.log(`[Admin] Access granted for ${accountant.email}`);
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(403).json({ error: 'Admin access denied' });
  }
};
