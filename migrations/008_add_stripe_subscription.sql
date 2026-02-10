-- Add Stripe subscription fields to accountants table
-- This enables subscription management and billing through Stripe

ALTER TABLE accountants
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(20) DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS client_limit INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS chase_limit INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS chases_used INTEGER DEFAULT 0;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_accountants_stripe_customer_id ON accountants(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_accountants_subscription_status ON accountants(subscription_status);

-- Add comments for documentation
COMMENT ON COLUMN accountants.stripe_customer_id IS 'Stripe customer ID for billing';
COMMENT ON COLUMN accountants.subscription_status IS 'Subscription status: free, active, past_due, cancelled';
COMMENT ON COLUMN accountants.subscription_plan IS 'Current plan: free, starter, pro';
COMMENT ON COLUMN accountants.subscription_id IS 'Stripe subscription ID';
COMMENT ON COLUMN accountants.subscription_ends_at IS 'When the subscription ends or next billing date';
COMMENT ON COLUMN accountants.client_limit IS 'Maximum number of clients allowed';
COMMENT ON COLUMN accountants.chase_limit IS 'Maximum total chases allowed (NULL = unlimited)';
COMMENT ON COLUMN accountants.chases_used IS 'Number of chases used on free plan';
