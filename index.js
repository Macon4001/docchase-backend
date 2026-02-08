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
// CORS configuration - allow frontend origin
const allowedOrigins = [
  'http://localhost:3000',
  'https://docchase-frontend.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean).map(url => url.replace(/\/$/, '')); // Remove trailing slashes

console.log('🔒 CORS allowed origins:', allowedOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (allowedOrigins.some(allowed => origin === allowed || origin === allowed + '/')) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
