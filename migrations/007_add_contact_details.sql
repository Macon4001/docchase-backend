-- Add contact_details column to accountants table
-- This allows accountants to set their contact information that Amy can use in messages

ALTER TABLE accountants
ADD COLUMN contact_details TEXT;

COMMENT ON COLUMN accountants.contact_details IS 'Contact information for clients to reach the accountant (phone, email, etc)';
