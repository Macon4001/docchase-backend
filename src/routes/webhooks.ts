import express, { Request, Response } from 'express';
import { db } from '../lib/db.js';
import { parseTwilioWebhook, TwilioWebhookPayload, sendWhatsApp } from '../lib/twilio.js';
import { generateResponse, shouldRespondToMessage } from '../lib/claude.js';
import { processDocument } from '../lib/banktofile.js';
import { createNotification } from './notifications.js';
import { Message, Client, Campaign, Document } from '../types/index.js';

const router = express.Router();

/**
 * Twilio WhatsApp webhook handler
 * Receives incoming messages from clients
 */
router.post('/twilio', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📥 Received Twilio webhook:', req.body);

    // Parse webhook payload
    const webhook: TwilioWebhookPayload = parseTwilioWebhook(req.body);

    // Extract phone number (remove whatsapp: prefix)
    const clientPhone = webhook.From.replace('whatsapp:', '');

    // Find client by phone number
    const clientResult = await db.query<Client>(
      `SELECT * FROM clients WHERE phone = $1`,
      [clientPhone]
    );

    if (clientResult.rows.length === 0) {
      console.log(`⚠️ Unknown client: ${clientPhone}`);
      res.status(200).send('OK'); // Still return 200 to Twilio
      return;
    }

    const client = clientResult.rows[0];

    // Find active campaign for this client
    const campaignResult = await db.query<Campaign & { campaign_client_id: string }>(
      `SELECT c.*, cc.id as campaign_client_id
       FROM campaigns c
       JOIN campaign_clients cc ON c.id = cc.campaign_id
       WHERE cc.client_id = $1 AND c.status = 'active'
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [client.id]
    );

    if (campaignResult.rows.length === 0) {
      console.log(`⚠️ No active campaign for client: ${client.name}`);
      res.status(200).send('OK');
      return;
    }

    const campaign = campaignResult.rows[0];

    // Store incoming message in database
    const messageResult = await db.query<Message>(
      `INSERT INTO messages
       (accountant_id, client_id, campaign_id, direction, sender, body, twilio_sid)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        campaign.accountant_id,
        client.id,
        campaign.id,
        'inbound',
        clientPhone,
        webhook.Body,
        webhook.MessageSid
      ]
    );

    console.log(`✅ Stored message from ${client.name}: "${webhook.Body}"`);

    // Check if message has media (document/image)
    const hasMedia = parseInt(webhook.NumMedia) > 0;

    if (hasMedia && webhook.MediaUrl0) {
      console.log(`📎 Media received: ${webhook.MediaContentType0} - ${webhook.MediaUrl0}`);

      // Store document in database
      const documentResult = await db.query<Document>(
        `INSERT INTO documents
         (accountant_id, client_id, campaign_id, original_url, conversion_status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          campaign.accountant_id,
          client.id,
          campaign.id,
          webhook.MediaUrl0,
          'pending_upload'
        ]
      );

      const document = documentResult.rows[0];

      // Update campaign_client status to received
      await db.query(
        `UPDATE campaign_clients
         SET status = 'received',
             received_at = NOW()
         WHERE id = $1`,
        [campaign.campaign_client_id]
      );

      console.log(`✅ Document stored for ${client.name}`);

      // Create notification for document received
      await createNotification(
        campaign.accountant_id,
        'client_response',
        'Document Received',
        `${client.name} has sent a document`,
        client.name,
        campaign.name
      );

      // Process document asynchronously (upload to Drive + convert to CSV)
      // Don't await - let it run in background so we can respond to Twilio quickly
      processDocument(
        document.id,
        campaign.accountant_id,
        campaign.id,
        campaign.document_type,
        campaign.period,
        client.name,
        client.phone,
        webhook.MediaUrl0,
        webhook.MediaContentType0 || 'unknown'
      ).catch(error => {
        console.error(`❌ Background processing failed for document ${document.id}:`, error);
      });
    }

    // Check if we should respond to this message
    // Note: Responses are disabled when documents are received because WhatsApp
    // may require approved templates for business-initiated messages
    const shouldRespond = !hasMedia && await shouldRespondToMessage(webhook.Body, hasMedia);

    if (shouldRespond) {
      // Get accountant details for response
      const accountantResult = await db.query<{
        practice_name: string;
        amy_name: string;
        contact_details: string | null;
      }>(
        `SELECT practice_name, amy_name, contact_details FROM accountants WHERE id = $1`,
        [campaign.accountant_id]
      );
      const practiceName = accountantResult.rows[0]?.practice_name || 'your accountant';
      const assistantName = accountantResult.rows[0]?.amy_name || 'Amy';
      const contactDetails = accountantResult.rows[0]?.contact_details || null;

      // Generate assistant's response using Claude
      const assistantResponse = await generateResponse(
        client.id,
        client.name,
        webhook.Body,
        campaign.id,
        practiceName,
        campaign.document_type,
        campaign.period,
        assistantName,
        contactDetails
      );

      // Send assistant's response
      await sendWhatsApp(
        clientPhone,
        assistantResponse,
        campaign.accountant_id,
        client.id,
        campaign.id
      );

      console.log(`✅ ${assistantName} responded to ${client.name}: "${assistantResponse}"`);
    } else {
      console.log(`⏭️ Skipped response to ${client.name} - message doesn't require reply`);
    }

    // Return empty response to Twilio (prevents duplicate messages)
    res.status(200).send('');
  } catch (error) {
    console.error('❌ Webhook error:', error);
    // Still return 200 to prevent Twilio retries
    res.status(200).send('OK');
  }
});

/**
 * Webhook status callback (optional - for message delivery status)
 */
router.post('/twilio/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { MessageSid, MessageStatus } = req.body;

    console.log(`📊 Message status update: ${MessageSid} -> ${MessageStatus}`);

    // Update message status in database
    await db.query(
      `UPDATE messages
       SET status = $1
       WHERE twilio_sid = $2`,
      [MessageStatus, MessageSid]
    );

    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Status callback error:', error);
    res.status(200).send('OK');
  }
});

export default router;
