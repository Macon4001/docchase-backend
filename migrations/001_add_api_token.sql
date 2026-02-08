-- Migration: Add api_token column to accountants table
-- This allows token-based authentication for the API

ALTER TABLE accountants
ADD COLUMN IF NOT EXISTS api_token VARCHAR(255) UNIQUE;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_accountants_api_token ON accountants(api_token);
