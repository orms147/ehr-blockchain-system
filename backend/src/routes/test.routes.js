import { Router } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database.js';

const router = Router();

/**
 * TEST ROUTES - ONLY FOR DEVELOPMENT
 * Remove or disable in production!
 */

// POST /api/test/create-test-user - Create user and get token without signature
router.post('/create-test-user', async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Test routes disabled in production' });
        }

        const { walletAddress } = req.body;

        if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            return res.status(400).json({ error: 'Invalid wallet address' });
        }

        const address = walletAddress.toLowerCase();

        // Create or update user
        const user = await prisma.user.upsert({
            where: { walletAddress: address },
            update: { lastLogin: new Date() },
            create: { walletAddress: address }
        });

        // Generate JWT
        const token = jwt.sign(
            {
                walletAddress: address,
                isPatient: true,
                isDoctor: false,
                isVerifiedDoctor: false,
                isTestUser: true
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Test user created successfully',
            user: {
                id: user.id,
                walletAddress: user.walletAddress,
                createdAt: user.createdAt
            },
            token
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/test/create-test-record - Create a test record
router.post('/create-test-record', async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Test routes disabled in production' });
        }

        const { walletAddress, cidHash, recordTypeHash } = req.body;

        if (!walletAddress || !cidHash) {
            return res.status(400).json({ error: 'walletAddress and cidHash required' });
        }

        const address = walletAddress.toLowerCase();
        const cidHashLower = cidHash.toLowerCase();

        // Ensure user exists
        await prisma.user.upsert({
            where: { walletAddress: address },
            update: {},
            create: { walletAddress: address }
        });

        // Create record
        const record = await prisma.recordMetadata.create({
            data: {
                cidHash: cidHashLower,
                ownerAddress: address,
                createdBy: address,
                recordTypeHash: recordTypeHash?.toLowerCase() || null
            }
        });

        res.status(201).json({
            message: 'Test record created',
            record
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/test/all-users - Get all users
router.get('/all-users', async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Test routes disabled in production' });
        }

        const users = await prisma.user.findMany({
            include: {
                _count: {
                    select: {
                        ownedRecords: true,
                        sentKeys: true,
                        receivedKeys: true
                    }
                }
            }
        });

        res.json(users);
    } catch (error) {
        next(error);
    }
});

// GET /api/test/all-records - Get all records
router.get('/all-records', async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Test routes disabled in production' });
        }

        const records = await prisma.recordMetadata.findMany({
            include: {
                keyShares: true
            }
        });

        res.json(records);
    } catch (error) {
        next(error);
    }
});

// GET /api/test/all-key-shares - Get all key shares
router.get('/all-key-shares', async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Test routes disabled in production' });
        }

        const keyShares = await prisma.keyShare.findMany({
            include: {
                sender: { select: { walletAddress: true } },
                recipient: { select: { walletAddress: true } }
            }
        });

        res.json(keyShares);
    } catch (error) {
        next(error);
    }
});

// DELETE /api/test/reset-db - Clear all data (dangerous!)
router.delete('/reset-db', async (req, res, next) => {
    try {
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'Test routes disabled in production' });
        }

        // Delete in correct order (foreign keys)
        await prisma.accessLog.deleteMany();
        await prisma.keyShare.deleteMany();
        await prisma.recordMetadata.deleteMany();
        await prisma.user.deleteMany();

        res.json({ message: 'Database reset successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;
