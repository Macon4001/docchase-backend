# Stripe Integration Implementation Summary

This document summarizes the Stripe subscription integration implementation for GettingDocs (DocChase).

## ✅ Completed Implementation

### 1. Database Migration

**File:** `docchase-backend/migrations/008_add_stripe_subscription.sql`

Added the following columns to the `accountants` table:
- `stripe_customer_id` - Stripe customer ID for billing
- `subscription_status` - Status: free, active, past_due, cancelled
- `subscription_plan` - Current plan: free, starter, pro
- `subscription_id` - Stripe subscription ID
- `subscription_ends_at` - Subscription end/next billing date
- `client_limit` - Maximum clients allowed (1 for free, 15 for starter, 50 for pro)
- `chase_limit` - Maximum total chases (3 for free, NULL/unlimited for paid)
- `chases_used` - Number of chases used (free plan only)

### 2. Backend API Routes

#### Checkout Route
**File:** `docchase-backend/src/routes/checkout.ts`
- `POST /api/checkout` - Creates Stripe Checkout session
- Accepts plan parameter: 'starter' or 'pro'
- Creates Stripe customer if needed
- Returns checkout URL for redirect

#### Stripe Webhook Route
**File:** `docchase-backend/src/routes/webhooks/stripe.ts`
- `POST /api/webhooks/stripe` - Handles Stripe webhook events
- Processes subscription lifecycle events:
  - `checkout.session.completed` - Activates subscription
  - `customer.subscription.updated` - Updates subscription status
  - `customer.subscription.deleted` - Downgrades to free
  - `invoice.payment_failed` - Marks as past_due
- ⚠️ **Important:** Requires raw body parsing (configured in main app)

#### Billing Route
**File:** `docchase-backend/src/routes/billing.ts`
- `GET /api/billing` - Returns current subscription and usage info
- `POST /api/billing/portal` - Creates Stripe billing portal session

### 3. Limit Enforcement

#### Client Limit
**File:** `docchase-backend/src/routes/clients.ts`
- Modified `POST /` route to check client limits before creating
- Returns 403 error with `upgrade: true` flag when limit reached
- Checks current client count against `client_limit` from accountants table

#### Chase Limit
**File:** `docchase-backend/src/routes/campaigns.ts`
- Modified `POST /:id/start` route to check chase limits (free plan only)
- Returns 403 error with `upgrade: true` flag when limit reached
- Increments `chases_used` counter after successful campaign start
- Only applies to free plan users (paid plans have unlimited chases)

### 4. Main App Configuration

**File:** `docchase-backend/src/index.ts`
- Added Stripe webhook route BEFORE JSON body parser (requires raw body)
- Registered checkout and billing routes
- Imported new route modules

### 5. Frontend Components

#### Pricing Page
**File:** `docchase-frontend/app/pricing/page.tsx`
- Displays three pricing tiers: Free, Starter (£29/mo), Pro (£59/mo)
- Feature comparison for each plan
- "Get Started" buttons that call `/api/checkout`
- Redirects to Stripe Checkout on selection
- Handles authentication check

#### Upgrade Modal
**File:** `docchase-frontend/components/UpgradeModal.tsx`
- Reusable modal component for upgrade prompts
- Props: `isOpen`, `onClose`, `reason`, `currentCount`, `limit`
- Two reasons: `client_limit` and `chase_limit`
- Shows appropriate message and upgrade benefits
- "View Plans" button redirects to pricing page

### 6. Environment Variables

**File:** `docchase-backend/.env.example`

Added the following Stripe configuration variables:
```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
STRIPE_STARTER_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PRO_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxx
```

### 7. Dependencies

**Package:** Installed via npm in `docchase-backend/`
- `stripe@^20.3.1` - Official Stripe Node.js library
- `@types/stripe@^8.0.416` - TypeScript type definitions

---

## 📋 Setup Checklist

### Stripe Dashboard Setup (Manual Steps Required)

#### 1. Create Products in Stripe Dashboard

Go to: https://dashboard.stripe.com/products

**Product 1: Starter**
- Name: "GettingDocs Starter"
- Description: "Up to 15 clients, unlimited chases"
- Pricing: £29.00 GBP, Recurring, Monthly
- Copy the Price ID (starts with `price_`)

**Product 2: Pro**
- Name: "GettingDocs Pro"
- Description: "Up to 50 clients, unlimited chases, BankToFile included"
- Pricing: £59.00 GBP, Recurring, Monthly
- Copy the Price ID (starts with `price_`)

#### 2. Configure Webhook Endpoint

Go to: https://dashboard.stripe.com/webhooks

- Endpoint URL: `https://your-backend-domain.com/api/webhooks/stripe`
- Events to listen for:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Copy the Webhook Signing Secret (starts with `whsec_`)

#### 3. Update Environment Variables

In `docchase-backend/.env`, add:
```env
STRIPE_SECRET_KEY=sk_live_xxxxx  # or sk_test_ for testing
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx  # or pk_test_ for testing
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_STARTER_PRICE_ID=price_xxxxx  # from step 1
STRIPE_PRO_PRICE_ID=price_xxxxx  # from step 1
```

#### 4. Run Database Migration

```bash
cd docchase-backend
psql $DATABASE_URL -f migrations/008_add_stripe_subscription.sql
```

Or manually execute the SQL in your database client.

#### 5. Restart Backend Server

```bash
cd docchase-backend
npm run dev  # or npm start for production
```

---

## 🧪 Testing Guide

### Test Mode Setup

1. Use Stripe test mode keys (prefix: `sk_test_`, `pk_test_`)
2. Use test webhook endpoint for local development (use Stripe CLI or ngrok)

### Test Cards

For testing in test mode:
- **Success:** `4242 4242 4242 4242`
- **Decline:** `4000 0000 0000 0002`
- **Requires auth:** `4000 0025 0000 3155`

Any future date for expiry, any 3 digits for CVC.

### Test Scenarios

1. **New Subscription**
   - Go to `/pricing`
   - Click "Get Started" on Starter or Pro
   - Complete checkout with test card
   - Verify subscription_status = 'active' in database
   - Verify client_limit updated

2. **Client Limit**
   - Create clients up to limit
   - Try to create one more
   - Should see 403 error with upgrade prompt

3. **Chase Limit (Free Plan)**
   - Start 3 campaigns on free plan
   - Try to start 4th campaign
   - Should see 403 error with upgrade prompt

4. **Subscription Cancellation**
   - Use Stripe Dashboard to cancel subscription
   - Webhook should downgrade to free plan
   - Verify client_limit = 1, chase_limit = 3

5. **Payment Failure**
   - Simulate failed payment in Stripe Dashboard
   - Webhook should set subscription_status = 'past_due'

---

## 🔧 Usage Examples

### Using the Upgrade Modal in Components

```tsx
import { UpgradeModal } from '@/components/UpgradeModal';
import { useState } from 'react';

function MyComponent() {
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleAddClient = async () => {
    try {
      const response = await apiClient.post('/api/clients', clientData);
      // Success
    } catch (error) {
      if (error.response?.status === 403 && error.response?.data?.upgrade) {
        setShowUpgrade(true);
      }
    }
  };

  return (
    <>
      <button onClick={handleAddClient}>Add Client</button>
      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        reason="client_limit"
        currentCount={10}
        limit={15}
      />
    </>
  );
}
```

### Checking Billing Status

```tsx
import { apiClient } from '@/lib/api';

async function checkBilling() {
  const response = await apiClient.get('/api/billing');
  console.log(response.data.billing);
  // {
  //   plan: 'starter',
  //   status: 'active',
  //   clientLimit: 15,
  //   chaseLimit: null,
  //   chasesUsed: 0
  // }
}
```

### Creating Billing Portal Session

```tsx
async function openBillingPortal() {
  const response = await apiClient.post('/api/billing/portal');
  if (response.data.url) {
    window.location.href = response.data.url;
  }
}
```

---

## 📊 Pricing Tiers Summary

| Plan    | Clients | Chases         | Price     |
|---------|---------|----------------|-----------|
| Free    | 1       | 3 total        | £0        |
| Starter | 15      | Unlimited      | £29/month |
| Pro     | 50      | Unlimited      | £59/month |

---

## ⚠️ Important Notes

1. **Webhook Security:** The Stripe webhook route verifies the signature using the webhook secret. Never expose this secret.

2. **Raw Body Parsing:** The webhook route MUST be registered before the JSON body parser middleware. This is already configured in `src/index.ts`.

3. **Test vs Live Mode:** Always test with test mode keys before going live. Update keys when ready for production.

4. **Frontend URL:** Make sure `FRONTEND_URL` environment variable is set correctly for checkout success/cancel redirects.

5. **Database Defaults:** New accountants are automatically created with:
   - `subscription_plan` = 'free'
   - `subscription_status` = 'free'
   - `client_limit` = 1
   - `chase_limit` = 3
   - `chases_used` = 0

6. **Webhook Retries:** Stripe will retry failed webhooks. Make sure webhook processing is idempotent.

---

## 🚀 Next Steps (Optional Enhancements)

1. **Email Notifications**
   - Send email when subscription is activated
   - Send email when payment fails
   - Send email before subscription ends

2. **Billing Page**
   - Create `/settings/billing` page
   - Show current plan details
   - Display usage statistics
   - Button to manage subscription (billing portal)

3. **Usage Dashboard**
   - Show clients used / limit
   - Show chases used / limit (free plan)
   - Progress bars for visual feedback

4. **Prorated Upgrades**
   - Allow upgrading from Starter to Pro
   - Stripe handles proration automatically

5. **Annual Billing**
   - Add yearly pricing options (with discount)
   - Create additional Price IDs in Stripe

6. **Trial Period**
   - Add 14-day trial to paid plans
   - Configure in Stripe product settings

---

## 🐛 Troubleshooting

### Webhook not receiving events
- Check webhook endpoint URL is correct and publicly accessible
- Verify webhook secret matches Stripe dashboard
- Check server logs for errors
- Use Stripe CLI for local testing: `stripe listen --forward-to localhost:3001/api/webhooks/stripe`

### Checkout not working
- Verify price IDs are correct in environment variables
- Check FRONTEND_URL is set correctly
- Ensure user is authenticated
- Check browser console for errors

### Limits not enforcing
- Verify database migration ran successfully
- Check accountant record has correct limit values
- Review server logs for query errors

### Payment fails but webhook doesn't fire
- Check webhook is configured with correct events
- Verify endpoint is reachable (use webhook testing in Stripe)
- Check webhook logs in Stripe Dashboard

---

## 📚 Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Checkout Documentation](https://stripe.com/docs/payments/checkout)
- [Stripe Billing Portal](https://stripe.com/docs/billing/subscriptions/integrating-customer-portal)
- [Stripe Testing](https://stripe.com/docs/testing)

---

## ✅ Implementation Complete

All core subscription functionality has been implemented. The system is ready for testing in Stripe test mode. Follow the setup checklist above to configure Stripe and begin testing.
