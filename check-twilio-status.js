import twilio from 'twilio';
import 'dotenv/config';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Check the status of the most recent message
const messageSid = 'SM5985648e3632327e207534999109a674';

async function checkMessageStatus() {
  try {
    const message = await client.messages(messageSid).fetch();

    console.log('\n📱 Message Status Check:');
    console.log('─────────────────────────────────────');
    console.log('SID:', message.sid);
    console.log('From:', message.from);
    console.log('To:', message.to);
    console.log('Status:', message.status);
    console.log('Error Code:', message.errorCode || 'None');
    console.log('Error Message:', message.errorMessage || 'None');
    console.log('Date Sent:', message.dateSent);
    console.log('Date Updated:', message.dateUpdated);
    console.log('Price:', message.price, message.priceUnit);
    console.log('\nBody:', message.body);
    console.log('─────────────────────────────────────\n');

    if (message.errorCode) {
      console.log('❌ ERROR DETECTED!');
      console.log('Error Code:', message.errorCode);
      console.log('Error Message:', message.errorMessage);
      console.log('\nCommon Twilio WhatsApp Error Codes:');
      console.log('63007 - Sandbox number needs opt-in');
      console.log('63016 - WhatsApp Business number not approved');
      console.log('63019 - Recipient not registered with WhatsApp Business');
      console.log('21211 - Invalid "To" phone number');
      console.log('21408 - Permission to send an SMS has not been enabled');
    } else if (message.status === 'undelivered') {
      console.log('⚠️  Message was UNDELIVERED');
      console.log('This usually means the recipient phone number is not registered or cannot receive WhatsApp messages.');
    } else if (message.status === 'failed') {
      console.log('❌ Message FAILED to send');
    } else if (message.status === 'sent' || message.status === 'delivered') {
      console.log('✅ Message was sent/delivered successfully!');
      console.log('If you didn\'t receive it, check:');
      console.log('1. The recipient phone number is correct');
      console.log('2. The recipient has WhatsApp installed');
      console.log('3. The recipient number is registered with WhatsApp Business');
    } else if (message.status === 'queued' || message.status === 'sending') {
      console.log('⏳ Message is still being processed by Twilio');
      console.log('Check again in a few seconds...');
    }

  } catch (error) {
    console.error('❌ Error fetching message status:', error.message);
    if (error.code === 20404) {
      console.log('Message SID not found. It may have expired or never existed.');
    }
  }
}

checkMessageStatus();
