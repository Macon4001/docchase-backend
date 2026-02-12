import express, { Request, Response } from 'express';
import { sendEmail } from '../lib/email.js';

const router = express.Router();

const CONTACT_EMAIL = 'michael@gettingdocs.com';

/**
 * POST /api/contact
 * Send a contact form message
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, subject, message } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Invalid email address'
      });
      return;
    }

    // Create email content
    const emailSubject = `DocChase Contact Form: ${subject}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">DocChase Contact Form</h1>
        </div>

        <div style="padding: 30px; background-color: #ffffff;">
          <h2 style="color: #111827; margin: 0 0 20px 0;">New Contact Form Submission</h2>

          <div style="background-color: #f9fafb; border-left: 4px solid #10b981; padding: 15px; margin-bottom: 20px;">
            <p style="margin: 0 0 10px 0;"><strong>From:</strong> ${name}</p>
            <p style="margin: 0 0 10px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p style="margin: 0;"><strong>Subject:</strong> ${subject}</p>
          </div>

          <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
            <h3 style="color: #374151; margin: 0 0 10px 0;">Message:</h3>
            <p style="color: #4b5563; line-height: 1.6; white-space: pre-wrap;">${message}</p>
          </div>

          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 12px; margin: 0;">
              To reply, simply respond to this email or contact ${email} directly.
            </p>
          </div>
        </div>

        <div style="background-color: #f3f4f6; padding: 20px; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            This email was sent from the DocChase contact form at ${new Date().toLocaleString('en-GB')}
          </p>
        </div>
      </div>
    `;

    const emailText = `
DocChase Contact Form Submission

From: ${name}
Email: ${email}
Subject: ${subject}

Message:
${message}

---
To reply, contact ${email} directly.
Sent: ${new Date().toLocaleString('en-GB')}
    `;

    // Send email
    const sent = await sendEmail(CONTACT_EMAIL, emailSubject, emailHtml, emailText);

    if (sent) {
      res.json({
        success: true,
        message: 'Message sent successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send message. Please try again or email us directly.'
      });
    }
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

export default router;
