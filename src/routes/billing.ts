import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../lib/db.js';
import { auth } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

interface BillingInfo {
  plan: string;
  status: string;
  clientLimit: number;
  chaseLimit: number | null;
  chasesUsed: number;
}

// GET /api/billing - Get current subscription and billing info
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant?.id;

    if (!accountantId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const accountant = await db.query(
      `SELECT
         subscription_plan,
         subscription_status,
         client_limit,
         chase_limit,
         chases_used
       FROM accountants
       WHERE id = $1`,
      [accountantId]
    );

    if (!accountant.rows[0]) {
      res.status(404).json({ success: false, error: 'Accountant not found' });
      return;
    }

    const acc = accountant.rows[0];

    const billing: BillingInfo = {
      plan: acc.subscription_plan || 'free',
      status: acc.subscription_status || 'free',
      clientLimit: acc.client_limit || 1,
      chaseLimit: acc.chase_limit,
      chasesUsed: acc.chases_used || 0,
    };

    res.json({
      success: true,
      billing,
    });
  } catch (error) {
    console.error('Billing fetch error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch billing' });
  }
});

// POST /api/billing/portal - Create Stripe billing portal session
router.post('/portal', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant?.id;

    if (!accountantId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const accountant = await db.query(
      'SELECT stripe_customer_id FROM accountants WHERE id = $1',
      [accountantId]
    );

    if (!accountant.rows[0]) {
      res.status(404).json({ success: false, error: 'Accountant not found' });
      return;
    }

    const customerId = accountant.rows[0].stripe_customer_id;

    if (!customerId) {
      res.status(400).json({
        success: false,
        error: 'No billing account found',
      });
      return;
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.FRONTEND_URL}/settings`,
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error('Portal error:', error);
    res.status(500).json({ success: false, error: 'Failed to create portal session' });
  }
});

export default router;
