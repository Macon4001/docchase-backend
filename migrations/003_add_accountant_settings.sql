-- Add settings columns to accountants table
ALTER TABLE accountants
ADD COLUMN IF NOT EXISTS amy_name VARCHAR(100) DEFAULT 'Amy',
ADD COLUMN IF NOT EXISTS amy_tone VARCHAR(50) DEFAULT 'friendly',
ADD COLUMN IF NOT EXISTS notification_email BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_stuck BOOLEAN DEFAULT true;

-- Comment on columns
COMMENT ON COLUMN accountants.amy_name IS 'Customizable name for the AI assistant';
COMMENT ON COLUMN accountants.amy_tone IS 'Tone of voice for AI messages (friendly, professional, casual)';
COMMENT ON COLUMN accountants.notification_email IS 'Send email notifications for campaign updates';
COMMENT ON COLUMN accountants.notification_stuck IS 'Send alerts for stuck clients';
