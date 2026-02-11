-- Add status column to messages table for tracking Twilio delivery status
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'queued';

-- Add index for faster status queries
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- Add comment to document the column
COMMENT ON COLUMN messages.status IS 'Twilio message status: queued, sending, sent, delivered, undelivered, failed';
