import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import twilioWebhookRouter from './routes/webhooks/twilio.js';
import clientsRouter from './routes/clients.js';
import campaignsRouter from './routes/campaigns.js';
import cronRouter from './routes/cron.js';
import dashboardRouter from './routes/dashboard.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Normalize FRONTEND_URL by removing trailing slash to avoid CORS issues
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
app.use(cors({
  origin: frontendUrl,
  credentials: true
}));

// For Twilio webhooks - they send application/x-www-form-urlencoded
app.use('/api/webhooks/twilio', express.urlencoded({ extended: true }));

// For all other routes - JSON
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/webhooks/twilio', twilioWebhookRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/cron', cronRouter);
app.use('/api/dashboard', dashboardRouter);

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 DocChase Backend API running on port ${PORT}`);
  console.log(`📱 Twilio webhook: ${process.env.API_URL || `http://localhost:${PORT}`}/api/webhooks/twilio`);
});
