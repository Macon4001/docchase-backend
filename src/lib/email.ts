import nodemailer from 'nodemailer';
import { db } from './db.js';

// SMTP Configuration from environment variables
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'; // true for 465, false for other ports
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'DocChase <noreply@gettingdocs.com>';

// Check if SMTP is configured
const isEmailConfigured = !!SMTP_HOST && !!SMTP_USER && !!SMTP_PASS;

if (!isEmailConfigured) {
  console.warn('⚠️  SMTP not configured. Email notifications will be disabled.');
  console.warn('   Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables to enable email.');
} else {
  console.log(`✅ SMTP configured: ${SMTP_HOST}:${SMTP_PORT} (from: ${EMAIL_FROM})`);
}

/**
 * Create a Nodemailer transporter
 */
function createTransporter() {
  if (!isEmailConfigured) {
    throw new Error('SMTP is not configured');
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

/**
 * Send an email
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param html - HTML content
 * @param text - Plain text fallback
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<boolean> {
  // If SMTP not configured, log and return false
  if (!isEmailConfigured) {
    console.log(`📧 Email not sent (SMTP not configured): ${subject} → ${to}`);
    return false;
  }

  try {
    const transporter = createTransporter();

    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text: text || stripHtml(html), // Generate plain text from HTML if not provided
    });

    console.log(`✅ Email sent: ${subject} → ${to} (MessageID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
    return false;
  }
}

/**
 * Send a test email to verify SMTP configuration
 * @param to - Recipient email address
 */
export async function sendTestEmail(to: string): Promise<boolean> {
  const subject = '🧪 DocChase Test Email';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">✅ Email Notifications Working!</h2>
      <p>This is a test email from DocChase to confirm your SMTP settings are configured correctly.</p>
      <p>You will now receive email notifications for:</p>
      <ul>
        <li>📄 Document uploads</li>
        <li>⚠️ Stuck clients</li>
        <li>🎯 Campaign updates</li>
        <li>🎉 Important milestones</li>
      </ul>
      <p>You can customize your email preferences in Settings.</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
      <p style="color: #6b7280; font-size: 12px;">
        This email was sent from DocChase. You can manage your notification preferences in your account settings.
      </p>
    </div>
  `;

  return sendEmail(to, subject, html);
}

/**
 * Simple HTML stripper for plain text fallback
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Check if accountant has email notifications enabled
 * @param accountantId - The accountant's ID
 * @param notificationType - Type of notification (for granular control)
 */
export async function shouldSendEmail(
  accountantId: string,
  notificationType: string
): Promise<{ enabled: boolean; email: string | null }> {
  try {
    const result = await db.query<{
      email: string;
      notification_email: boolean;
      notification_stuck: boolean;
    }>(
      'SELECT email, notification_email, notification_stuck FROM accountants WHERE id = $1',
      [accountantId]
    );

    if (result.rows.length === 0) {
      return { enabled: false, email: null };
    }

    const accountant = result.rows[0];

    // Check master email toggle
    if (!accountant.notification_email) {
      return { enabled: false, email: accountant.email };
    }

    // Check specific notification type preferences
    if (notificationType === 'client_stuck' && !accountant.notification_stuck) {
      return { enabled: false, email: accountant.email };
    }

    return { enabled: true, email: accountant.email };
  } catch (error) {
    console.error('Error checking email preferences:', error);
    return { enabled: false, email: null };
  }
}

export { isEmailConfigured };
