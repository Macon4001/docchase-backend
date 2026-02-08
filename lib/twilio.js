import twilio from 'twilio';
import { db } from './db.js';

// Lazy initialization - only create client when needed
let client = null;

function getClient() {
  if (!client && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return client;
}

export async function sendWhatsApp(to, body, accountantId, clientId, campaignId = null) {
  const twilioClient = getClient();
  if (!twilioClient) {
    throw new Error('Twilio credentials not configured');
  }

  const message = await twilioClient.messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${to}`,
    body: body,
  });

  // Save outgoing message
  await db.query(
    `INSERT INTO messages (accountant_id, client_id, campaign_id, direction, sender, body, twilio_sid)
     VALUES ($1, $2, $3, 'outbound', 'amy', $4, $5)`,
    [accountantId, clientId, campaignId, body, message.sid]
  );

  return message;
}

export function validateTwilioSignature(signature, url, params) {
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params
  );
}
