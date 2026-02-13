# Twilio WhatsApp Templates Integration

## Overview
Your Twilio WhatsApp number has been approved and is now integrated with the approved Content Templates.

## Approved Templates

### 1. Document Request Template
- **Template Name**: `document_request`
- **Template SID**: `HXe28b5c8252ebffb74ef647bbb54c95af`
- **Language**: English (UK)
- **Category**: Utility
- **Status**: ✅ Approved

**Template Content:**
```
Hi {{1}}, this is Amy from {{2}}. We need your {{3}} at your earliest convenience. You can simply reply to this message with a photo or PDF. Thanks!
```

**Variables:**
- `{{1}}` - Client name (e.g., "John")
- `{{2}}` - Practice name (e.g., "Smith Accounting")
- `{{3}}` - Document description (e.g., "January 2026 bank statement")

**Quick Reply Buttons:**
- "Send Now"
- "Remind Me Later"

### 2. Document Reminder Template
- **Template Name**: `document_reminder`
- **Template SID**: `HXdb39c84c9ad2301fe0e878ec8405a1bf`
- **Language**: English (UK)
- **Category**: Utility
- **Status**: ✅ Approved

**Template Content:**
```
Hi {{1}}, just a friendly reminder that we're still waiting on your {{2}}. You can send it by replying to this message with a photo or PDF. Thanks!
```

**Variables:**
- `{{1}}` - Client name (e.g., "John")
- `{{2}}` - Document description (e.g., "January 2026 bank statement")

**Quick Reply Buttons:**
- "Send Now"
- "Need More Time"

## Code Integration

### Updated Files

1. **`src/lib/twilio.ts`**
   - Added `sendWhatsAppTemplate()` - Core function to send template messages
   - Added `sendDocumentRequest()` - Helper for initial document requests
   - Added `sendDocumentReminder()` - Helper for reminders
   - Added `TWILIO_TEMPLATES` constant with template SIDs

2. **`src/services/reminder-service.ts`**
   - Updated `sendReminder1()` to use `sendDocumentReminder()`
   - Updated `sendReminder2()` to use `sendDocumentReminder()`
   - Removed dependency on Claude AI for reminder messages

3. **`src/routes/campaigns.ts`**
   - Updated campaign start logic to use `sendDocumentRequest()`
   - Removed custom message and AI-generated message logic
   - All initial messages now use approved template

## Usage Examples

### Sending Initial Document Request
```typescript
import { sendDocumentRequest } from '../lib/twilio.js';

await sendDocumentRequest(
  '+447123456789',           // Client phone number
  'John Smith',              // Client name
  'ABC Accounting',          // Practice name
  'January 2026 bank statement',  // Document description
  accountantId,
  clientId,
  campaignId
);
```

### Sending Reminder
```typescript
import { sendDocumentReminder } from '../lib/twilio.js';

await sendDocumentReminder(
  '+447123456789',           // Client phone number
  'John Smith',              // Client name
  'January 2026 bank statement',  // Document description
  accountantId,
  clientId,
  campaignId
);
```

## Benefits

✅ **WhatsApp Compliance** - Uses only approved templates
✅ **Faster Delivery** - Templates have priority routing
✅ **Quick Replies** - Interactive buttons for better UX
✅ **No AI Dependencies** - Removes reliance on Claude AI for messages
✅ **Consistent Messaging** - Same message format every time
✅ **Multi-channel Support** - Works on WhatsApp, WhatsApp Business, and Facebook Messenger

## Testing

To test the integration:

1. Start a new campaign - it will use the `document_request` template
2. Wait for reminder schedules - they will use the `document_reminder` template
3. Check message logs in the database to verify template usage
4. Verify messages appear correctly on client WhatsApp

## Important Notes

- Templates are **required** for WhatsApp business messaging
- Messages sent outside approved templates may be **blocked or delayed**
- Template variables are replaced automatically
- Quick reply buttons are interactive but responses come as regular messages
- All messages are logged in the database with template information
