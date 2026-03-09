"use client";

import React, { useState, useEffect } from 'react';
import profileService from '@/services/profile.service';

/**
 * UserName component — resolves a wallet address to a display name.
 * Fetches from backend and caches in a shared module-level Map.
 * 
 * Usage:
 *   <UserName address="0x..." />
 *   <UserName address="0x..." fallback="Không rõ" />
 *   <UserName address="0x..." prefix="BS. " />
 */

// Module-level cache (shared across all instances)
const nameCache = new Map();
const pendingBatch = new Set();
let batchTimer = null;

function flushBatch() {
    const batch = Array.from(pendingBatch);
    pendingBatch.clear();
    if (batch.length === 0) return;

    profileService.batchLookup(batch)
        .then(result => {
            Object.entries(result).forEach(([addr, profile]) => {
                nameCache.set(addr, profile);
            });
            // Trigger re-render for all waiting components
            window.dispatchEvent(new Event('username-cache-updated'));
        })
        .catch(err => {
            console.warn('UserName batch lookup failed:', err);
        });
}

function requestResolve(address) {
    const normalized = address.toLowerCase();
    if (nameCache.has(normalized)) return;
    pendingBatch.add(normalized);

    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(flushBatch, 150);
}

export default function UserName({ address, fallback = 'Không rõ', prefix = '', className = '' }) {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        if (!address) return;
        requestResolve(address);

        const handler = () => forceUpdate(n => n + 1);
        window.addEventListener('username-cache-updated', handler);
        return () => window.removeEventListener('username-cache-updated', handler);
    }, [address]);

    if (!address) return <span className={className}>{fallback || 'Không rõ'}</span>;

    const normalized = address.toLowerCase();
    const cached = nameCache.get(normalized);
    const displayName = cached?.fullName
        ? `${prefix}${cached.fullName}`
        : `${address.slice(0, 6)}...${address.slice(-4)}`;

    return <span className={className} title={address}>{displayName}</span>;
}

// Helper util: get display name synchronously from cache (for non-React usage)
export function getDisplayName(address) {
    if (!address) return 'Không rõ';
    const normalized = address.toLowerCase();
    const cached = nameCache.get(normalized);
    if (cached?.fullName) return cached.fullName;
    requestResolve(address);
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
