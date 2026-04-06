import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { verifyMessage } from 'viem';
import { z } from 'zod';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { getUserRole } from '../config/blockchain.js';

const router = Router();

const loginSchema = z.object({
    walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    signature: z.string(),
    message: z.string(),
});

const registerPubKeySchema = z.object({
    publicKey: z.string().min(1),
});

const encryptionKeySchema = z.object({
    encryptionPublicKey: z.string().min(1),
    signature: z.string().min(1),
    message: z.string().min(1),
});

const USER_SELECT = {
    walletAddress: true,
    publicKey: true,
    encryptionPublicKey: true,
    email: true,
    fullName: true,
    createdAt: true,
    lastLogin: true,
};

function buildAppRoles(roleFlags = {}) {
    const roleSet = new Set();

    if (roleFlags.isMinistry) {
        roleSet.add('ministry');
    }
    if (roleFlags.isOrg || roleFlags.isVerifiedOrg || roleFlags.isActiveOrgAdmin) {
        roleSet.add('org');
    }
    if (roleFlags.isDoctor || roleFlags.isVerifiedDoctor) {
        roleSet.add('doctor');
    }
    if (roleFlags.isPatient) {
        roleSet.add('patient');
    }

    const orderedRoles = ['ministry', 'org', 'doctor', 'patient'].filter((role) => roleSet.has(role));
    return orderedRoles;
}

function buildAuthUserPayload(user, roleFlags = {}) {
    const roles = buildAppRoles(roleFlags);

    return {
        walletAddress: user.walletAddress,
        publicKey: user.publicKey,
        encryptionPublicKey: user.encryptionPublicKey,
        email: user.email,
        fullName: user.fullName,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        roles,
        ...roleFlags,
    };
}

router.get('/nonce/:address', async (req, res, next) => {
    try {
        const address = req.params.address.toLowerCase();

        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return res.status(400).json({ code: 'AUTH_INVALID_ADDRESS', error: 'Invalid address format', message: 'Invalid address format' });
        }

        let user = await prisma.user.findUnique({
            where: { walletAddress: address },
            select: { nonce: true },
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    walletAddress: address,
                    nonce: crypto.randomUUID(),
                },
                select: { nonce: true },
            });
        } else if (!user.nonce) {
            user = await prisma.user.update({
                where: { walletAddress: address },
                data: { nonce: crypto.randomUUID() },
                select: { nonce: true },
            });
        }

        const message = `Sign this message to login to EHR System.\n\nNonce: ${user.nonce}\nTimestamp: ${Date.now()}`;

        res.json({
            message,
            nonce: user.nonce,
        });
    } catch (error) {
        next(error);
    }
});

router.post('/login', async (req, res, next) => {
    try {
        const { walletAddress, signature, message } = loginSchema.parse(req.body);
        const address = walletAddress.toLowerCase();

        const currentUser = await prisma.user.findUnique({
            where: { walletAddress: address },
            select: {
                ...USER_SELECT,
                nonce: true,
            },
        });

        if (!currentUser) {
            return res.status(404).json({ code: 'AUTH_USER_NOT_FOUND', error: 'User not found. Get nonce first.', message: 'User not found. Get nonce first.' });
        }

        // Exact nonce match: message must contain "Nonce: <nonce>" pattern
        const noncePattern = `Nonce: ${currentUser.nonce}`;
        if (!message.includes(noncePattern)) {
            return res.status(401).json({ code: 'AUTH_INVALID_NONCE', error: 'Invalid nonce', message: 'Invalid nonce' });
        }

        const isValid = await verifyMessage({
            address: walletAddress,
            message,
            signature,
        });

        if (!isValid) {
            return res.status(401).json({ code: 'AUTH_SIGNATURE_INVALID', error: 'Invalid signature', message: 'Invalid signature' });
        }

        const refreshedUser = await prisma.user.update({
            where: { walletAddress: address },
            data: {
                nonce: crypto.randomUUID(),
                lastLogin: new Date(),
            },
            select: USER_SELECT,
        });

        const roleFlags = await getUserRole(address);
        const authUser = buildAuthUserPayload(refreshedUser, roleFlags);

        const token = jwt.sign(
            {
                walletAddress: address,
                ...roleFlags,
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.json({
            token,
            user: authUser,
            roles: authUser.roles,
        });
    } catch (error) {
        next(error);
    }
});

router.post('/register-pubkey', authenticate, async (req, res, next) => {
    try {
        const { publicKey } = registerPubKeySchema.parse(req.body);

        const user = await prisma.user.update({
            where: { walletAddress: req.user.walletAddress.toLowerCase() },
            data: { publicKey },
            select: { publicKey: true },
        });

        res.json({
            success: true,
            publicKey: user.publicKey,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/me', authenticate, async (req, res, next) => {
    try {
        const address = req.user.walletAddress.toLowerCase();

        const user = await prisma.user.findUnique({
            where: { walletAddress: address },
            select: USER_SELECT,
        });

        if (!user) {
            return res.status(401).json({ code: 'AUTH_USER_NOT_FOUND', error: 'User not found', message: 'User not found' });
        }

        const roleFlags = await getUserRole(address);
        const authUser = buildAuthUserPayload(user, roleFlags);

        res.json(authUser);
    } catch (error) {
        next(error);
    }
});

router.get('/pubkey/:address', async (req, res, next) => {
    try {
        const address = req.params.address.toLowerCase();

        const user = await prisma.user.findUnique({
            where: { walletAddress: address },
            select: { publicKey: true, walletAddress: true },
        });

        if (!user || !user.publicKey) {
            return res.status(404).json({ code: 'AUTH_PUBKEY_NOT_FOUND', error: 'Public key not found', message: 'Public key not found' });
        }

        res.json({
            walletAddress: user.walletAddress,
            publicKey: user.publicKey,
        });
    } catch (error) {
        next(error);
    }
});

router.post('/encryption-key', authenticate, async (req, res, next) => {
    try {
        const { encryptionPublicKey, signature, message } = encryptionKeySchema.parse(req.body);

        const isValid = await verifyMessage({
            address: req.user.walletAddress,
            message,
            signature,
        });

        if (!isValid) {
            return res.status(403).json({ code: 'AUTH_SIGNATURE_INVALID', error: 'Invalid signature - cannot verify wallet ownership', message: 'Invalid signature - cannot verify wallet ownership' });
        }

        if (!message.includes(encryptionPublicKey.substring(0, 20))) {
            return res.status(400).json({ code: 'AUTH_KEY_MISMATCH', error: 'Message does not reference the public key', message: 'Message does not reference the public key' });
        }

        const user = await prisma.user.update({
            where: { walletAddress: req.user.walletAddress.toLowerCase() },
            data: { encryptionPublicKey },
            select: { encryptionPublicKey: true },
        });

        res.json({
            success: true,
            encryptionPublicKey: user.encryptionPublicKey,
        });
    } catch (error) {
        next(error);
    }
});

router.get('/encryption-key/:address', async (req, res, next) => {
    try {
        const address = req.params.address.toLowerCase();

        const user = await prisma.user.findUnique({
            where: { walletAddress: address },
            select: { encryptionPublicKey: true, walletAddress: true },
        });

        if (!user) {
            return res.status(404).json({ code: 'AUTH_USER_NOT_FOUND', error: 'User not found', message: 'User not found' });
        }

        if (!user.encryptionPublicKey) {
            return res.status(404).json({ code: 'AUTH_ENCRYPTION_KEY_NOT_FOUND', error: 'Encryption key not registered', message: 'Encryption key not registered' });
        }

        res.json({
            walletAddress: user.walletAddress,
            encryptionPublicKey: user.encryptionPublicKey,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
