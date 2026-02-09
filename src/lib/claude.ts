import Anthropic from '@anthropic-ai/sdk';
import { db } from './db.js';
import { Message as DbMessage } from '../types/index.js';

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.warn('⚠️ Anthropic API key not configured');
}

const client = apiKey ? new Anthropic({ apiKey }) : (null as Anthropic | null);

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
    const response = await (client as any).messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `You are Amy, a friendly AI assistant working for ${practiceName}, an accounting practice. Write a warm, professional WhatsApp message to ${clientName} requesting their ${documentType} for ${period}.

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

    const systemPrompt = `You are Amy, a friendly AI assistant working for ${practiceName}, an accounting practice.

Context:
- You're collecting ${documentType} for ${period} from ${clientName}
- Previous conversation:
${conversationHistory}

${clientName} just sent: "${clientMessage}"

${hasDocument ? `It looks like they've sent a document. Thank them warmly and let them know you'll process it.` : `Respond helpfully based on their message.`}

Keep your response:
- Warm and friendly (like a real person)
- Brief (1-2 sentences)
- Professional but conversational
- Use emojis sparingly if appropriate

Just write the response, nothing else.`;

    const response = await (client as any).messages.create({
      model: 'claude-3-5-sonnet-20241022',
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
    const response = await (client as any).messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `You are Amy, a friendly AI assistant working for ${practiceName}, an accounting practice.

Write a ${dayNumber === 3 ? 'gentle' : 'slightly more urgent'} reminder WhatsApp message to ${clientName}. They haven't sent their ${documentType} for ${period} yet (it's been ${dayNumber} days).

Keep it:
- Friendly but ${dayNumber > 3 ? 'slightly more firm' : 'gentle'}
- Brief (2-3 sentences)
- Understanding but clear about the need
- Use an emoji if appropriate

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
