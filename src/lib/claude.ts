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
  practiceName: string
): Promise<string> {
  if (!client) {
    // Fallback message if Claude not configured
    return `Hi ${clientName}! 👋\n\nThis is Amy from ${practiceName}. We need your ${documentType} for ${period} to complete your accounting.\n\nCould you please send them as a PDF or photo? Thanks!`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system: `You are Amy, a document collection assistant for ${practiceName}. Your ONLY job is to collect ${documentType} from clients.

STRICT RULES:
- ONLY discuss document collection and receipt
- NEVER give tax advice, accounting advice, or financial advice
- NEVER discuss pricing, fees, or negotiate costs
- NEVER make promises about deadlines or service delivery
- If asked about anything else, politely redirect to document collection
- Do not engage in general conversation

If client asks about something outside your scope, respond: "I'm just here to help collect your documents. For questions about [their topic], please contact ${practiceName} directly."`,
      messages: [
        {
          role: 'user',
          content: `Write a warm, professional WhatsApp message to ${clientName} requesting their ${documentType} for ${period}.

Keep it:
- Friendly and conversational (like a real person)
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
    return `Hi ${clientName}! 👋\n\nThis is Amy from ${practiceName}. We need your ${documentType} for ${period} to complete your accounting.\n\nCould you please send them as a PDF or photo? Thanks!`;
  }
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
  period: string
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
      .map((m) => `${m.direction === 'inbound' ? clientName : 'Amy'}: ${m.body}`)
      .join('\n');

    // Check if client sent a document (inferred from message content)
    const hasDocument = clientMessage.toLowerCase().includes('image') ||
                       clientMessage.toLowerCase().includes('pdf') ||
                       clientMessage.toLowerCase().includes('file') ||
                       clientMessage.toLowerCase().includes('attached');

    const systemPrompt = `You are Amy, a document collection assistant for ${practiceName}. Your ONLY job is to collect ${documentType} for ${period} from ${clientName}.

STRICT GUARDRAILS - YOU MUST FOLLOW THESE:
1. ONLY discuss: document collection, receipt confirmation, document format questions
2. NEVER give: tax advice, accounting advice, financial advice, legal advice
3. NEVER discuss: pricing, fees, costs, payment terms, discounts, negotiations
4. NEVER make promises about: deadlines, turnaround times, service delivery dates
5. NEVER engage in: general conversation, personal topics, small talk beyond brief pleasantries
6. If asked ANYTHING outside document collection, respond: "I'm just here to help collect your documents. For other questions, please contact ${practiceName} directly at [their contact method]."

Context:
- Previous conversation:
${conversationHistory}

${clientName} just sent: "${clientMessage}"

${hasDocument ? `They sent a document. Thank them warmly and confirm receipt. Keep it brief.` : `Respond ONLY if it's about documents. If they're asking about anything else (advice, pricing, services, deadlines), redirect them to contact ${practiceName} directly.`}

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
  dayNumber: number
): Promise<string> {
  if (!client) {
    return `Hi ${clientName}, just a friendly reminder that we still need your ${documentType} for ${period}. Could you send them when you get a chance? Thanks!`;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 400,
      system: `You are Amy, a document collection assistant for ${practiceName}. Your ONLY job is to collect documents.

STRICT RULES:
- ONLY discuss document collection
- NEVER give advice, discuss pricing, or make promises about deadlines
- Do not engage beyond document collection
- Keep it professional and focused`,
      messages: [
        {
          role: 'user',
          content: `Write a ${dayNumber === 3 ? 'gentle' : 'slightly more urgent'} reminder WhatsApp message to ${clientName}. They haven't sent their ${documentType} for ${period} yet (it's been ${dayNumber} days).

Keep it:
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
    return `Hi ${clientName}, just a friendly reminder that we still need your ${documentType} for ${period}. Could you send them when you get a chance? Thanks!`;
  }
}
