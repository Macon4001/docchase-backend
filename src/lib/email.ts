import * as brevo from '@getbrevo/brevo';
import { db } from './db.js';

// Brevo API Configuration
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'DocChase';
const EMAIL_FROM_EMAIL = process.env.EMAIL_FROM_EMAIL || 'noreply@gettingdocs.com';

// Check if Brevo is configured
const isEmailConfigured = !!BREVO_API_KEY;

if (!isEmailConfigured) {
  console.warn('⚠️  Brevo API Key not configured. Email notifications will be disabled.');
  console.warn('   Set BREVO_API_KEY environment variable to enable email.');
} else {
  console.log(`✅ Brevo API configured (from: ${EMAIL_FROM_NAME} <${EMAIL_FROM_EMAIL}>)`);
}

/**
 * Get configured Brevo API instance
 */
function getBrevoApi() {
  if (!isEmailConfigured || !BREVO_API_KEY) {
    throw new Error('Brevo API Key is not configured');
  }

  const apiInstance = new brevo.TransactionalEmailsApi();
  apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, BREVO_API_KEY);
  return apiInstance;
}

/**
 * Send an email using Brevo API
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
  // If Brevo not configured, log and return false
  if (!isEmailConfigured) {
    console.log(`📧 Email not sent (Brevo not configured): ${subject} → ${to}`);
    return false;
  }

  try {
    const apiInstance = getBrevoApi();

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;
    sendSmtpEmail.textContent = text || stripHtml(html);
    sendSmtpEmail.sender = {
      name: EMAIL_FROM_NAME,
      email: EMAIL_FROM_EMAIL
    };
    sendSmtpEmail.to = [{ email: to }];

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);

    console.log(`✅ Email sent via Brevo: ${subject} → ${to} (MessageID: ${result.body.messageId})`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to send email via Brevo to ${to}:`, error.message || error);
    if (error.response?.body) {
      console.error('Brevo API Error:', error.response.body);
    }
    return false;
  }
}

/**
 * Send a test email to verify Brevo configuration
 * @param to - Recipient email address
 */
export async function sendTestEmail(to: string): Promise<boolean> {
  const subject = '🧪 DocChase Test Email';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #10b981;">✅ Email Notifications Working!</h2>
      <p>This is a test email from DocChase to confirm your Brevo integration is configured correctly.</p>
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
        This email was sent from DocChase via Brevo. You can manage your notification preferences in your account settings.
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
