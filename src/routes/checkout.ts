import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../lib/db.js';
import { auth } from '../middleware/auth.js';
import { AuthenticatedRequest } from '../types/index.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

interface CheckoutBody {
  plan: 'starter' | 'pro';
}

// POST /api/checkout - Create a Stripe Checkout session
router.post('/', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { plan } = req.body as CheckoutBody;
    const authenticatedReq = req as AuthenticatedRequest;
    const accountantId = authenticatedReq.accountant?.id;

    if (!accountantId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Validate plan
    if (!plan || (plan !== 'starter' && plan !== 'pro')) {
      res.status(400).json({ success: false, error: 'Invalid plan' });
      return;
    }

    // Get price ID based on plan
    const priceId =
      plan === 'pro'
        ? process.env.STRIPE_PRO_PRICE_ID
        : process.env.STRIPE_STARTER_PRICE_ID;

    if (!priceId) {
      console.error(`Missing Stripe price ID for plan: ${plan}`);
      res.status(500).json({ success: false, error: 'Configuration error' });
      return;
    }

    // Get accountant
    const accountant = await db.query(
      'SELECT * FROM accountants WHERE id = $1',
      [accountantId]
    );

    if (!accountant.rows[0]) {
      res.status(404).json({ success: false, error: 'Accountant not found' });
      return;
    }

    const acc = accountant.rows[0];
    let customerId = acc.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: acc.email,
        metadata: {
          accountant_id: accountantId.toString(),
        },
      });
      customerId = customer.id;

      // Save customer ID
      await db.query(
        'UPDATE accountants SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, accountantId]
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/dashboard?upgraded=true`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?cancelled=true`,
      metadata: {
        accountant_id: accountantId.toString(),
        plan: plan,
      },
    });

    res.json({
      success: true,
      url: session.url,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session',
    });
  }
});

export default router;
