-- Add Google Drive OAuth columns to accountants table
ALTER TABLE accountants
ADD COLUMN IF NOT EXISTS google_drive_token JSONB,
ADD COLUMN IF NOT EXISTS google_drive_folder_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS google_drive_connected_at TIMESTAMP;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_accountants_google_drive ON accountants(google_drive_folder_id) WHERE google_drive_folder_id IS NOT NULL;

-- Comment on columns
COMMENT ON COLUMN accountants.google_drive_token IS 'Stores Google OAuth tokens (access_token, refresh_token, expiry_date, etc.)';
COMMENT ON COLUMN accountants.google_drive_folder_id IS 'ID of the main "Amy Documents" folder in accountant''s Google Drive';
COMMENT ON COLUMN accountants.google_drive_connected_at IS 'Timestamp when Google Drive was first connected';
