-- Add drive_folder_id column to documents table
-- This stores the Google Drive folder ID where the document is stored

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS drive_folder_id VARCHAR(255);

-- Add index for faster folder lookups
CREATE INDEX IF NOT EXISTS idx_documents_drive_folder_id ON documents(drive_folder_id);
