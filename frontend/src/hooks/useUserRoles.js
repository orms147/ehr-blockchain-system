"use client";

import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { useWalletAddress } from './useWalletAddress';

// AccessControl contract address
const ACCESS_CONTROL_ADDRESS = process.env.NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS;

// Minimal ABI for role checks
import { ACCESS_CONTROL_ABI } from '@/config/contractABI';


// Public client for read operations
const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'),
});

/**
 * Hook to get user roles from AccessControl contract
 * Returns role status based on on-chain data (source of truth)
 */
export function useUserRoles() {
    const { address, loading: addressLoading } = useWalletAddress();
    const [roles, setRoles] = useState({
        isPatient: false,
        isDoctor: false,
        isVerifiedDoctor: false,
        isOrg: false,
        isVerifiedOrg: false,
        isMinistry: false,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchRoles = useCallback(async () => {
        if (!address || !ACCESS_CONTROL_ADDRESS) {
            setRoles({
                isPatient: false,
                isDoctor: false,
                isVerifiedDoctor: false,
                isOrg: false,
                isVerifiedOrg: false,
                isMinistry: false,
            });
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Use getUserStatus for single call efficiency
            const [isPatient_, isDoctor_, isDoctorVerified, isOrg, isOrgVerified, isMinistry_] =
                await publicClient.readContract({
                    address: ACCESS_CONTROL_ADDRESS,
                    abi: ACCESS_CONTROL_ABI,
                    functionName: 'getUserStatus',
                    args: [address],
                });

            setRoles({
                isPatient: isPatient_,
                isDoctor: isDoctor_,
                isVerifiedDoctor: isDoctorVerified,
                isOrg: isOrg,
                isVerifiedOrg: isOrgVerified,
                isMinistry: isMinistry_,
            });
        } catch (err) {
            console.error('[useUserRoles] Error fetching roles:', err);
            setError(err.message);
            // Fallback to individual calls if getUserStatus fails
            try {
                const [isPatient, isDoctor, isVerifiedDoctor, isOrg, isVerifiedOrg, isMinistry] =
                    await Promise.all([
                        publicClient.readContract({
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'isPatient',
                            args: [address],
                        }),
                        publicClient.readContract({
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'isDoctor',
                            args: [address],
                        }),
                        publicClient.readContract({
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'isVerifiedDoctor',
                            args: [address],
                        }),
                        publicClient.readContract({
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'isOrganization',
                            args: [address],
                        }),
                        publicClient.readContract({
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'isVerifiedOrganization',
                            args: [address],
                        }),
                        publicClient.readContract({
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'isMinistry',
                            args: [address],
                        }),
                    ]);

                setRoles({
                    isPatient,
                    isDoctor,
                    isVerifiedDoctor,
                    isOrg,
                    isVerifiedOrg,
                    isMinistry,
                });
                setError(null);
            } catch (fallbackErr) {
                console.error('[useUserRoles] Fallback also failed:', fallbackErr);
                setError(fallbackErr.message);
            }
        } finally {
            setLoading(false);
        }
    }, [address]);

    useEffect(() => {
        if (!addressLoading) {
            fetchRoles();
        }
    }, [address, addressLoading, fetchRoles]);

    return {
        ...roles,
        loading: loading || addressLoading,
        error,
        refetch: fetchRoles,
        address,
    };
}

export default useUserRoles;
