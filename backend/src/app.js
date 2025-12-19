import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes.js';
import recordRoutes from './routes/record.routes.js';
import keyShareRoutes from './routes/keyShare.routes.js';
import accessLogRoutes from './routes/accessLog.routes.js';
import testRoutes from './routes/test.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/key-share', keyShareRoutes);
app.use('/api/access-logs', accessLogRoutes);
app.use('/api/test', testRoutes); // Development only

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    console.log(`🚀 EHR Backend running on port ${PORT}`);
    console.log(`📡 Chain ID: ${process.env.CHAIN_ID}`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
});

export default app;
