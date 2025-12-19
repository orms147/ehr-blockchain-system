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
    try {
        const hasAccess = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.ConsentLedger,
            abi: CONSENT_LEDGER_ABI,
            functionName: 'canAccess',
            args: [patientAddress, granteeAddress, cidHash],
        });
        return hasAccess;
    } catch (error) {
        console.error('Error checking consent:', error);
        return false;
    }
}

// Helper: Check user role
export async function getUserRole(address) {
    try {
        const [isPatient, isDoctor, isVerifiedDoctor] = await Promise.all([
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
        ]);

        return {
            isPatient,
            isDoctor,
            isVerifiedDoctor,
        };
    } catch (error) {
        console.error('Error getting user role:', error);
        return { isPatient: false, isDoctor: false, isVerifiedDoctor: false };
    }
}
