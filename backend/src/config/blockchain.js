import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

// Contract ABIs (minimal - only functions we need)
export const CONSENT_LEDGER_ABI = [
    {
        name: 'canAccess',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'patient', type: 'address' },
            { name: 'grantee', type: 'address' },
            { name: 'cidHash', type: 'bytes32' }
        ],
        outputs: [{ type: 'bool' }]
    }
];

export const ACCESS_CONTROL_ABI = [
    {
        name: 'isPatient',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }]
    },
    {
        name: 'isDoctor',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }]
    },
    {
        name: 'isVerifiedDoctor',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }]
    },
    {
        name: 'isMinistry',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }]
    },
    {
        name: 'isOrganization',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }]
    },
    {
        name: 'isVerifiedOrganization',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'bool' }]
    },
    // NEW: Organization Entity functions
    {
        name: 'isActiveOrgAdmin',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ type: 'bool' }]
    },
    {
        name: 'getAdminOrgId',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'admin', type: 'address' }],
        outputs: [{ type: 'uint256' }]
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
                { name: 'active', type: 'bool' }
            ]
        }]
    }
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

// Helper: Check if user has consent to access a record
export async function checkConsent(patientAddress, granteeAddress, cidHash) {
    if (!cidHash) {
        console.warn(`[BLOCKCHAIN] checkConsent called with empty cidHash! Denying.`);
        return false;
    }
    // Debug log to trace invalid access
    // console.log(`[BLOCKCHAIN] Checking consent: Patient=${patientAddress}, Grantee=${granteeAddress}, CID=${cidHash}`);

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

            // if (hasAccess) console.log(`[BLOCKCHAIN] ACCESS GRANTED for ${cidHash}`);

            return hasAccess;
        } catch (error) {
            attempt++;
            const isRateLimit = error.message?.includes('429') || error.message?.includes('Too Many Requests');

            if (isRateLimit && attempt < MAX_RETRIES) {
                const delay = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s...
                console.warn(`[RPC] 429 Rate Limit in checkConsent. Retrying in ${delay}ms (Attempt ${attempt}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // If contract revert or other error, return false (deny access)
                console.error(`[RPC] Error checking consent (Attempt ${attempt}/${MAX_RETRIES}):`, error.message);
                if (attempt >= MAX_RETRIES) return false;
            }
        }
    }
    return false;
}

// Helper: Check user role (includes Ministry, ORG, and Org Admin)
export async function getUserRole(address) {
    try {
        const [isPatient, isDoctor, isVerifiedDoctor, isMinistry, isOrg, isVerifiedOrg, isActiveOrgAdmin, adminOrgId] = await Promise.all([
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.AccessControl,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isPatient',
                args: [address],
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.AccessControl,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isDoctor',
                args: [address],
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.AccessControl,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isVerifiedDoctor',
                args: [address],
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.AccessControl,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isMinistry',
                args: [address],
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.AccessControl,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isOrganization',
                args: [address],
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.AccessControl,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isVerifiedOrganization',
                args: [address],
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.AccessControl,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isActiveOrgAdmin',
                args: [address],
            }),
            publicClient.readContract({
                address: CONTRACT_ADDRESSES.AccessControl,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'getAdminOrgId',
                args: [address],
            }),
        ]);

        // Convert BigInt to number for orgId
        const orgId = adminOrgId > 0n ? Number(adminOrgId) : null;

        // If user is org admin, fetch org details
        let orgName = null;
        if (orgId) {
            try {
                const org = await publicClient.readContract({
                    address: CONTRACT_ADDRESSES.AccessControl,
                    abi: ACCESS_CONTROL_ABI,
                    functionName: 'getOrganization',
                    args: [adminOrgId],
                });
                orgName = org.name;
            } catch (e) {
                console.error('Error fetching org details:', e);
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
    } catch (error) {
        console.error('Error getting user role:', error);
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

