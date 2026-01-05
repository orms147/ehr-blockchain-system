import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { verifyMessage } from 'viem';
import { z } from 'zod';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { getUserRole } from '../config/blockchain.js';

const router = Router();

// Validation schemas
const loginSchema = z.object({
    walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    signature: z.string(),
    message: z.string(),
});

const registerPubKeySchema = z.object({
    publicKey: z.string().min(1),
});

// GET /api/auth/nonce/:address - Get nonce for signing
router.get('/nonce/:address', async (req, res, next) => {
    try {
        const address = req.params.address.toLowerCase();

        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return res.status(400).json({ error: 'Invalid address format' });
        }

        // Find or create user
        let user = await prisma.user.findUnique({
            where: { walletAddress: address }
        });

        if (!user) {
            user = await prisma.user.create({
                data: { walletAddress: address }
            });
        }

        // Always generate fresh nonce on each request (SIWE standard)
        const crypto = await import('crypto');
        const freshNonce = crypto.randomUUID();

        await prisma.user.update({
            where: { walletAddress: address },
            data: { nonce: freshNonce }
        });

        // Return message with fresh nonce for signing
        const message = `Sign this message to login to EHR System.\n\nNonce: ${freshNonce}\nTimestamp: ${Date.now()}`;

        res.json({
            message,
            nonce: freshNonce
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/auth/login - Verify signature and return JWT
router.post('/login', async (req, res, next) => {
    try {
        const { walletAddress, signature, message } = loginSchema.parse(req.body);
        const address = walletAddress.toLowerCase();

        // Get user
        const user = await prisma.user.findUnique({
            where: { walletAddress: address }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found. Get nonce first.' });
        }

        // Verify nonce is in message
        if (!message.includes(user.nonce)) {
            return res.status(401).json({ error: 'Invalid nonce' });
        }

        // Verify signature
        const isValid = await verifyMessage({
            address: walletAddress,
            message,
            signature,
        });

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Rotate nonce for next login
        const newNonce = crypto.randomUUID();
        await prisma.user.update({
            where: { walletAddress: address },
            data: {
                nonce: newNonce,
                lastLogin: new Date()
            }
        });

        // Get on-chain roles
        const roles = await getUserRole(walletAddress);

        // Generate JWT
        const token = jwt.sign(
            {
                walletAddress: address,
                ...roles
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.json({
            token,
            user: {
                walletAddress: address,
                publicKey: user.publicKey,
                ...roles
            }
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/auth/register-pubkey - Register encryption public key
router.post('/register-pubkey', authenticate, async (req, res, next) => {
    try {
        const { publicKey } = registerPubKeySchema.parse(req.body);

        const user = await prisma.user.update({
            where: { walletAddress: req.user.walletAddress },
            data: { publicKey }
        });

        res.json({
            success: true,
            publicKey: user.publicKey
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/auth/me - Get current user info
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const roles = await getUserRole(req.user.walletAddress);

        res.json({
            walletAddress: req.user.walletAddress,
            publicKey: req.user.publicKey,
            createdAt: req.user.createdAt,
            lastLogin: req.user.lastLogin,
            ...roles
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/auth/pubkey/:address - Get public key of another user
router.get('/pubkey/:address', async (req, res, next) => {
    try {
        const address = req.params.address.toLowerCase();

        const user = await prisma.user.findUnique({
            where: { walletAddress: address },
            select: { publicKey: true, walletAddress: true }
        });

        if (!user || !user.publicKey) {
            return res.status(404).json({ error: 'Public key not found' });
        }

        res.json({
            walletAddress: user.walletAddress,
            publicKey: user.publicKey
        });
    } catch (error) {
        next(error);
    }
});

// ==================== NaCl Encryption Key Endpoints ====================

// Schema for registering encryption key
const encryptionKeySchema = z.object({
    encryptionPublicKey: z.string().min(1),
    signature: z.string().min(1),
    message: z.string().min(1),
});

// POST /api/auth/encryption-key - Register NaCl encryption public key with signature verification
router.post('/encryption-key', authenticate, async (req, res, next) => {
    try {
        const { encryptionPublicKey, signature, message } = encryptionKeySchema.parse(req.body);

        // Verify signature proves wallet ownership
        const isValid = await verifyMessage({
            address: req.user.walletAddress,
            message,
            signature,
        });

        if (!isValid) {
            return res.status(403).json({ error: 'Invalid signature - cannot verify wallet ownership' });
        }

        // Verify message contains the public key (prevent replay attacks)
        if (!message.includes(encryptionPublicKey.substring(0, 20))) {
            return res.status(400).json({ error: 'Message does not reference the public key' });
        }

        const user = await prisma.user.update({
            where: { walletAddress: req.user.walletAddress },
            data: { encryptionPublicKey }
        });

        res.json({
            success: true,
            encryptionPublicKey: user.encryptionPublicKey
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/auth/encryption-key/:address - Get NaCl encryption public key of a user
router.get('/encryption-key/:address', async (req, res, next) => {
    try {
        const address = req.params.address.toLowerCase();

        const user = await prisma.user.findUnique({
            where: { walletAddress: address },
            select: { encryptionPublicKey: true, walletAddress: true }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.encryptionPublicKey) {
            return res.status(404).json({ error: 'Encryption key not registered' });
        }

        res.json({
            walletAddress: user.walletAddress,
            encryptionPublicKey: user.encryptionPublicKey
        });
    } catch (error) {
        next(error);
    }
});

export default router;
