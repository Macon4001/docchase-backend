# Stripe Environment Variables Setup Guide

## 📋 Environment Variables You Need to Add

### Backend `.env` File

Add these 5 variables to your `docchase-backend/.env` file:

```env
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxx

# Stripe Webhook Secret
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# Stripe Price IDs
STRIPE_STARTER_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PRO_PRICE_ID=price_xxxxxxxxxxxxxxxxxxxxx
```

---

## 🔧 How to Get These Values

### Step 1: Create Stripe Account
1. Go to https://stripe.com
2. Sign up or log in
3. Make sure you're in **Test Mode** (toggle in top right)

### Step 2: Get API Keys

1. Go to **Developers** → **API Keys**
2. Copy your keys:
   - **Publishable key** (starts with `pk_test_`)
   - **Secret key** (starts with `sk_test_`) - Click "Reveal test key"

```env
STRIPE_SECRET_KEY=sk_test_51Abc123...
STRIPE_PUBLISHABLE_KEY=pk_test_51Abc123...
```

### Step 3: Create Products & Get Price IDs

#### Create Starter Plan:
1. Go to **Products** → **Add Product**
2. Fill in:
   - **Name:** `GettingDocs Starter`
   - **Description:** `Up to 15 clients, unlimited chases`
   - **Pricing:**
     - Price: `29.00`
     - Currency: `GBP`
     - Billing period: `Monthly`
     - Recurring
3. Click **Save**
4. Copy the **Price ID** (starts with `price_`)

```env
STRIPE_STARTER_PRICE_ID=price_1Abc123...
```

#### Create Pro Plan:
1. Go to **Products** → **Add Product**
2. Fill in:
   - **Name:** `GettingDocs Pro`
   - **Description:** `Up to 50 clients, unlimited chases, BankToFile included`
   - **Pricing:**
     - Price: `59.00`
     - Currency: `GBP`
     - Billing period: `Monthly`
     - Recurring
3. Click **Save**
4. Copy the **Price ID** (starts with `price_`)

```env
STRIPE_PRO_PRICE_ID=price_1Xyz789...
```

### Step 4: Set Up Webhook

#### For Local Development (Testing):

1. **Install Stripe CLI:**
   ```bash
   # Mac
   brew install stripe/stripe-cli/stripe

   # Windows
   # Download from: https://github.com/stripe/stripe-cli/releases

   # Linux
   wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_linux_amd64.tar.gz
   tar -xvf stripe_linux_amd64.tar.gz
   ```

2. **Login to Stripe:**
   ```bash
   stripe login
   ```

3. **Forward webhooks to your local server:**
   ```bash
   stripe listen --forward-to localhost:3001/api/webhooks/stripe
   ```

4. **Copy the webhook secret** from the output (starts with `whsec_`)
   ```
   > Ready! You are using Stripe API Version [2024-12-18]. Your webhook signing secret is whsec_xxxxx
   ```

5. **Add to .env:**
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
   ```

#### For Production (Deployed):

1. Go to **Developers** → **Webhooks**
2. Click **Add Endpoint**
3. Fill in:
   - **Endpoint URL:** `https://your-backend-domain.com/api/webhooks/stripe`
   - **Events to listen to:** Select these events:
     - ✅ `checkout.session.completed`
     - ✅ `customer.subscription.updated`
     - ✅ `customer.subscription.deleted`
     - ✅ `invoice.payment_failed`
4. Click **Add Endpoint**
5. Click on your newly created endpoint
6. Copy the **Signing Secret** (starts with `whsec_`)

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

---

## 📝 Complete Backend `.env` Example

Your `docchase-backend/.env` should look like this:

```env
# Server
PORT=3001
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/docchase

# Twilio (WhatsApp messaging)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=whatsapp:+14155238886

# Google Drive OAuth (for document storage)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/settings/google-callback

# Anthropic Claude (for Amy AI responses)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx

# BankToFile API (for PDF to CSV conversion)
BANKTOFILE_API_KEY=your-banktofile-api-key

# Cron Secret (for scheduled tasks)
CRON_SECRET=your-random-cron-secret

# API URL (public-facing URL)
API_URL=https://your-backend.railway.app

# ⭐ Stripe (for subscription billing) - ADD THESE
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
STRIPE_STARTER_PRICE_ID=price_your_starter_price_id_here
STRIPE_PRO_PRICE_ID=price_your_pro_price_id_here
```

---

## 🚀 After Adding Environment Variables

### 1. Run Database Migration

```bash
cd docchase-backend
psql $DATABASE_URL -f migrations/008_add_stripe_subscription.sql
```

Or connect to your database and run the SQL manually.

### 2. Restart Backend Server

```bash
cd docchase-backend
npm run dev
```

### 3. Test the Integration

1. Start the frontend: `cd docchase-frontend && npm run dev`
2. Log in to your account
3. Go to `/pricing` page
4. Click "Get Started" on Starter or Pro
5. You should be redirected to Stripe Checkout
6. Use test card: `4242 4242 4242 4242`
7. Complete checkout
8. You should be redirected back to dashboard

---

## 🧪 Testing with Stripe Test Cards

Stripe provides test cards for different scenarios:

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | ✅ Success |
| `4000 0000 0000 0002` | ❌ Card declined |
| `4000 0025 0000 3155` | 🔐 Requires authentication |

- **Expiry:** Any future date (e.g., `12/25`)
- **CVC:** Any 3 digits (e.g., `123`)
- **ZIP:** Any 5 digits (e.g., `12345`)

---

## 🔄 Going Live (When Ready)

When you're ready to accept real payments:

1. **Switch to Live Mode** in Stripe Dashboard (toggle in top right)
2. **Get Live API Keys** from Developers → API Keys
3. **Create Live Products** (same as test, but in live mode)
4. **Create Live Webhook** (same URL, but in live mode)
5. **Update `.env` with live keys:**
   ```env
   STRIPE_SECRET_KEY=sk_live_xxxxx
   STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
   STRIPE_WEBHOOK_SECRET=whsec_xxxxx (from live webhook)
   STRIPE_STARTER_PRICE_ID=price_xxxxx (live price ID)
   STRIPE_PRO_PRICE_ID=price_xxxxx (live price ID)
   ```

---

## ⚠️ Important Security Notes

1. **Never commit `.env` file to git** (it's in `.gitignore`)
2. **Never share your secret keys** publicly
3. **Use test keys for development** (`sk_test_`, `pk_test_`)
4. **Use live keys only in production** (`sk_live_`, `pk_live_`)
5. **Keep webhook secret safe** - it verifies webhook authenticity

---

## 🆘 Troubleshooting

### "Configuration error" when clicking Get Started
- ✅ Check that `STRIPE_STARTER_PRICE_ID` and `STRIPE_PRO_PRICE_ID` are set
- ✅ Verify Price IDs are correct (copy from Stripe Dashboard)

### Webhook not receiving events
- ✅ For local dev: Make sure `stripe listen` is running
- ✅ For production: Check webhook URL is publicly accessible
- ✅ Verify webhook secret matches your `.env`

### "No token provided" error
- ✅ Make sure you're logged in
- ✅ Check browser console for errors
- ✅ Clear localStorage and log in again

---

## 📚 Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Full Implementation Guide](STRIPE_IMPLEMENTATION.md)

---

## ✅ Checklist

- [ ] Created Stripe account
- [ ] Got API keys (secret & publishable)
- [ ] Created Starter product (£29/month)
- [ ] Created Pro product (£59/month)
- [ ] Got both Price IDs
- [ ] Set up webhook (local or production)
- [ ] Got webhook signing secret
- [ ] Added all 5 variables to `.env`
- [ ] Ran database migration
- [ ] Restarted backend server
- [ ] Tested checkout flow with test card

Once all checkboxes are complete, your Stripe integration is ready! 🎉
