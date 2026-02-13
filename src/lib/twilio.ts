import twilio from 'twilio';
import { db } from './db.js';
import { Message } from '../types/index.js';
import crypto from 'crypto';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !twilioPhone) {
  console.warn('⚠️ Twilio credentials not configured');
}

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

/**
 * Send a WhatsApp message using approved Content Template
 * Uses Twilio's Content API with approved templates
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateSid: string,
  variables: Record<string, string>,
  accountantId: string,
  clientId: string,
  campaignId?: string
): Promise<Message> {
  if (!client) {
    throw new Error('Twilio client not initialized');
  }

  // Ensure phone number has whatsapp: prefix and country code
  const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const formattedFrom = twilioPhone!.startsWith('whatsapp:') ? twilioPhone : `whatsapp:${twilioPhone}`;

  try {
    // Send via Twilio with Content Template
    const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL ||
                               (process.env.API_URL ? `${process.env.API_URL}/api/webhooks/twilio/status` : null);

    const messageOptions: any = {
      from: formattedFrom,
      to: formattedTo,
      contentSid: templateSid,
      contentVariables: JSON.stringify(variables),
    };

    // Only add statusCallback if we have a valid URL
    if (statusCallbackUrl && statusCallbackUrl.startsWith('http')) {
      messageOptions.statusCallback = statusCallbackUrl;
    }

    const twilioMessage = await client.messages.create(messageOptions);

    // Store in database with initial status
    const messageBody = `Template: ${templateSid} with variables: ${JSON.stringify(variables)}`;
    const result = await db.query<Message>(
      `INSERT INTO messages
       (accountant_id, client_id, campaign_id, direction, sender, body, twilio_sid, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [accountantId, clientId, campaignId || null, 'outbound', 'system', messageBody, twilioMessage.sid, twilioMessage.status || 'queued']
    );

    console.log(`✅ WhatsApp template sent to ${to} - SID: ${twilioMessage.sid} - Template: ${templateSid}`);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Failed to send WhatsApp template:', error);

    // Store failed message in database with failed status
    const messageBody = `Template: ${templateSid} (FAILED)`;
    const result = await db.query<Message>(
      `INSERT INTO messages
       (accountant_id, client_id, campaign_id, direction, sender, body, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [accountantId, clientId, campaignId || null, 'outbound', 'system', messageBody, 'failed']
    );

    throw error;
  }
}

/**
 * Send a WhatsApp message to a client (Legacy - for freeform messages)
 */
export async function sendWhatsApp(
  to: string,
  body: string,
  accountantId: string,
  clientId: string,
  campaignId?: string
): Promise<Message> {
  if (!client) {
    throw new Error('Twilio client not initialized');
  }

  // Ensure phone number has whatsapp: prefix and country code
  const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const formattedFrom = twilioPhone!.startsWith('whatsapp:') ? twilioPhone : `whatsapp:${twilioPhone}`;

  try {
    // Send via Twilio with status callback (only if URL is configured)
    const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL ||
                               (process.env.API_URL ? `${process.env.API_URL}/api/webhooks/twilio/status` : null);

    const messageOptions: any = {
      from: formattedFrom,
      to: formattedTo,
      body,
    };

    // Only add statusCallback if we have a valid URL
    if (statusCallbackUrl && statusCallbackUrl.startsWith('http')) {
      messageOptions.statusCallback = statusCallbackUrl;
    }

    const twilioMessage = await client.messages.create(messageOptions);

    // Store in database with initial status
    const result = await db.query<Message>(
      `INSERT INTO messages
       (accountant_id, client_id, campaign_id, direction, sender, body, twilio_sid, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [accountantId, clientId, campaignId || null, 'outbound', 'system', body, twilioMessage.sid, twilioMessage.status || 'queued']
    );

    console.log(`✅ WhatsApp sent to ${to} - SID: ${twilioMessage.sid} - Status: ${twilioMessage.status}`);
    return result.rows[0];
  } catch (error) {
    console.error('❌ Failed to send WhatsApp:', error);

    // Store failed message in database with failed status
    const result = await db.query<Message>(
      `INSERT INTO messages
       (accountant_id, client_id, campaign_id, direction, sender, body, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [accountantId, clientId, campaignId || null, 'outbound', 'system', body, 'failed']
    );

    throw error;
  }
}

/**
 * Validate Twilio webhook signature
 * This ensures requests actually come from Twilio
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, any>
): boolean {
  if (!authToken) {
    console.warn('⚠️ Cannot validate Twilio signature - auth token not configured');
    return false;
  }

  try {
    // Sort params alphabetically and concatenate
    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], url);

    // Create HMAC SHA1 signature
    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(data);
    const expectedSignature = hmac.digest('base64');

    return signature === expectedSignature;
  } catch (error) {
    console.error('❌ Signature validation error:', error);
    return false;
  }
}

/**
 * Parse Twilio webhook payload
 */
export interface TwilioWebhookPayload {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  ProfileName?: string;
}

export function parseTwilioWebhook(body: any): TwilioWebhookPayload {
  return {
    MessageSid: body.MessageSid || '',
    From: body.From || '',
    To: body.To || '',
    Body: body.Body || '',
    NumMedia: body.NumMedia || '0',
    MediaUrl0: body.MediaUrl0,
    MediaContentType0: body.MediaContentType0,
    ProfileName: body.ProfileName,
  };
}

/**
 * Template SIDs from Twilio Content Templates
 */
export const TWILIO_TEMPLATES = {
  DOCUMENT_REQUEST: 'HXe28b5c8252ebffb74ef647bbb54c95af',
  DOCUMENT_REMINDER: 'HXdb39c84c9ad2301fe0e878ec8405a1bf',
} as const;

/**
 * Send initial document request using approved template
 * Template: "Hi {{1}}, this is Amy from {{2}}. We need your {{3}} at your earliest convenience..."
 */
export async function sendDocumentRequest(
  to: string,
  clientName: string,
  practiceName: string,
  documentDescription: string,
  accountantId: string,
  clientId: string,
  campaignId?: string
): Promise<Message> {
  return sendWhatsAppTemplate(
    to,
    TWILIO_TEMPLATES.DOCUMENT_REQUEST,
    {
      '1': clientName,
      '2': practiceName,
      '3': documentDescription,
    },
    accountantId,
    clientId,
    campaignId
  );
}

/**
 * Send document reminder using approved template
 * Template: "Hi {{1}}, just a friendly reminder that we're still waiting on your {{2}}..."
 */
export async function sendDocumentReminder(
  to: string,
  clientName: string,
  documentDescription: string,
  accountantId: string,
  clientId: string,
  campaignId?: string
): Promise<Message> {
  return sendWhatsAppTemplate(
    to,
    TWILIO_TEMPLATES.DOCUMENT_REMINDER,
    {
      '1': clientName,
      '2': documentDescription,
    },
    accountantId,
    clientId,
    campaignId
  );
}
