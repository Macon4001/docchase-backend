/**
 * Email template utilities for DocChase notifications
 */

const DASHBOARD_URL = process.env.FRONTEND_URL || 'https://www.gettingdocs.com';
const BRAND_COLOR = '#10b981'; // Emerald-600
const BRAND_NAME = 'DocChase';

/**
 * Base email template wrapper
 */
function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND_NAME} Notification</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #059669 100%); padding: 30px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">
        ${BRAND_NAME}
      </h1>
      <p style="color: #d1fae5; margin: 5px 0 0 0; font-size: 14px;">
        Document Collection Made Easy
      </p>
    </div>

    <!-- Content -->
    <div style="padding: 30px 20px;">
      ${content}
    </div>

    <!-- Footer -->
    <div style="background-color: #f3f4f6; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 12px; margin: 0 0 10px 0;">
        This email was sent from ${BRAND_NAME}. You can manage your notification preferences in your account settings.
      </p>
      <p style="color: #9ca3af; font-size: 11px; margin: 0;">
        <a href="${DASHBOARD_URL}/settings" style="color: ${BRAND_COLOR}; text-decoration: none;">Notification Settings</a> •
        <a href="${DASHBOARD_URL}/dashboard" style="color: ${BRAND_COLOR}; text-decoration: none;">Dashboard</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Document Received Email
 */
export function documentReceivedEmail(
  clientName: string,
  documentType: string,
  campaignName?: string
): { subject: string; html: string } {
  const subject = `📄 Document Received from ${clientName}`;

  const content = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="width: 60px; height: 60px; background-color: #d1fae5; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 30px;">
        📄
      </div>
    </div>

    <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 22px; text-align: center;">
      Document Received!
    </h2>

    <p style="color: #374151; font-size: 16px; line-height: 1.6; text-align: center;">
      <strong>${clientName}</strong> has uploaded their ${documentType}${campaignName ? ` for the <strong>${campaignName}</strong> campaign` : ''}.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${DASHBOARD_URL}/dashboard" style="display: inline-block; background-color: ${BRAND_COLOR}; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
        View Document
      </a>
    </div>

    <div style="background-color: #f0fdf4; border-left: 4px solid ${BRAND_COLOR}; padding: 15px; margin-top: 20px; border-radius: 4px;">
      <p style="color: #166534; margin: 0; font-size: 14px;">
        💡 <strong>Next Steps:</strong> The document has been saved to your Google Drive and is ready for review.
      </p>
    </div>
  `;

  return { subject, html: baseTemplate(content) };
}

/**
 * Client Stuck Alert Email
 */
export function clientStuckEmail(
  clientName: string,
  daysSinceLastMessage: number,
  campaignName?: string
): { subject: string; html: string } {
  const subject = `⚠️ Client Alert: ${clientName} hasn't responded in ${daysSinceLastMessage} days`;

  const content = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="width: 60px; height: 60px; background-color: #fee2e2; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 30px;">
        ⚠️
      </div>
    </div>

    <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 22px; text-align: center;">
      Client Needs Attention
    </h2>

    <p style="color: #374151; font-size: 16px; line-height: 1.6; text-align: center;">
      <strong>${clientName}</strong> hasn't responded in <strong>${daysSinceLastMessage} days</strong>${campaignName ? ` for the <strong>${campaignName}</strong> campaign` : ''}.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${DASHBOARD_URL}/dashboard" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
        Follow Up Now
      </a>
    </div>

    <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin-top: 20px; border-radius: 4px;">
      <p style="color: #991b1b; margin: 0; font-size: 14px;">
        💡 <strong>Tip:</strong> Consider reaching out directly via phone or sending a personalized reminder.
      </p>
    </div>
  `;

  return { subject, html: baseTemplate(content) };
}

/**
 * Document Uploaded to Drive Email
 */
export function documentUploadedToDriveEmail(
  clientName: string,
  documentType: string,
  driveUrl: string
): { subject: string; html: string } {
  const subject = `✅ Document Saved to Drive: ${clientName}`;

  const content = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="width: 60px; height: 60px; background-color: #dbeafe; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 30px;">
        📁
      </div>
    </div>

    <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 22px; text-align: center;">
      Saved to Google Drive
    </h2>

    <p style="color: #374151; font-size: 16px; line-height: 1.6; text-align: center;">
      <strong>${clientName}'s</strong> ${documentType} has been automatically saved to your Google Drive.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${driveUrl}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
        Open in Google Drive
      </a>
    </div>

    <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin-top: 20px; border-radius: 4px;">
      <p style="color: #1e40af; margin: 0; font-size: 14px;">
        💡 Your documents are securely organized in your Google Drive folder structure.
      </p>
    </div>
  `;

  return { subject, html: baseTemplate(content) };
}

/**
 * Campaign Started Email
 */
export function campaignStartedEmail(
  campaignName: string,
  clientCount: number,
  period: string
): { subject: string; html: string } {
  const subject = `🚀 Campaign Started: ${campaignName}`;

  const content = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="width: 60px; height: 60px; background-color: #ddd6fe; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 30px;">
        🚀
      </div>
    </div>

    <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 22px; text-align: center;">
      Campaign Launched!
    </h2>

    <p style="color: #374151; font-size: 16px; line-height: 1.6; text-align: center;">
      Your campaign <strong>${campaignName}</strong> for <strong>${period}</strong> has started with <strong>${clientCount} clients</strong>.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${DASHBOARD_URL}/campaigns" style="display: inline-block; background-color: #7c3aed; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
        View Campaign
      </a>
    </div>

    <div style="background-color: #f5f3ff; border-left: 4px solid #7c3aed; padding: 15px; margin-top: 20px; border-radius: 4px;">
      <p style="color: #5b21b6; margin: 0; font-size: 14px;">
        💡 Amy is now reaching out to your clients. You'll receive updates as documents come in.
      </p>
    </div>
  `;

  return { subject, html: baseTemplate(content) };
}

/**
 * Campaign Complete Email
 */
export function campaignCompleteEmail(
  campaignName: string,
  successCount: number,
  totalCount: number,
  successRate: number
): { subject: string; html: string } {
  const subject = `🎉 Campaign Complete: ${campaignName}`;

  const content = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="width: 60px; height: 60px; background-color: #fef3c7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 30px;">
        🎉
      </div>
    </div>

    <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 22px; text-align: center;">
      Campaign Complete!
    </h2>

    <p style="color: #374151; font-size: 16px; line-height: 1.6; text-align: center;">
      Your campaign <strong>${campaignName}</strong> has finished.
    </p>

    <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
      <div style="font-size: 48px; font-weight: bold; color: ${BRAND_COLOR}; margin-bottom: 10px;">
        ${successRate.toFixed(0)}%
      </div>
      <div style="color: #6b7280; font-size: 14px;">
        Success Rate
      </div>
      <div style="color: #374151; font-size: 16px; margin-top: 15px;">
        <strong>${successCount} of ${totalCount}</strong> clients responded
      </div>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${DASHBOARD_URL}/campaigns" style="display: inline-block; background-color: ${BRAND_COLOR}; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
        View Campaign Results
      </a>
    </div>
  `;

  return { subject, html: baseTemplate(content) };
}

/**
 * Generic notification email
 */
export function genericNotificationEmail(
  title: string,
  message: string,
  actionText?: string,
  actionUrl?: string
): { subject: string; html: string } {
  const subject = title;

  const content = `
    <h2 style="color: #111827; margin: 0 0 15px 0; font-size: 22px;">
      ${title}
    </h2>

    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
      ${message}
    </p>

    ${actionText && actionUrl ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${actionUrl}" style="display: inline-block; background-color: ${BRAND_COLOR}; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
        ${actionText}
      </a>
    </div>
    ` : ''}
  `;

  return { subject, html: baseTemplate(content) };
}
