import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { createLogger } from '../utils/logger.js';
import { withRpcRetry } from '../utils/rpcRetry.js';
import { normalizeAddress } from '../utils/normalize.js';

const log = createLogger('Blockchain');

// Contract ABIs (minimal - only functions we need)
export const CONSENT_LEDGER_ABI = [
    {
        name: 'canAccess',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'patient', type: 'address' },
            { name: 'grantee', type: 'address' },
            { name: 'cidHash', type: 'bytes32' },
        ],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'getConsent',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'patient', type: 'address' },
            { name: 'grantee', type: 'address' },
            { name: 'rootCidHash', type: 'bytes32' },
        ],
        outputs: [{
            type: 'tuple',
            components: [
                { name: 'patient', type: 'address' },
                { name: 'grantee', type: 'address' },
                { name: 'rootCidHash', type: 'bytes32' },
                { name: 'encKeyHash', type: 'bytes32' },
                { name: 'issuedAt', type: 'uint40' },
                { name: 'expireAt', type: 'uint40' },
                { name: 'active', type: 'bool' },
                { name: 'allowDelegate', type: 'bool' },
            ],
        }],
    },
];

export const ACCESS_CONTROL_ABI = [
    {
        name: 'isPatient',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'isDoctor',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'isVerifiedDoctor',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'isMinistry',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'isOrganization',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'isVerifiedOrganization',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'isActiveOrgAdmin',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ type: 'bool' }],
    },
    {
        name: 'getAdminOrgId',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'admin', type: 'address' }],
        outputs: [{ type: 'uint256' }],
    },
    {
        name: 'getOrganization',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'orgId', type: 'uint256' }],
        outputs: [{
            type: 'tuple',
            components: [
                { name: 'id', type: 'uint256' },
                { name: 'name', type: 'string' },
                { name: 'primaryAdmin', type: 'address' },
                { name: 'backupAdmin', type: 'address' },
                { name: 'createdAt', type: 'uint40' },
                { name: 'active', type: 'bool' },
            ],
        }],
    },
];

// Public client for reading blockchain data. viem's transport retry is
// disabled — `withRpcRetry` (utils/rpcRetry.js) is the single retry layer at
// the app level, with longer exponential backoff tuned for Alchemy free-tier
// 429s. Stacking both layers used to multiply delays into ~26s hangs. Override
// only if running against an RPC that needs a separate transport-level retry.
export const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL, {
        retryCount: Number(process.env.RPC_TRANSPORT_RETRIES ?? 0),
        retryDelay: Number(process.env.RPC_TRANSPORT_RETRY_DELAY_MS ?? 0),
    }),
});

// In-memory cache for on-chain role flags. The middleware fires on every
// authenticated request and triggers 8+ readContract calls — without cache,
// even modest traffic blows past Alchemy free tier 300 CU/sec. Roles change
// rarely (DoctorVerified events are infrequent), so a 60s TTL is a fair
// trade-off between freshness and RPC pressure. Override via env.
// 10 min default. Subgraph polls Doctor.verifiedAt every SUBGRAPH_POLL_MS
// (30s) and explicitly invalidates the cache for newly-verified doctors via
// invalidateRoleCache(), so the long TTL doesn't lag verification flow.
// VerificationRevoked events have no subgraph signal — those still wait for
// the TTL to expire (admin action, rare; 10 min is acceptable).
const ROLE_CACHE_TTL_MS = Number(process.env.ROLE_CACHE_TTL_MS ?? 600_000);
const roleCache = new Map(); // address -> { value, expiresAt }

function getCachedRole(address) {
    const entry = roleCache.get(address);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        roleCache.delete(address);
        return null;
    }
    return entry.value;
}

function setCachedRole(address, value) {
    roleCache.set(address, { value, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
}

// Contract addresses
export const CONTRACT_ADDRESSES = {
    AccessControl: process.env.ACCESS_CONTROL_ADDRESS,
    ConsentLedger: process.env.CONSENT_LEDGER_ADDRESS,
    RecordRegistry: process.env.RECORD_REGISTRY_ADDRESS,
    EHRSystemSecure: process.env.EHR_SYSTEM_ADDRESS,
    DoctorUpdate: process.env.DOCTOR_UPDATE_ADDRESS,
};

// Helper: Check if user has consent to access a record
export async function checkConsent(patientAddress, granteeAddress, cidHash) {
    if (!cidHash) {
        log.warn('checkConsent called with empty cidHash, denying');
        return false;
    }

    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
        try {
            const hasAccess = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.ConsentLedger,
                abi: CONSENT_LEDGER_ABI,
                functionName: 'canAccess',
                args: [patientAddress, granteeAddress, cidHash],
            });

            return hasAccess;
        } catch (error) {
            attempt += 1;
            const isRateLimit = error?.message?.includes('429') || error?.message?.includes('Too Many Requests');

            if (isRateLimit && attempt < MAX_RETRIES) {
                const delay = 1000 * Math.pow(2, attempt);
                log.warn('RPC 429 in checkConsent, retrying', { delay, attempt, maxRetries: MAX_RETRIES });
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                log.error('Error checking consent', { attempt, maxRetries: MAX_RETRIES, error: error?.message || error });
                if (attempt >= MAX_RETRIES) return false;
            }
        }
    }

    return false;
}

async function readUserRole(address) {
    const normalized = normalizeAddress(address);

    // Cache hit fast-path — avoids 8 readContract calls on every API request.
    const cached = getCachedRole(normalized);
    if (cached) return cached;

    // Each call wrapped with withRpcRetry so a single 429 in the burst doesn't
    // poison the whole role lookup (and from there poison the request that
    // depends on it). Promise.all means parallel; retries happen per-call.
    const callRead = (functionName) => withRpcRetry(
        () => publicClient.readContract({
            address: CONTRACT_ADDRESSES.AccessControl,
            abi: ACCESS_CONTROL_ABI,
            functionName,
            args: [normalized],
        }),
        { label: `readUserRole.${functionName}` },
    );

    const [
        isPatient,
        isDoctor,
        isVerifiedDoctor,
        isMinistry,
        isOrg,
        isVerifiedOrg,
        isActiveOrgAdmin,
        adminOrgId,
    ] = await Promise.all([
        callRead('isPatient'),
        callRead('isDoctor'),
        callRead('isVerifiedDoctor'),
        callRead('isMinistry'),
        callRead('isOrganization'),
        callRead('isVerifiedOrganization'),
        callRead('isActiveOrgAdmin'),
        callRead('getAdminOrgId'),
    ]);

    const orgId = adminOrgId > 0n ? Number(adminOrgId) : null;

    let orgName = null;
    if (orgId) {
        try {
            const org = await publicClient.readContract({
                address: CONTRACT_ADDRESSES.AccessControl,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'getOrganization',
                args: [adminOrgId],
            });
            orgName = org?.name || null;
        } catch (error) {
            log.error('Error fetching org details', { error: error.message });
        }
    }

    const result = {
        isPatient,
        isDoctor,
        isVerifiedDoctor,
        isMinistry,
        isOrg,
        isVerifiedOrg,
        isActiveOrgAdmin,
        orgId,
        orgName,
    };
    setCachedRole(normalized, result);
    return result;
}

export async function getUserRoleStrict(address) {
    return readUserRole(address);
}

/**
 * Invalidate cached role for an address. Call after any tx that changes the
 * role (registerAsPatient, verifyDoctor, etc.) so the next request re-reads.
 */
export function invalidateRoleCache(address) {
    if (typeof address === 'string') {
        roleCache.delete(address.toLowerCase());
    }
}

// Safe wrapper with retry — used by auth routes.
// Retries on 429 (RPC rate limit) to avoid returning empty roles after registration.
export async function getUserRole(address) {
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await readUserRole(address);
        } catch (error) {
            const isRateLimit =
                error?.message?.includes('429') || error?.message?.includes('Too Many Requests');

            if (isRateLimit && attempt < MAX_RETRIES) {
                const delay = 1000 * (attempt + 1);
                log.warn('RPC 429 in getUserRole, retrying', { delay, attempt: attempt + 1, maxRetries: MAX_RETRIES });
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }

            log.error('Error getting user role', { error: error?.message || error });
            return {
                isPatient: false,
                isDoctor: false,
                isVerifiedDoctor: false,
                isMinistry: false,
                isOrg: false,
                isVerifiedOrg: false,
                isActiveOrgAdmin: false,
                orgId: null,
                orgName: null,
            };
        }
    }
}
