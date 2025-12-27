// Request Routes - API for access request management
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { createPublicClient, http, keccak256, encodePacked } from 'viem';

import { arbitrumSepolia } from 'viem/chains';

const router = Router();

// Contract config
const EHR_SYSTEM_ADDRESS = process.env.EHR_SYSTEM_ADDRESS;

// Note: getAccessRequest ABI for reading request status from blockchain
const EHR_SYSTEM_ABI = [
    {
        name: 'getAccessRequest',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'reqId', type: 'bytes32' }],
        outputs: [{
            type: 'tuple',
            components: [
                { name: 'requester', type: 'address' },
                { name: 'patient', type: 'address' },
                { name: 'rootCidHash', type: 'bytes32' },
                { name: 'encKeyHash', type: 'bytes32' },
                { name: 'reqType', type: 'uint8' },
                { name: 'expiry', type: 'uint40' },
                { name: 'consentDuration', type: 'uint40' },
                { name: 'firstApprovalTime', type: 'uint40' },
                { name: 'status', type: 'uint8' },
            ],
        }],
    },
];

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
});


// Validation schemas
const createRequestSchema = z.object({
    patientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    cidHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
    requestType: z.number().min(0).max(2),
    durationDays: z.number().min(1).max(365).default(7),
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
    onChainReqId: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
});

// Request Status enum
const RequestStatus = {
    PENDING: 0,
    APPROVED: 1,
    REJECTED: 2,
    EXPIRED: 3,
};

// Helper to serialize AccessRequest for JSON (BigInt -> String)
const serializeRequest = (request) => ({
    ...request,
    signatureDeadline: request.signatureDeadline?.toString() || null,
});

// Store for tracking requests (in production, use proper event indexing or The Graph)
// For now, we'll store request metadata in database
// This is a simplified version - in production, use events from blockchain

// GET /api/requests/incoming - Get requests made TO current user (as Patient)
router.get('/incoming', authenticate, async (req, res, next) => {
    try {
        const patientAddress = req.user.walletAddress.toLowerCase();

        // Get archived requests to filter them out
        const archivedRequests = await prisma.archivedRequest.findMany({
            where: { userAddress: patientAddress },
            select: { requestId: true },
        });
        const archivedIds = new Set(archivedRequests.map(r => r.requestId));

        // Get requests from database (stored when Doctor creates request)
        // Include both pending and signed (patient approved but doctor hasn't claimed)
        const requests = await prisma.accessRequest.findMany({
            where: {
                patientAddress: patientAddress,
                status: { in: ['pending', 'signed'] },
            },
            orderBy: { createdAt: 'desc' },
        });

        // Filter out archived requests
        const filteredRequests = requests.filter(r => !archivedIds.has(r.requestId));

        res.json({
            count: filteredRequests.length,
            requests: filteredRequests.map(serializeRequest),
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/requests/outgoing - Get requests made BY current user (as Doctor)
router.get('/outgoing', authenticate, async (req, res, next) => {
    try {
        const doctorAddress = req.user.walletAddress.toLowerCase();

        const requests = await prisma.accessRequest.findMany({
            where: { requesterAddress: doctorAddress },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: requests.length,
            requests: requests.map(serializeRequest),
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/requests/signed - Get requests that Patient signed (for Doctor to claim)
// IMPORTANT: Must be BEFORE /:requestId to avoid matching 'signed' as a requestId
router.get('/signed', authenticate, async (req, res, next) => {
    try {
        const doctorAddress = req.user.walletAddress.toLowerCase();

        // Get requests where Doctor is requester AND status is 'signed'
        const requests = await prisma.accessRequest.findMany({
            where: {
                requesterAddress: doctorAddress,
                status: 'signed',
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json({
            count: requests.length,
            requests: requests.map(serializeRequest),
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/requests/:requestId - Get request details
router.get('/:requestId', authenticate, async (req, res, next) => {
    try {
        const { requestId } = req.params;

        // Try to get from database first
        const dbRequest = await prisma.accessRequest.findUnique({
            where: { requestId: requestId },
        });

        if (dbRequest) {
            return res.json(dbRequest);
        }

        // If not in DB, try to get from blockchain
        if (EHR_SYSTEM_ADDRESS) {
            try {
                const onChainRequest = await publicClient.readContract({
                    address: EHR_SYSTEM_ADDRESS,
                    abi: EHR_SYSTEM_ABI,
                    functionName: 'getAccessRequest',
                    args: [requestId],
                });

                return res.json({
                    requestId,
                    requesterAddress: onChainRequest.requester,
                    patientAddress: onChainRequest.patient,
                    cidHash: onChainRequest.cidHash,
                    requestType: onChainRequest.requestType,
                    status: ['pending', 'approved', 'rejected', 'expired'][onChainRequest.status],
                    createdAt: new Date(Number(onChainRequest.createdAt) * 1000),
                    deadline: new Date(Number(onChainRequest.deadline) * 1000),
                });
            } catch (e) {
                console.error('Error reading from blockchain:', e);
            }
        }

        res.status(404).json({ error: 'Request not found' });
    } catch (error) {
        next(error);
    }
});

// POST /api/requests/create - Create a new access request (Doctor calls this AFTER on-chain tx)
router.post('/create', authenticate, async (req, res, next) => {
    try {
        const { patientAddress, cidHash, requestType, durationDays, txHash, onChainReqId } = createRequestSchema.parse(req.body);
        const doctorAddress = req.user.walletAddress.toLowerCase();

        // Calculate deadline
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + durationDays);

        // Use on-chain reqId if provided, otherwise generate fallback ID
        const requestId = onChainReqId || keccak256(
            encodePacked(
                ['address', 'address', 'bytes32', 'uint256'],
                [doctorAddress, patientAddress.toLowerCase(), cidHash, BigInt(Math.floor(Date.now() / 1000))]
            )
        );

        // Store in database for tracking
        const request = await prisma.accessRequest.create({
            data: {
                requestId: requestId, // This is now the on-chain reqId
                requesterAddress: doctorAddress,
                patientAddress: patientAddress.toLowerCase(),
                cidHash: cidHash,
                requestType: requestType,
                status: 'pending',
                deadline: deadline,
                txHash: txHash || null,
            },
        });

        res.json({
            success: true,
            request: request,
            message: 'Request recorded successfully.',
            onChainReqId: onChainReqId,
        });
    } catch (error) {
        next(error);
    }
});

// GET /api/requests/:requestId/approval-message - Get EIP-712 message for signing
router.get('/:requestId/approval-message', authenticate, async (req, res, next) => {
    try {
        const { requestId } = req.params;

        // Get request from database
        const request = await prisma.accessRequest.findUnique({
            where: { requestId: requestId },
        });

        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        // Create EIP-712 typed data for signing - MUST MATCH CONTRACT CONFIRM_TYPEHASH
        // Contract: "ConfirmRequest(bytes32 reqId,address requester,address patient,bytes32 rootCidHash,uint8 reqType,uint256 deadline)"
        const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now

        const typedData = {
            domain: {
                name: 'EHR System Secure', // Must match EIP712("EHR System Secure", "2")
                version: '2',
                chainId: parseInt(process.env.CHAIN_ID || '421614'),
                verifyingContract: EHR_SYSTEM_ADDRESS,
            },
            types: {
                ConfirmRequest: [
                    { name: 'reqId', type: 'bytes32' },
                    { name: 'requester', type: 'address' },
                    { name: 'patient', type: 'address' },
                    { name: 'rootCidHash', type: 'bytes32' },
                    { name: 'reqType', type: 'uint8' },
                    { name: 'deadline', type: 'uint256' },
                ],
            },
            primaryType: 'ConfirmRequest',
            message: {
                reqId: requestId,
                requester: request.requesterAddress,
                patient: request.patientAddress,
                rootCidHash: request.cidHash,
                reqType: request.requestType,
                deadline: deadline,
            },
        };

        res.json({
            typedData,
            deadline,
            requestId,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/requests/approve-with-sig - Patient signs approval (Doctor will claim later)
router.post('/approve-with-sig', authenticate, async (req, res, next) => {
    try {
        const { requestId, signature, deadline, encryptedKeyPayload, cidHash, senderPublicKey } = req.body;
        const patientAddress = req.user.walletAddress.toLowerCase();

        // Verify patient owns this request
        const request = await prisma.accessRequest.findUnique({
            where: { requestId: requestId },
        });

        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        if (request.patientAddress !== patientAddress) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Store signature - Doctor will claim on-chain
        await prisma.accessRequest.update({
            where: { requestId: requestId },
            data: {
                status: 'signed',
                signature: signature,
                signatureDeadline: BigInt(deadline),
            },
        });

        // If encrypted key payload provided, create KeyShare entry for Doctor
        // Status 'awaiting_claim' means Doctor must claim on-chain before accessing
        if (encryptedKeyPayload && cidHash) {
            // Create or update KeyShare so Doctor can retrieve encrypted key AFTER on-chain claim
            // Use upsert to handle case where KeyShare already exists
            await prisma.keyShare.upsert({
                where: {
                    cidHash_senderAddress_recipientAddress: {
                        cidHash: cidHash,
                        senderAddress: patientAddress,
                        recipientAddress: request.requesterAddress,
                    }
                },
                update: {
                    encryptedPayload: encryptedKeyPayload,
                    senderPublicKey: senderPublicKey || null,
                    status: 'awaiting_claim',
                    expiresAt: new Date(Number(deadline) * 1000),
                },
                create: {
                    senderAddress: patientAddress,
                    recipientAddress: request.requesterAddress,
                    cidHash: cidHash,
                    encryptedPayload: encryptedKeyPayload,
                    senderPublicKey: senderPublicKey || null,
                    status: 'awaiting_claim',
                    expiresAt: new Date(Number(deadline) * 1000),
                },
            });
            console.log(`✅ KeyShare created/updated for Doctor ${request.requesterAddress} (awaiting on-chain claim)`);
        }

        res.json({
            success: true,
            message: 'Approval signed. Doctor can now claim access.',
            keyShared: !!encryptedKeyPayload,
        });
    } catch (error) {
        next(error);
    }
});

// POST /api/requests/mark-claimed - Mark request as claimed after Doctor submits on-chain
router.post('/mark-claimed', authenticate, async (req, res, next) => {
    try {
        const { requestId, claimTxHash } = req.body;
        const doctorAddress = req.user.walletAddress.toLowerCase();

        // Verify doctor owns this request
        const request = await prisma.accessRequest.findUnique({
            where: { requestId: requestId },
        });

        if (!request || request.requesterAddress !== doctorAddress) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Update status to claimed
        await prisma.accessRequest.update({
            where: { requestId: requestId },
            data: {
                status: 'claimed',
                txHash: claimTxHash,
            },
        });

        // IMPORTANT: Also update KeyShare status from 'awaiting_claim' to 'pending'
        // This allows Doctor to now access the shared record
        const updatedKeyShare = await prisma.keyShare.updateMany({
            where: {
                recipientAddress: doctorAddress,
                cidHash: request.cidHash,
                status: 'awaiting_claim',
            },
            data: {
                status: 'pending',
            },
        });

        console.log(`✅ KeyShare activated for Doctor ${doctorAddress}, records updated: ${updatedKeyShare.count}`);

        res.json({
            success: true,
            message: 'Request marked as claimed.',
            keyShareActivated: updatedKeyShare.count > 0,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
