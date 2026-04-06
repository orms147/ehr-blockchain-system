import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { createLogger } from '../utils/logger.js';

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

// Public client for reading blockchain data
export const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.RPC_URL),
});

// Contract addresses
export const CONTRACT_ADDRESSES = {
    AccessControl: process.env.ACCESS_CONTROL_ADDRESS,
    ConsentLedger: process.env.CONSENT_LEDGER_ADDRESS,
    RecordRegistry: process.env.RECORD_REGISTRY_ADDRESS,
    EHRSystemSecure: process.env.EHR_SYSTEM_ADDRESS,
    DoctorUpdate: process.env.DOCTOR_UPDATE_ADDRESS,
};

function normalizeAddress(address) {
    return typeof address === 'string' ? address.toLowerCase() : address;
}

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
        publicClient.readContract({
            address: CONTRACT_ADDRESSES.AccessControl,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isPatient',
            args: [normalized],
        }),
        publicClient.readContract({
            address: CONTRACT_ADDRESSES.AccessControl,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isDoctor',
            args: [normalized],
        }),
        publicClient.readContract({
            address: CONTRACT_ADDRESSES.AccessControl,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isVerifiedDoctor',
            args: [normalized],
        }),
        publicClient.readContract({
            address: CONTRACT_ADDRESSES.AccessControl,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isMinistry',
            args: [normalized],
        }),
        publicClient.readContract({
            address: CONTRACT_ADDRESSES.AccessControl,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isOrganization',
            args: [normalized],
        }),
        publicClient.readContract({
            address: CONTRACT_ADDRESSES.AccessControl,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isVerifiedOrganization',
            args: [normalized],
        }),
        publicClient.readContract({
            address: CONTRACT_ADDRESSES.AccessControl,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'isActiveOrgAdmin',
            args: [normalized],
        }),
        publicClient.readContract({
            address: CONTRACT_ADDRESSES.AccessControl,
            abi: ACCESS_CONTROL_ABI,
            functionName: 'getAdminOrgId',
            args: [normalized],
        }),
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

    return {
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
}

export async function getUserRoleStrict(address) {
    return readUserRole(address);
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
