import express, { Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../../lib/db.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

/**
 * Stripe webhook handler
 * Processes subscription events from Stripe
 *
 * IMPORTANT: This route requires raw body parsing.
 * Make sure to configure this in your main app before JSON parsing:
 *
 * app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('❌ Missing Stripe signature');
    res.status(400).send('Missing signature');
    return;
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err);
    res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return;
  }

  console.log(`📥 Stripe webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const accountantId = session.metadata?.accountant_id;
        const plan = session.metadata?.plan;

        if (!accountantId || !plan) {
          console.error('❌ Missing metadata in checkout session');
          break;
        }

        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);

        // Determine client limit based on plan
        const clientLimit = plan === 'pro' ? 50 : 15;

        // Update accountant with subscription info
        await db.query(
          `UPDATE accountants
           SET
             subscription_status = 'active',
             subscription_plan = $1,
             subscription_id = $2,
             client_limit = $3,
             chase_limit = NULL,
             updated_at = NOW()
           WHERE id = $4`,
          [plan, subscription.id, clientLimit, accountantId]
        );

        console.log(`✅ Subscription activated for accountant ${accountantId}: ${plan}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find accountant by Stripe customer ID
        const accountant = await db.query(
          'SELECT id FROM accountants WHERE stripe_customer_id = $1',
          [customerId]
        );

        if (accountant.rows.length === 0) {
          console.error(`❌ Accountant not found for customer ${customerId}`);
          break;
        }

        // Map Stripe status to our status
        let status: string;
        if (subscription.status === 'active') {
          status = 'active';
        } else if (subscription.status === 'past_due') {
          status = 'past_due';
        } else {
          status = 'cancelled';
        }

        await db.query(
          `UPDATE accountants
           SET
             subscription_status = $1,
             updated_at = NOW()
           WHERE stripe_customer_id = $2`,
          [status, customerId]
        );

        console.log(`✅ Subscription updated for customer ${customerId}: ${status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Downgrade to free plan
        await db.query(
          `UPDATE accountants
           SET
             subscription_status = 'free',
             subscription_plan = 'free',
             subscription_id = NULL,
             client_limit = 1,
             chase_limit = 3,
             chases_used = 0,
             updated_at = NOW()
           WHERE stripe_customer_id = $1`,
          [customerId]
        );

        console.log(`✅ Subscription cancelled for customer ${customerId} - downgraded to free`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Mark subscription as past_due
        await db.query(
          `UPDATE accountants
           SET
             subscription_status = 'past_due',
             updated_at = NOW()
           WHERE stripe_customer_id = $1`,
          [customerId]
        );

        console.log(`⚠️ Payment failed for customer ${customerId} - marked as past_due`);

        // TODO: Send email notification about failed payment
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
