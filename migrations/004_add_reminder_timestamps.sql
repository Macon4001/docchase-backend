-- Add reminder timestamp columns to campaign_clients table
-- These track when each reminder was sent

ALTER TABLE campaign_clients
ADD COLUMN IF NOT EXISTS reminder_3_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS reminder_6_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS stuck_at TIMESTAMP;

-- Add index for efficient reminder queries
CREATE INDEX IF NOT EXISTS idx_campaign_clients_reminders
ON campaign_clients(status, first_message_sent_at, reminder_3_sent_at, reminder_6_sent_at);

-- Add comment
COMMENT ON COLUMN campaign_clients.reminder_3_sent_at IS 'Timestamp when day 3 reminder was sent';
COMMENT ON COLUMN campaign_clients.reminder_6_sent_at IS 'Timestamp when day 6 reminder was sent';
COMMENT ON COLUMN campaign_clients.stuck_at IS 'Timestamp when client was flagged as stuck (day 9+)';
