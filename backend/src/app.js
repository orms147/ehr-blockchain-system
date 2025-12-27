import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { initSocket } from './services/socket.service.js';

import authRoutes from './routes/auth.routes.js';
import recordRoutes from './routes/record.routes.js';
import keyShareRoutes from './routes/keyShare.routes.js';
import accessLogRoutes from './routes/accessLog.routes.js';
import relayerRoutes from './routes/relayer.routes.js';
import requestRoutes from './routes/request.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import emergencyRoutes from './routes/emergency.routes.js';
import delegationRoutes from './routes/delegation.routes.js';
import orgRoutes from './routes/org.routes.js';
import pendingUpdateRoutes from './routes/pendingUpdate.routes.js';
import testRoutes from './routes/test.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Create HTTP server for Socket.io
const server = createServer(app);

// Initialize Socket.io
initSocket(server);

// Security middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
}));

// Rate limiting - relaxed for development
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // increased for dev: 1000 requests per 15 min
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
app.use('/api/relayer', relayerRoutes);       // Gas sponsorship
app.use('/api/requests', requestRoutes);       // Access requests
app.use('/api/verification', verificationRoutes);  // Doctor verification
app.use('/api/emergency', emergencyRoutes);    // Emergency access
app.use('/api/delegation', delegationRoutes);  // Family delegation
app.use('/api/org', orgRoutes);                // Organization management
app.use('/api/pending-updates', pendingUpdateRoutes); // Doctor update approval
app.use('/api/test', testRoutes);              // Development only

// Error handling
app.use(errorHandler);

// Start server with Socket.io
server.listen(PORT, () => {
    console.log(`🚀 EHR Backend running on port ${PORT}`);
    console.log(`📡 Chain ID: ${process.env.CHAIN_ID}`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}`);
});

export default app;

