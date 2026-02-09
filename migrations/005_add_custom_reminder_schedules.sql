-- Migration: Add custom reminder schedule configuration to campaigns
-- This allows users to set custom days and times for reminders instead of fixed 3/6/9 days

ALTER TABLE campaigns
-- Custom days for each reminder (default to 3, 6, 9 for backward compatibility)
ADD COLUMN IF NOT EXISTS reminder_1_days INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS reminder_2_days INTEGER DEFAULT 6,
ADD COLUMN IF NOT EXISTS reminder_3_days INTEGER DEFAULT 9,

-- Time of day to send reminders (default to 10:00 AM)
-- Format: HH:MM in 24-hour format
ADD COLUMN IF NOT EXISTS reminder_send_time TIME DEFAULT '10:00:00',

-- Timezone for the reminder send time (default to user's local timezone)
ADD COLUMN IF NOT EXISTS reminder_timezone VARCHAR(50) DEFAULT 'America/New_York';

-- Add helpful comment
COMMENT ON COLUMN campaigns.reminder_1_days IS 'Days after initial message to send first reminder';
COMMENT ON COLUMN campaigns.reminder_2_days IS 'Days after initial message to send second reminder';
COMMENT ON COLUMN campaigns.reminder_3_days IS 'Days after initial message to send third reminder (or flag as stuck)';
COMMENT ON COLUMN campaigns.reminder_send_time IS 'Time of day to send reminders (HH:MM format)';
COMMENT ON COLUMN campaigns.reminder_timezone IS 'Timezone for reminder send time';
