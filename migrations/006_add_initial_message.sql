-- Migration: Add initial_message template to campaigns
-- This allows users to customize the initial message sent to clients

ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS initial_message TEXT;

-- Add helpful comment
COMMENT ON COLUMN campaigns.initial_message IS 'Custom template for initial message sent to clients. Supports variables: {client_name}, {document_type}, {period}, {practice_name}';
