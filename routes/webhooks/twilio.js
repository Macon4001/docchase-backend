import express from 'express';
import { validateTwilioSignature, sendWhatsApp } from '../../lib/twilio.js';
import { db } from '../../lib/db.js';
import { uploadToGoogleDrive } from '../../lib/google-drive.js';
import { convertWithBankToFile } from '../../lib/banktofile.js';
import { generateAmyResponse } from '../../lib/claude.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const params = req.body;

    // Validate Twilio signature
    const signature = req.headers['x-twilio-signature'] || '';
    const url = process.env.TWILIO_WEBHOOK_URL;

    const isValid = validateTwilioSignature(signature, url, params);

    if (!isValid && process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { From, Body, MediaUrl0, MediaContentType0 } = params;

    // Find client by phone number
    const clientResult = await db.query(
      `SELECT c.*, a.id as accountant_id, a.amy_name, a.amy_tone,
              a.google_drive_token, a.google_drive_folder_id
       FROM clients c
       JOIN accountants a ON c.accountant_id = a.id
       WHERE c.phone = $1`,
      [From]
    );

    if (!clientResult.rows[0]) {
      // Unknown number, ignore
      return res.json({ success: true });
    }

    const clientData = clientResult.rows[0];

    // Save incoming message
    await db.query(
      `INSERT INTO messages (accountant_id, client_id, direction, sender, body, media_url)
       VALUES ($1, $2, 'inbound', 'client', $3, $4)`,
      [clientData.accountant_id, clientData.id, Body || '', MediaUrl0 || null]
    );

    // Check if there's a media attachment (PDF or image)
    if (MediaUrl0) {
      // Download the file from Twilio
      const fileResponse = await fetch(MediaUrl0, {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(
              `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
            ).toString('base64'),
        },
      });
      const fileBuffer = await fileResponse.arrayBuffer();

      // Determine filename
      const extension = MediaContentType0?.includes('pdf') ? 'pdf' : 'jpg';
      const filename = `${clientData.name}_${new Date().toISOString().slice(0, 7)}.${extension}`;

      // Upload to Google Drive
      if (clientData.google_drive_token) {
        const driveFile = await uploadToGoogleDrive(
          clientData.google_drive_token,
          clientData.google_drive_folder_id,
          filename,
          Buffer.from(fileBuffer),
          MediaContentType0 || 'application/octet-stream'
        );

        // Save document record
        const docResult = await db.query(
          `INSERT INTO documents (accountant_id, client_id, original_filename, original_url, drive_file_id, drive_file_url)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            clientData.accountant_id,
            clientData.id,
            filename,
            MediaUrl0,
            driveFile.id,
            driveFile.webViewLink,
          ]
        );

        // If PDF, convert via BankToFile
        if (MediaContentType0?.includes('pdf')) {
          try {
            const csvBuffer = await convertWithBankToFile(Buffer.from(fileBuffer));
            const csvFilename = filename.replace('.pdf', '.csv');

            const csvDriveFile = await uploadToGoogleDrive(
              clientData.google_drive_token,
              clientData.google_drive_folder_id,
              csvFilename,
              csvBuffer,
              'text/csv'
            );

            await db.query(
              `UPDATE documents
               SET csv_drive_file_id = $1, csv_drive_file_url = $2, conversion_status = 'success'
               WHERE id = $3`,
              [csvDriveFile.id, csvDriveFile.webViewLink, docResult.rows[0].id]
            );
          } catch (error) {
            await db.query(
              `UPDATE documents
               SET conversion_status = 'failed', conversion_error = $1
               WHERE id = $2`,
              [error.message, docResult.rows[0].id]
            );
          }
        }
      }

      // Update campaign client status
      await db.query(
        `UPDATE campaign_clients
         SET status = 'received', received_at = NOW(), updated_at = NOW()
         WHERE client_id = $1 AND status != 'received'`,
        [clientData.id]
      );

      // Generate thank you response
      const response = await generateAmyResponse(
        {
          id: clientData.id,
          name: clientData.name,
          amy_name: clientData.amy_name,
          amy_tone: clientData.amy_tone,
        },
        'document_received',
        Body || ''
      );
      await sendWhatsApp(From, response, clientData.accountant_id, clientData.id);
    } else {
      // Text message - use Claude to understand and respond
      const response = await generateAmyResponse(
        {
          id: clientData.id,
          name: clientData.name,
          amy_name: clientData.amy_name,
          amy_tone: clientData.amy_tone,
        },
        'text_message',
        Body || ''
      );
      await sendWhatsApp(From, response, clientData.accountant_id, clientData.id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
