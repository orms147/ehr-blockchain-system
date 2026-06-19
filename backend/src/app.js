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
import trustedContactRoutes from './routes/trustedContact.routes.js';
import delegationRoutes from './routes/delegation.routes.js';
import pushRoutes from './routes/push.routes.js';
import orgRoutes from './routes/org.routes.js';
import adminRoutes from './routes/admin.routes.js';
// pendingUpdate routes removed 2026-04-19 — doctor updates are direct on-chain.
import profileRoutes from './routes/profile.routes.js';
import testRoutes from './routes/test.routes.js';
// startEventSync (AccessControl RPC polling) disabled 2026-04-30:
// 7 watchers + 5min catchup loop on Alchemy free tier produced sustained
// 429 storms (eth_getFilterChanges rate-limited). subgraphSync now polls
// Doctor verifications via The Graph (zero RPC cost) and invalidates
// roleCache directly. Other AccessControl events (Member*, Organization*)
// were admin-only DB cache mirrors — those tables now eventual-consistency
// from on-demand reads. Kept the import as comment for easy revert if needed.
// import { startEventSync } from './services/eventSync.service.js';
import { startSubgraphSync } from './services/subgraphSync.service.js';
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
// F12: allow-list is dev defaults; FRONTEND_URL (documented in .env.example) is now
// actually wired in when set (was previously read nowhere).
const corsOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001'];
if (process.env.FRONTEND_URL) corsOrigins.push(process.env.FRONTEND_URL);
app.use(cors({
    origin: corsOrigins,
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
app.use('/api/emergency', emergencyRoutes);    // Emergency CCCD lookup (S18)
app.use('/api/trusted-contacts', trustedContactRoutes); // Trusted Contact registry (S18)
app.use('/api/delegation', delegationRoutes);  // Family delegation
app.use('/api/push', pushRoutes);              // Expo push notifications
app.use('/api/org', orgRoutes);                // Organization management
app.use('/api/admin', adminRoutes);            // Ministry-only endpoints
app.use('/api/profile', profileRoutes);               // User profile & metadata
// F8 fix: default-DENY for the dev-only test routes (forge JWT / reset-db).
// Previously mounted unconditionally and gated per-handler by NODE_ENV ==='production'
// — which fails OPEN when NODE_ENV is unset/'staging'. Now mount only on explicit opt-in.
if (process.env.ENABLE_TEST_ROUTES === 'true') {
    app.use('/api/test', testRoutes);
    console.warn('⚠️  /api/test/* ENABLED (ENABLE_TEST_ROUTES=true) — DEV ONLY, never in shared/prod env');
}

// Error handling
app.use(errorHandler);

// Start server with Socket.io
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    // S17 2026-04-30: zero RPC polling. All event sync via subgraph.
    // subgraphSync covers: ConsentEvent, DelegationEvent, DelegationAccessGrant,
    // TrustedContactEvent (S18 2026-05-04, replaced EmergencyEvent), Doctor
    // (verifiedAt → roleCache invalidate). recordRegistrySync handlers not
    // migrated (save-only API is primary path for RecordMetadata writes).
    startSubgraphSync();
});

export default app;


