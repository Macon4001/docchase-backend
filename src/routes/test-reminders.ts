import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { sendDay3Reminders, sendDay6Reminders, flagStuckClients, runAllReminderChecks } from '../services/reminder-service.js';

const router = express.Router();

// Only allow these routes in development
const isDevelopment = process.env.NODE_ENV === 'development';

if (!isDevelopment) {
  console.log('⚠️ Test reminder routes disabled (not in development mode)');
}

/**
 * Test Day 3 Reminder
 * GET /api/test-reminders/day-3
 * Manually triggers day 3 reminder check
 */
router.get('/day-3', authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!isDevelopment) {
    res.status(403).json({ error: 'Test endpoints only available in development' });
    return;
  }

  try {
    console.log('\n🧪 ===== MANUAL TEST: Day 3 Reminders =====');
    const results = await sendDay3Reminders();

    res.json({
      success: true,
      test: 'day-3-reminders',
      results: {
        success: results.success,
        failed: results.failed,
        errors: results.errors,
      },
      message: `Processed ${results.success + results.failed} clients`,
    });
  } catch (error) {
    console.error('❌ Test Day 3 Reminders error:', error);
    res.status(500).json({ error: 'Failed to run day 3 reminder test' });
  }
});

/**
 * Test Day 6 Reminder
 * GET /api/test-reminders/day-6
 * Manually triggers day 6 reminder check
 */
router.get('/day-6', authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!isDevelopment) {
    res.status(403).json({ error: 'Test endpoints only available in development' });
    return;
  }

  try {
    console.log('\n🧪 ===== MANUAL TEST: Day 6 Reminders =====');
    const results = await sendDay6Reminders();

    res.json({
      success: true,
      test: 'day-6-reminders',
      results: {
        success: results.success,
        failed: results.failed,
        errors: results.errors,
      },
      message: `Processed ${results.success + results.failed} clients`,
    });
  } catch (error) {
    console.error('❌ Test Day 6 Reminders error:', error);
    res.status(500).json({ error: 'Failed to run day 6 reminder test' });
  }
});

/**
 * Test Day 9 Stuck Flagging
 * GET /api/test-reminders/day-9
 * Manually triggers day 9 stuck client check
 */
router.get('/day-9', authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!isDevelopment) {
    res.status(403).json({ error: 'Test endpoints only available in development' });
    return;
  }

  try {
    console.log('\n🧪 ===== MANUAL TEST: Day 9 Stuck Flagging =====');
    const results = await flagStuckClients();

    res.json({
      success: true,
      test: 'day-9-stuck',
      results: {
        flagged: results.flagged,
        errors: results.errors,
      },
      message: `Flagged ${results.flagged} clients as stuck`,
    });
  } catch (error) {
    console.error('❌ Test Day 9 Stuck error:', error);
    res.status(500).json({ error: 'Failed to run day 9 stuck test' });
  }
});

/**
 * Test All Reminders
 * GET /api/test-reminders/all
 * Manually triggers all reminder checks (day 3, 6, 9)
 */
router.get('/all', authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!isDevelopment) {
    res.status(403).json({ error: 'Test endpoints only available in development' });
    return;
  }

  try {
    console.log('\n🧪 ===== MANUAL TEST: All Reminders =====');

    const day3 = await sendDay3Reminders();
    const day6 = await sendDay6Reminders();
    const day9 = await flagStuckClients();

    res.json({
      success: true,
      test: 'all-reminders',
      results: {
        day3: {
          success: day3.success,
          failed: day3.failed,
          errors: day3.errors,
        },
        day6: {
          success: day6.success,
          failed: day6.failed,
          errors: day6.errors,
        },
        day9: {
          flagged: day9.flagged,
          errors: day9.errors,
        },
      },
      summary: {
        totalSent: day3.success + day6.success,
        totalFailed: day3.failed + day6.failed,
        totalFlagged: day9.flagged,
      },
    });
  } catch (error) {
    console.error('❌ Test All Reminders error:', error);
    res.status(500).json({ error: 'Failed to run all reminder tests' });
  }
});

/**
 * Get Test Status
 * GET /api/test-reminders/status
 * Shows which clients are eligible for reminders (for debugging)
 */
router.get('/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  if (!isDevelopment) {
    res.status(403).json({ error: 'Test endpoints only available in development' });
    return;
  }

  try {
    const { db } = await import('../lib/db.js');

    // Get clients eligible for each reminder type
    const day3Eligible = await db.query(`
      SELECT
        c.name as client_name,
        cc.first_message_sent_at,
        cc.status,
        cc.reminder_3_sent_at,
        NOW() - cc.first_message_sent_at as days_elapsed
      FROM campaign_clients cc
      JOIN clients c ON cc.client_id = c.id
      JOIN campaigns camp ON cc.campaign_id = camp.id
      WHERE cc.status = 'pending'
        AND camp.reminder_day_3 = true
        AND cc.reminder_3_sent_at IS NULL
        AND cc.first_message_sent_at IS NOT NULL
        AND cc.first_message_sent_at <= NOW() - INTERVAL '3 days'
    `);

    const day6Eligible = await db.query(`
      SELECT
        c.name as client_name,
        cc.first_message_sent_at,
        cc.status,
        cc.reminder_6_sent_at,
        NOW() - cc.first_message_sent_at as days_elapsed
      FROM campaign_clients cc
      JOIN clients c ON cc.client_id = c.id
      JOIN campaigns camp ON cc.campaign_id = camp.id
      WHERE cc.status = 'pending'
        AND camp.reminder_day_6 = true
        AND cc.reminder_6_sent_at IS NULL
        AND cc.first_message_sent_at IS NOT NULL
        AND cc.first_message_sent_at <= NOW() - INTERVAL '6 days'
    `);

    const day9Eligible = await db.query(`
      SELECT
        c.name as client_name,
        cc.first_message_sent_at,
        cc.status,
        NOW() - cc.first_message_sent_at as days_elapsed
      FROM campaign_clients cc
      JOIN clients c ON cc.client_id = c.id
      JOIN campaigns camp ON cc.campaign_id = camp.id
      WHERE cc.status = 'pending'
        AND camp.flag_after_day_9 = true
        AND cc.first_message_sent_at IS NOT NULL
        AND cc.first_message_sent_at <= NOW() - INTERVAL '9 days'
    `);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      eligible: {
        day3: {
          count: day3Eligible.rows.length,
          clients: day3Eligible.rows,
        },
        day6: {
          count: day6Eligible.rows.length,
          clients: day6Eligible.rows,
        },
        day9: {
          count: day9Eligible.rows.length,
          clients: day9Eligible.rows,
        },
      },
    });
  } catch (error) {
    console.error('❌ Test Status error:', error);
    res.status(500).json({ error: 'Failed to get reminder status' });
  }
});

export default router;
