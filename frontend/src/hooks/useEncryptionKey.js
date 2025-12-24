/**
 * Hook to register NaCl encryption public key on backend
 * Should be called after user login to ensure encryption keys are set up
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/services/api';
import {
    getOrCreateEncryptionKeypair,
    getCachedPublicKey,
    hasEncryptionKeypair,
    getKeyDerivationMessage
} from '@/services/nacl-crypto';

export function useEncryptionKey(provider, walletAddress) {
    const [registered, setRegistered] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Register encryption public key with backend
    const registerKey = useCallback(async () => {
        if (!provider || !walletAddress) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. Get or create local keypair
            const keypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

            // 2. Check if already registered on backend
            try {
                const existing = await api.get(`/api/auth/encryption-key/${walletAddress}`);
                if (existing.encryptionPublicKey === keypair.publicKey) {
                    console.log('✅ Encryption key already registered');
                    setRegistered(true);
                    setLoading(false);
                    return;
                }
            } catch (err) {
                // 404 means not registered yet - continue
                if (err.response?.status !== 404) {
                    console.warn('Error checking existing key:', err);
                }
            }

            // 3. Sign message to prove ownership
            const message = `Register encryption key for EHR\nPublic Key: ${keypair.publicKey}\nWallet: ${walletAddress}\nTimestamp: ${Date.now()}`;
            const signature = await provider.request({
                method: 'personal_sign',
                params: [message, walletAddress],
            });

            // 4. Register on backend
            await api.post('/api/auth/encryption-key', {
                encryptionPublicKey: keypair.publicKey,
                signature,
                message,
            });

            console.log('✅ Encryption key registered on backend');
            setRegistered(true);
        } catch (err) {
            console.error('Failed to register encryption key:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [provider, walletAddress]);

    // Auto-register on mount if not already registered
    // Delay to avoid conflict with Web3Auth network switching
    useEffect(() => {
        if (provider && walletAddress) {
            const timer = setTimeout(() => {
                registerKey();
            }, 2000); // Wait 2s for network switch to complete
            return () => clearTimeout(timer);
        }
    }, [provider, walletAddress, registerKey]);

    // Lazy check for localStorage values (only in browser)
    const hasLocalKeypair = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return hasEncryptionKeypair();
    }, []);

    const cachedPublicKey = useMemo(() => {
        if (typeof window === 'undefined') return null;
        return getCachedPublicKey();
    }, []);

    return {
        registered,
        loading,
        error,
        registerKey,
        hasLocalKeypair,
        cachedPublicKey,
    };
}

export default useEncryptionKey;

