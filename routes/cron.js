import express from 'express';
import { db } from '../lib/db.js';
import { sendWhatsApp } from '../lib/twilio.js';
import { generateAmyResponse } from '../lib/claude.js';

const router = express.Router();

// Middleware to verify cron secret
const verifyCronSecret = (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Send reminders for clients who haven't responded
router.post('/send-reminders', verifyCronSecret, async (req, res) => {
  try {
    const now = new Date();

    // Find campaign clients who need reminders
    const result = await db.query(
      `SELECT cc.*, c.name as client_name, c.phone, a.amy_name, a.amy_tone, cam.document_type, cam.period
       FROM campaign_clients cc
       JOIN clients c ON cc.client_id = c.id
       JOIN campaigns cam ON cc.campaign_id = cam.id
       JOIN accountants a ON cam.accountant_id = a.id
       WHERE cc.status = 'sent'
         AND (
           (cc.sent_at < NOW() - INTERVAL '3 days' AND cam.reminder_day_3 = true AND cc.reminder_1_sent_at IS NULL)
           OR (cc.sent_at < NOW() - INTERVAL '6 days' AND cam.reminder_day_6 = true AND cc.reminder_2_sent_at IS NULL)
         )`
    );

    const results = [];

    for (const row of result.rows) {
      try {
        const daysSinceSent = Math.floor((now - new Date(row.sent_at)) / (1000 * 60 * 60 * 24));
        const reminderType = daysSinceSent >= 6 ? 'reminder_2' : 'reminder_1';

        const message = await generateAmyResponse(
          {
            id: row.client_id,
            name: row.client_name,
            amy_name: row.amy_name,
            amy_tone: row.amy_tone,
          },
          reminderType,
          `${row.document_type} for ${row.period}`
        );

        await sendWhatsApp(row.phone, message, row.accountant_id, row.client_id);

        // Update reminder sent timestamp
        const field = reminderType === 'reminder_1' ? 'reminder_1_sent_at' : 'reminder_2_sent_at';
        await db.query(
          `UPDATE campaign_clients SET ${field} = NOW() WHERE id = $1`,
          [row.id]
        );

        results.push({ campaign_client_id: row.id, success: true, reminder_type: reminderType });
      } catch (error) {
        console.error(`Failed to send reminder to campaign_client ${row.id}:`, error);
        results.push({ campaign_client_id: row.id, success: false, error: error.message });
      }
    }

    res.json({ success: true, reminders_sent: results.length, results });
  } catch (error) {
    console.error('Send reminders error:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

// Flag clients who are stuck after 9 days
router.post('/flag-stuck', verifyCronSecret, async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE campaign_clients cc
       SET status = 'stuck'
       FROM campaigns cam
       WHERE cc.campaign_id = cam.id
         AND cc.status = 'sent'
         AND cc.sent_at < NOW() - INTERVAL '9 days'
         AND cam.flag_after_day_9 = true
       RETURNING cc.id`
    );

    res.json({ success: true, flagged_count: result.rows.length });
  } catch (error) {
    console.error('Flag stuck error:', error);
    res.status(500).json({ error: 'Failed to flag stuck clients' });
  }
});

export default router;
