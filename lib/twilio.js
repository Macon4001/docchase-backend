import twilio from 'twilio';
import { db } from './db';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendWhatsApp(
  to: string,
  body: string,
  accountantId: string,
  clientId: string,
  campaignId: string | null = null
): Promise<any> {
  const message = await client.messages.create({
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

export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature,
    url,
    params
  );
}
