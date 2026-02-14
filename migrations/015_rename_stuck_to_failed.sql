-- Rename stuck status to failed for better clarity
UPDATE campaign_clients SET status = 'failed' WHERE status = 'stuck';
COMMENT ON COLUMN campaign_clients.stuck_at IS 'Timestamp when client was flagged as failed';
