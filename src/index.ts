import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import googleLoginRouter from './routes/auth/google-login.js';
import dashboardRouter from './routes/dashboard.js';
import clientsRouter from './routes/clients.js';
import campaignsRouter from './routes/campaigns.js';
import webhooksRouter from './routes/webhooks.js';
import stripeWebhookRouter from './routes/webhooks/stripe.js';
import checkoutRouter from './routes/checkout.js';
import billingRouter from './routes/billing.js';
import settingsRouter from './routes/settings/index.js';
import googleAuthRouter from './routes/settings/google-auth.js';
import googleCallbackRouter from './routes/settings/google-callback.js';
import testRemindersRouter from './routes/test-reminders.js';
import { startScheduledJobs } from './services/reminder-service.js';

dotenv.config();

// Debug: Check if DATABASE_URL is loaded
console.log('🔍 DATABASE_URL loaded:', process.env.DATABASE_URL ? 'Yes (length: ' + process.env.DATABASE_URL.length + ')' : 'No');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - allow frontend origin
const allowedOrigins = [
  'http://localhost:3000',
  'https://docchase-frontend.vercel.app',
  'https://www.gettingdocs.com',
  process.env.FRONTEND_URL
].filter(Boolean).map(url => url!.replace(/\/$/, '')); // Remove trailing slashes

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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe webhook route MUST come before body parsers (needs raw body)
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter);

// Body parsers for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/auth/google', googleLoginRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/billing', billingRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/settings/google-auth', googleAuthRouter);
app.use('/api/settings/google-callback', googleCallbackRouter);

// Test routes (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use('/api/test-reminders', testRemindersRouter);
  console.log('🧪 Test reminder endpoints enabled at /api/test-reminders/*');
}

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Gettingdocs Backend API running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start scheduled reminder jobs
  startScheduledJobs();
  console.log('⏰ Reminder scheduler initialized\n');
});
