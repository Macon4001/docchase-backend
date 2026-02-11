import Anthropic from '@anthropic-ai/sdk';
import { db } from './db.js';
import { Message as DbMessage } from '../types/index.js';

const apiKey = process.env.ANTHROPIC_API_KEY;

console.log('🔍 Anthropic API Key check:', {
  exists: !!apiKey,
  length: apiKey?.length,
  firstChars: apiKey?.substring(0, 10)
});

if (!apiKey) {
  console.warn('⚠️ Anthropic API key not configured');
}

const client = apiKey ? new Anthropic({ apiKey }) : null;

console.log('🤖 Claude client initialized:', !!client);

/**
 * Generate Amy's initial message to request documents
 */
export async function generateInitialMessage(
  clientName: string,
  documentType: string,
  period: string,
  practiceName: string,
  assistantName: string = 'Amy'
): Promise<string> {
  if (!client) {
    // Fallback message if Claude not configured
    return `Hi ${clientName}! 👋\n\nThis is ${assistantName} from ${practiceName}. We need your ${documentType} for ${period} to complete your accounting.\n\nCould you please send them as a PDF or photo? Thanks!`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system: `You are ${assistantName}, a document collection assistant for ${practiceName}. Your ONLY job is to collect ${documentType} from clients.

STRICT RULES:
- ONLY discuss document collection and receipt
- NEVER give tax advice, accounting advice, or financial advice
- NEVER discuss pricing, fees, or negotiate costs
- NEVER make promises about deadlines or service delivery
- If asked about anything else, politely redirect to document collection
- Do not engage in general conversation
- Always introduce yourself as "${assistantName} from ${practiceName}"

If client asks about something outside your scope, respond: "I'm just here to help collect your documents. For questions about [their topic], please contact ${practiceName} directly."`,
      messages: [
        {
          role: 'user',
          content: `Write a warm, professional WhatsApp message to ${clientName} requesting their ${documentType} for ${period}.

IMPORTANT:
- Start with "Hi ${clientName}, this is ${assistantName} from ${practiceName}."
- Keep it friendly and conversational (like a real person)
- Brief (2-3 sentences max)
- Clear about what you need
- Use an emoji if appropriate
- Don't be overly formal

Just write the message, nothing else.`,
        },
      ],
    });

    const message = response.content[0].type === 'text' ? response.content[0].text : '';
    return message.trim();
  } catch (error) {
    console.error('❌ Claude API error:', error);
    // Return fallback message
    return `Hi ${clientName}! 👋\n\nThis is ${assistantName} from ${practiceName}. We need your ${documentType} for ${period} to complete your accounting.\n\nCould you please send them as a PDF or photo? Thanks!`;
  }
}

/**
 * Determines if a client message requires a response from Amy
 * Returns true if Amy should respond, false if message is just acknowledgment/noise
 */
export async function shouldRespondToMessage(
  clientMessage: string,
  hasMedia: boolean
): Promise<boolean> {
  const lowerMsg = clientMessage.toLowerCase().trim();

  // If they sent media/document, check if the text is just a filler message
  if (hasMedia) {
    const fillerPhrases = [
      'here you go',
      'here it is',
      'here',
      'attached',
      'sent',
      'done',
      'ok',
      'okay',
      'thanks',
      'thank you',
      'ty',
      'there you go',
      'sent it',
      'sending',
      'image',
      'file',
      'pdf',
      'screenshot',
      'pic',
      'photo'
    ];

    // If message is very short (< 20 chars) and contains filler phrases, don't respond
    if (lowerMsg.length < 20) {
      const isFiller = fillerPhrases.some(phrase => lowerMsg.includes(phrase));
      if (isFiller) {
        console.log(`📝 Skipping response - message is just document acknowledgment: "${clientMessage}"`);
        return false;
      }
    }
  }

  // Very short empty-ish messages don't need responses
  if (lowerMsg.length < 3 || lowerMsg === '...' || lowerMsg === '.') {
    console.log(`📝 Skipping response - message too short/empty: "${clientMessage}"`);
    return false;
  }

  return true;
}

/**
 * Generate Amy's response to a client message
 * Analyzes conversation history and context
 */
export async function generateResponse(
  clientId: string,
  clientName: string,
  clientMessage: string,
  campaignId: string,
  practiceName: string,
  documentType: string,
  period: string,
  assistantName: string = 'Amy',
  contactDetails: string | null = null
): Promise<string> {
  if (!client) {
    return `Thanks for your message! I'll review it and get back to you shortly.`;
  }

  try {
    // Get conversation history
    const messagesResult = await db.query<DbMessage>(
      `SELECT direction, body, created_at
       FROM messages
       WHERE client_id = $1 AND campaign_id = $2
       ORDER BY created_at ASC
       LIMIT 20`,
      [clientId, campaignId]
    );

    const conversationHistory = messagesResult.rows
      .map((m) => `${m.direction === 'inbound' ? clientName : assistantName}: ${m.body}`)
      .join('\n');

    // Check for recently received documents (last 60 seconds)
    const recentDocumentsResult = await db.query<{ created_at: Date }>(
      `SELECT created_at
       FROM documents
       WHERE client_id = $1
         AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY created_at DESC
       LIMIT 1`,
      [clientId]
    );

    let documentContext = '';
    if (recentDocumentsResult.rows.length > 0) {
      const doc = recentDocumentsResult.rows[0];
      const secondsAgo = Math.floor((Date.now() - new Date(doc.created_at).getTime()) / 1000);

      documentContext = `\n\nIMPORTANT: A ${documentType}${period ? ' for ' + period : ''} was received ${secondsAgo} seconds ago.
If the client's message seems like a follow-up comment about sending a document (e.g., "there you go", "sent it", "here you are"), acknowledge the document they just sent.`;
    }

    // Check if client sent a document (inferred from message content)
    const hasDocument = clientMessage.toLowerCase().includes('image') ||
                       clientMessage.toLowerCase().includes('pdf') ||
                       clientMessage.toLowerCase().includes('file') ||
                       clientMessage.toLowerCase().includes('attached');

    const systemPrompt = `You are ${assistantName}, a document collection assistant for ${practiceName}. Your ONLY job is to collect ${documentType} for ${period} from ${clientName}.

STRICT GUARDRAILS - YOU MUST FOLLOW THESE:
1. ONLY discuss: document collection, receipt confirmation, document format questions
2. NEVER give: tax advice, accounting advice, financial advice, legal advice
3. NEVER discuss: pricing, fees, costs, payment terms, discounts, negotiations
4. NEVER make promises about: deadlines, turnaround times, service delivery dates
5. NEVER engage in: general conversation, personal topics, small talk beyond brief pleasantries
6. If asked ANYTHING outside document collection, respond: "I'm just here to help collect your documents. For other questions, please contact ${practiceName} directly${contactDetails ? ' at ' + contactDetails : ''}."

Context:
- Previous conversation:
${conversationHistory}

${clientName} just sent: "${clientMessage}"

${hasDocument ? `They sent a document. Thank them warmly and confirm receipt. Keep it brief.` : `Respond ONLY if it's about documents. If they're asking about anything else (advice, pricing, services, deadlines), redirect them to contact ${practiceName} directly.`}${documentContext}

Keep your response:
- Warm but focused on documents only
- Brief (1-2 sentences maximum)
- Professional but conversational
- Use emojis sparingly if appropriate

Just write the response, nothing else.`;

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: systemPrompt,
        },
      ],
    });

    const message = response.content[0].type === 'text' ? response.content[0].text : '';
    return message.trim();
  } catch (error) {
    console.error('❌ Claude API error:', error);
    // Return fallback response
    if (clientMessage.toLowerCase().includes('thank')) {
      return `You're welcome! Let me know if you need anything else.`;
    }
    return `Thanks for your message! I'll review it and get back to you shortly.`;
  }
}

/**
 * Generate a reminder message
 */
export async function generateReminderMessage(
  clientName: string,
  documentType: string,
  period: string,
  practiceName: string,
  dayNumber: number,
  assistantName: string = 'Amy'
): Promise<string> {
  if (!client) {
    return `Hi ${clientName}, this is ${assistantName} from ${practiceName}. Just a friendly reminder that we still need your ${documentType} for ${period}. Could you send them when you get a chance? Thanks!`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 400,
      system: `You are ${assistantName}, a document collection assistant for ${practiceName}. Your ONLY job is to collect documents.

STRICT RULES:
- ONLY discuss document collection
- NEVER give advice, discuss pricing, or make promises about deadlines
- Do not engage beyond document collection
- Keep it professional and focused
- Always sign messages as "${assistantName}"`,
      messages: [
        {
          role: 'user',
          content: `Write a ${dayNumber === 3 ? 'gentle' : 'slightly more urgent'} reminder WhatsApp message to ${clientName}. They haven't sent their ${documentType} for ${period} yet (it's been ${dayNumber} days).

Keep it:
- Start with "Hi ${clientName}, this is ${assistantName} from ${practiceName}."
- Friendly but ${dayNumber > 3 ? 'slightly more firm' : 'gentle'}
- Brief (2-3 sentences)
- Understanding but clear about the need
- Use an emoji if appropriate
- Focus ONLY on requesting the documents

Just write the message, nothing else.`,
        },
      ],
    });

    const message = response.content[0].type === 'text' ? response.content[0].text : '';
    return message.trim();
  } catch (error) {
    console.error('❌ Claude API error:', error);
    return `Hi ${clientName}, this is ${assistantName} from ${practiceName}. Just a friendly reminder that we still need your ${documentType} for ${period}. Could you send them when you get a chance? Thanks!`;
  }
}
