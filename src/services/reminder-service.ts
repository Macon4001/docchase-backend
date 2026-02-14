import cron from 'node-cron';
import { db } from '../lib/db.js';
import { sendDocumentReminder } from '../lib/twilio.js';

interface CampaignClient {
  id: string;
  campaign_id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  first_message_sent_at: Date;
  status: string;
  accountant_id: string;
  practice_name: string;
  amy_name: string;
  document_type: string;
  period: string;
  reminder_day_3: boolean;
  reminder_day_6: boolean;
  flag_after_day_9: boolean;
  // New custom schedule fields
  reminder_1_days: number;
  reminder_2_days: number;
  reminder_3_days: number;
  reminder_send_time: string;
  reminder_timezone: string;
}

/**
 * Check if we should send reminders at this time
 * Compares current time with the campaign's configured send time
 */
function shouldSendNow(sendTime: string, timezone: string): boolean {
  try {
    const now = new Date();
    const [hours, minutes] = sendTime.split(':').map(Number);

    // Get current hour and minute in the specified timezone
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Allow sending within a 1-hour window of the specified time
    // This accounts for the cron running every hour
    const timeDiff = Math.abs((currentHour * 60 + currentMinute) - (hours * 60 + minutes));

    return timeDiff < 60; // Within 1 hour window
  } catch (error) {
    console.error('Error checking send time:', error);
    return true; // Default to sending if there's an error
  }
}

/**
 * Send First Reminder (Reminder 1)
 * Sends reminder to clients based on campaign's custom reminder_1_days setting
 */
export async function sendReminder1(): Promise<{ success: number; failed: number; errors: string[] }> {
  console.log('🔔 [Reminder Service] Checking for Reminder 1...');

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // Find clients who need first reminder based on custom schedule
    // Uses reminder_1_days from campaign settings
    const query = `
      SELECT
        cc.id,
        cc.campaign_id,
        cc.client_id,
        c.name as client_name,
        c.phone as client_phone,
        cc.first_message_sent_at,
        cc.status,
        camp.accountant_id,
        acc.practice_name,
        acc.amy_name,
        camp.document_type,
        camp.period,
        camp.reminder_day_3,
        camp.reminder_day_6,
        camp.flag_after_day_9,
        camp.reminder_1_days,
        camp.reminder_2_days,
        camp.reminder_3_days,
        camp.reminder_send_time,
        camp.reminder_timezone
      FROM campaign_clients cc
      JOIN clients c ON cc.client_id = c.id
      JOIN campaigns camp ON cc.campaign_id = camp.id
      JOIN accountants acc ON camp.accountant_id = acc.id
      WHERE cc.status = 'pending'
        AND camp.reminder_day_3 = true
        AND cc.reminder_3_sent_at IS NULL
        AND cc.first_message_sent_at IS NOT NULL
        AND cc.first_message_sent_at <= NOW() - (camp.reminder_1_days || ' days')::INTERVAL
    `;

    const result = await db.query<CampaignClient>(query);

    if (result.rows.length === 0) {
      console.log('📭 No clients need Reminder 1');
      return results;
    }

    console.log(`📬 Found ${result.rows.length} clients needing Reminder 1`);

    // Group clients by send time to check if we should send now
    const clientsToSend = result.rows.filter(client =>
      shouldSendNow(client.reminder_send_time, client.reminder_timezone)
    );

    if (clientsToSend.length === 0) {
      console.log('⏰ Not the right time to send reminders yet');
      return results;
    }

    console.log(`⏰ Sending to ${clientsToSend.length} clients (right time window)`);

    // Send reminder to each client
    for (const client of clientsToSend) {
      try {
        // Create document description (e.g., "January 2026 bank statement")
        const documentDescription = `${client.period} ${client.document_type.replace('_', ' ')}`;

        // Send WhatsApp reminder using approved template
        await sendDocumentReminder(
          client.client_phone,
          client.client_name,
          documentDescription,
          client.accountant_id,
          client.client_id,
          client.campaign_id
        );

        // Update campaign_clients to mark reminder 1 sent
        await db.query(
          `UPDATE campaign_clients
           SET reminder_3_sent_at = NOW()
           WHERE id = $1`,
          [client.id]
        );

        results.success++;
        console.log(`✅ Reminder 1 (Day ${client.reminder_1_days}) sent to ${client.client_name} (${client.client_phone})`);
      } catch (error) {
        results.failed++;
        const errorMsg = `Failed to send Reminder 1 to ${client.client_name}: ${error}`;
        results.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }
  } catch (error) {
    console.error('❌ Error in sendReminder1:', error);
    results.errors.push(`Database error: ${error}`);
  }

  console.log(`📊 Reminder 1 - Success: ${results.success}, Failed: ${results.failed}`);
  return results;
}

/**
 * Send Second Reminder (Reminder 2)
 * Sends second reminder to clients based on campaign's custom reminder_2_days setting
 */
export async function sendReminder2(): Promise<{ success: number; failed: number; errors: string[] }> {
  console.log('🔔 [Reminder Service] Checking for Reminder 2...');

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    const query = `
      SELECT
        cc.id,
        cc.campaign_id,
        cc.client_id,
        c.name as client_name,
        c.phone as client_phone,
        cc.first_message_sent_at,
        cc.status,
        camp.accountant_id,
        acc.practice_name,
        acc.amy_name,
        camp.document_type,
        camp.period,
        camp.reminder_day_3,
        camp.reminder_day_6,
        camp.flag_after_day_9,
        camp.reminder_1_days,
        camp.reminder_2_days,
        camp.reminder_3_days,
        camp.reminder_send_time,
        camp.reminder_timezone
      FROM campaign_clients cc
      JOIN clients c ON cc.client_id = c.id
      JOIN campaigns camp ON cc.campaign_id = camp.id
      JOIN accountants acc ON camp.accountant_id = acc.id
      WHERE cc.status = 'pending'
        AND camp.reminder_day_6 = true
        AND cc.reminder_6_sent_at IS NULL
        AND cc.first_message_sent_at IS NOT NULL
        AND cc.first_message_sent_at <= NOW() - (camp.reminder_2_days || ' days')::INTERVAL
    `;

    const result = await db.query<CampaignClient>(query);

    if (result.rows.length === 0) {
      console.log('📭 No clients need Reminder 2');
      return results;
    }

    console.log(`📬 Found ${result.rows.length} clients needing Reminder 2`);

    const clientsToSend = result.rows.filter(client =>
      shouldSendNow(client.reminder_send_time, client.reminder_timezone)
    );

    if (clientsToSend.length === 0) {
      console.log('⏰ Not the right time to send reminders yet');
      return results;
    }

    console.log(`⏰ Sending to ${clientsToSend.length} clients (right time window)`);

    for (const client of clientsToSend) {
      try {
        // Create document description (e.g., "January 2026 bank statement")
        const documentDescription = `${client.period} ${client.document_type.replace('_', ' ')}`;

        // Send WhatsApp reminder using approved template
        await sendDocumentReminder(
          client.client_phone,
          client.client_name,
          documentDescription,
          client.accountant_id,
          client.client_id,
          client.campaign_id
        );

        await db.query(
          `UPDATE campaign_clients
           SET reminder_6_sent_at = NOW()
           WHERE id = $1`,
          [client.id]
        );

        results.success++;
        console.log(`✅ Reminder 2 (Day ${client.reminder_2_days}) sent to ${client.client_name} (${client.client_phone})`);
      } catch (error) {
        results.failed++;
        const errorMsg = `Failed to send Reminder 2 to ${client.client_name}: ${error}`;
        results.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }
  } catch (error) {
    console.error('❌ Error in sendReminder2:', error);
    results.errors.push(`Database error: ${error}`);
  }

  console.log(`📊 Reminder 2 - Success: ${results.success}, Failed: ${results.failed}`);
  return results;
}

/**
 * Flag Failed Clients
 * Marks clients as "failed" based on campaign's custom reminder_3_days setting
 */
export async function flagFailedClients(): Promise<{ flagged: number; errors: string[] }> {
  console.log('🚩 [Reminder Service] Checking for failed clients...');

  const results = {
    flagged: 0,
    errors: [] as string[],
  };

  try {
    const query = `
      SELECT
        cc.id,
        c.name as client_name,
        cc.first_message_sent_at,
        camp.reminder_3_days
      FROM campaign_clients cc
      JOIN clients c ON cc.client_id = c.id
      JOIN campaigns camp ON cc.campaign_id = camp.id
      WHERE cc.status = 'pending'
        AND camp.flag_after_day_9 = true
        AND cc.first_message_sent_at IS NOT NULL
        AND cc.first_message_sent_at <= NOW() - (camp.reminder_3_days || ' days')::INTERVAL
    `;

    const result = await db.query<{ id: string; client_name: string; first_message_sent_at: Date; reminder_3_days: number }>(query);

    if (result.rows.length === 0) {
      console.log('✅ No clients to flag as failed');
      return results;
    }

    console.log(`🚩 Found ${result.rows.length} clients to flag as failed`);

    for (const client of result.rows) {
      try {
        await db.query(
          `UPDATE campaign_clients
           SET status = 'failed', stuck_at = NOW()
           WHERE id = $1`,
          [client.id]
        );

        results.flagged++;
        console.log(`🚩 Marked ${client.client_name} as failed (Day ${client.reminder_3_days})`);
      } catch (error) {
        const errorMsg = `Failed to flag ${client.client_name} as failed: ${error}`;
        results.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }
  } catch (error) {
    console.error('❌ Error in flagFailedClients:', error);
    results.errors.push(`Database error: ${error}`);
  }

  console.log(`📊 Failed Clients - Flagged: ${results.flagged}`);
  return results;
}

/**
 * Run All Reminder Checks
 * Checks and processes all reminder types
 */
export async function runAllReminderChecks(): Promise<void> {
  console.log('\n⏰ ===== Running Scheduled Reminder Checks =====');
  console.log(`📅 Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Run all checks in sequence
    await sendReminder1();
    await sendReminder2();
    await flagFailedClients();
  } catch (error) {
    console.error('❌ Error in runAllReminderChecks:', error);
  }

  console.log('\n⏰ ===== Reminder Check Complete =====\n');
}

/**
 * Start Scheduled Jobs
 * Sets up cron jobs to run reminder checks automatically
 */
export function startScheduledJobs(): void {
  // Run every hour at minute 0
  // This checks if any reminders need to be sent based on each campaign's custom schedule
  cron.schedule('0 * * * *', async () => {
    await runAllReminderChecks();
  });

  console.log('✅ Scheduled reminder jobs started (runs every hour)');
  console.log('   - Checks for Reminder 1 (custom days per campaign)');
  console.log('   - Checks for Reminder 2 (custom days per campaign)');
  console.log('   - Checks for failed clients (custom days per campaign)');
  console.log('   - Respects each campaign\'s configured send time\n');
}

// Keep legacy function names for backward compatibility with test endpoints
export const sendDay3Reminders = sendReminder1;
export const sendDay6Reminders = sendReminder2;
export const flagStuckClients = flagFailedClients; // Legacy name compatibility
