import Anthropic from '@anthropic-ai/sdk';
import { db } from './db.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateAmyResponse(clientData, context, messageBody) {
  // Fetch conversation history
  const conversationHistory = await db.query(
    `SELECT direction, sender, body, created_at
     FROM messages
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [clientData.id]
  );

  const historyText = conversationHistory.rows
    .reverse()
    .map((m) => `${m.sender}: ${m.body}`)
    .join('\n');

  const systemPrompt = `You are ${clientData.amy_name}, a friendly document collection assistant for an accounting practice.

Your tone is: ${clientData.amy_tone}

You can ONLY:
- Request bank statements, receipts, invoices
- Answer basic deadline questions (VAT due dates, tax deadlines)
- Confirm receipt of documents
- Remind clients about outstanding requests
- Thank clients for sending documents

You CANNOT:
- Give tax advice
- Discuss fees or billing
- Make promises about timelines
- Discuss anything personal or off-topic
- Answer anything outside your scope

If asked something outside scope, say something like:
"That's one for the team directly — I'll flag it for them. Anything else document-wise I can help with?"

Keep responses SHORT and conversational. Max 2-3 sentences. Use casual British English.

Current context: ${context}
${context === 'document_received' ? 'The client just sent a document. Thank them briefly.' : ''}
`;

  const response = await anthropic.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 150,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Conversation history:\n${historyText}\n\nClient's latest message: ${messageBody}\n\nRespond as ${clientData.amy_name}:`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type === 'text') {
    return content.text;
  }

  return 'Thanks for your message!';
}
