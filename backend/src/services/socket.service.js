// Socket.io Service - Real-time WebSocket for EHR updates
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

/**
 * Initialize Socket.io server with JWT authentication
 * @param {http.Server} server - HTTP server instance
 */
export function initSocket(server) {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    // JWT Authentication middleware for WebSocket
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            const payload = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = payload; // { walletAddress, role }

            return next();
        } catch (err) {
            console.error('WebSocket auth error:', err.message);
            return next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        // Join room by wallet address (lowercase for consistency)
        const room = socket.user.walletAddress.toLowerCase();
        socket.join(room);

        console.log('🔌 WS connected:', room);

        socket.on('disconnect', () => {
            console.log('🔌 WS disconnected:', room);
        });

        // Error handling
        socket.on('error', (err) => {
            console.error('Socket error:', err);
        });
    });

    console.log('🔌 Socket.io initialized');
}

/**
 * Emit event to specific user by wallet address
 * @param {string} wallet - User's wallet address
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export function emitToUser(wallet, event, data) {
    if (!io) {
        console.warn('Socket.io not initialized, skipping emit');
        return;
    }
    io.to(wallet.toLowerCase()).emit(event, data);
}

/**
 * Get Socket.io instance (for advanced use)
 */
export function getIO() {
    return io;
}

export default { initSocket, emitToUser, getIO };
