"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import profileService from '@/services/profile.service';

/**
 * Hook to resolve wallet addresses to user display names.
 * Uses batch lookup and caches results in memory.
 * 
 * Usage:
 *   const { getName, loading } = useUserProfile();
 *   const name = getName('0x...'); // Returns "Nguyễn Văn A" or "0x...1234"
 */
export function useUserProfile() {
    const cacheRef = useRef({});
    const [loading, setLoading] = useState(false);
    const pendingRef = useRef(new Set());
    const timerRef = useRef(null);

    // Batch resolve: collect addresses and resolve in one API call
    const resolve = useCallback((address) => {
        if (!address) return;
        const normalized = address.toLowerCase();

        // Already cached
        if (cacheRef.current[normalized]) return;

        // Already pending
        if (pendingRef.current.has(normalized)) return;

        pendingRef.current.add(normalized);

        // Debounce: batch all requests within 100ms
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
            const batch = Array.from(pendingRef.current);
            pendingRef.current.clear();

            if (batch.length === 0) return;

            setLoading(true);
            try {
                const result = await profileService.batchLookup(batch);
                // Merge results into cache
                Object.entries(result).forEach(([addr, profile]) => {
                    cacheRef.current[addr] = profile;
                });
            } catch (err) {
                console.warn('Profile batch lookup failed:', err);
            } finally {
                setLoading(false);
            }
        }, 100);
    }, []);

    // Get display name for address (sync, from cache)
    const getName = useCallback((address) => {
        if (!address) return 'Không rõ';
        const normalized = address.toLowerCase();

        // Trigger resolve if not cached
        resolve(normalized);

        const cached = cacheRef.current[normalized];
        if (cached?.fullName) return cached.fullName;

        // Fallback: shortened address
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }, [resolve]);

    return { getName, loading, resolve };
}

export default useUserProfile;
