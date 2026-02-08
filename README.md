# DocChase Backend API

Backend API server for DocChase - handles Twilio webhooks, client management, campaigns, and scheduled tasks.

## Tech Stack

- **Express.js** - Fast, minimal Node.js framework
- **PostgreSQL** - Database for storing accountants, clients, campaigns, messages, and documents
- **Twilio** - WhatsApp messaging integration
- **Google Drive API** - Document storage
- **Anthropic Claude** - AI-powered response generation
- **BankToFile API** - PDF to CSV conversion

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Run database migrations**:
   ```bash
   # Ensure your DATABASE_URL is set in .env
   psql $DATABASE_URL < ../docchase/lib/schema.sql
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

## API Endpoints

### Webhooks
- `POST /api/webhooks/twilio` - Twilio WhatsApp webhook (public)

### Clients (requires auth)
- `GET /api/clients` - List all clients
- `POST /api/clients` - Create new client
- `GET /api/clients/:id` - Get single client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client

### Campaigns (requires auth)
- `GET /api/campaigns` - List all campaigns
- `POST /api/campaigns` - Create new campaign
- `POST /api/campaigns/:id/start` - Start campaign (send messages)

### Cron Jobs (requires cron secret)
- `POST /api/cron/send-reminders` - Send reminder messages
- `POST /api/cron/flag-stuck` - Flag stuck clients after 9 days

### Health Check
- `GET /health` - Server health status

## Authentication

All API endpoints (except webhooks and health check) require a Bearer token in the Authorization header:

```
Authorization: Bearer your-api-token-here
```

## Deployment to Railway

1. **Create new project** on Railway

2. **Add PostgreSQL database**

3. **Set environment variables** in Railway dashboard

4. **Deploy**:
   ```bash
   railway login
   railway link
   railway up
   ```

5. **Update Twilio webhook URL** to point to your Railway URL:
   ```
   https://your-app.railway.app/api/webhooks/twilio
   ```

6. **Set up cron jobs** using Railway Cron or external service (cron-job.org):
   - Send reminders: `POST https://your-app.railway.app/api/cron/send-reminders`
   - Flag stuck: `POST https://your-app.railway.app/api/cron/flag-stuck`
   - Add header: `Authorization: Bearer your-cron-secret`

## Project Structure

```
docchase-backend/
├── index.js                 # Main server file
├── routes/
│   ├── webhooks/
│   │   └── twilio.js       # Twilio webhook handler
│   ├── clients.js          # Client CRUD operations
│   ├── campaigns.js        # Campaign management
│   └── cron.js             # Scheduled tasks
├── lib/
│   ├── db.js               # Database connection
│   ├── twilio.js           # Twilio client
│   ├── claude.js           # Claude AI integration
│   ├── google-drive.js     # Google Drive integration
│   └── banktofile.js       # BankToFile API client
├── middleware/
│   └── auth.js             # Authentication middleware
├── package.json
├── .env.example
└── README.md
```

## Environment Variables

See `.env.example` for all required environment variables.

## License

MIT
