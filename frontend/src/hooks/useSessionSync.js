"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { authService } from '@/services';
import { setAuthRoles, getAuthRoles, clearAuthRoles } from '@/hooks/useAuthRoles';

/**
 * Session Sync Hook
 * 
 * Handles role resolution on session restore.
 * "Trong hệ thống EHR, xác thực danh tính và xác thực quyền truy cập là hai bước độc lập.
 * Quyền truy cập luôn được xác minh lại khi phiên làm việc được khôi phục."
 * 
 * @returns {Object} { syncing, synced, roles }
 */
export function useSessionSync() {
    const router = useRouter();
    const pathname = usePathname();
    const [syncing, setSyncing] = useState(true);
    const [synced, setSynced] = useState(false);
    const [roles, setRoles] = useState(null);
    const syncAttempted = useRef(false);

    // Pages that don't require session sync
    const publicPaths = ['/', '/login', '/about', '/contact'];
    const isPublicPath = publicPaths.some(p => pathname === p);

    const syncSession = useCallback(async () => {
        // Prevent double sync
        if (syncAttempted.current) return;
        syncAttempted.current = true;

        // If not logged in (no JWT), no need to sync
        if (!authService.isLoggedIn()) {
            setSyncing(false);
            setSynced(true);
            return;
        }

        try {
            // Fetch roles from backend (which checks on-chain)
            const me = await authService.getMe();

            if (!me) {
                throw new Error('No user data');
            }

            // Extract roles (including new org admin fields)
            const {
                isPatient,
                isDoctor,
                isVerifiedDoctor,
                isMinistry,
                isOrg,
                isVerifiedOrg,
                isActiveOrgAdmin,
                orgId,
                orgName
            } = me;

            // Store roles
            setRoles({ isPatient, isDoctor, isVerifiedDoctor, isMinistry, isOrg, isVerifiedOrg, isActiveOrgAdmin, orgId, orgName });

            // Build available roles array
            const available = [];
            if (isPatient) available.push('patient');
            if (isDoctor || isVerifiedDoctor) available.push('doctor');
            if (isOrg || isVerifiedOrg || isActiveOrgAdmin) available.push('org');
            if (isMinistry) available.push('ministry');

            // Determine role and update auth_roles
            let primaryRole = null;
            let redirectPath = null;

            // Check if current active role is still valid
            const currentActive = getAuthRoles().active;
            if (currentActive && available.includes(currentActive)) {
                primaryRole = currentActive;
                // Set path based on active role
                if (primaryRole === 'ministry') redirectPath = '/dashboard/ministry';
                else if (primaryRole === 'org') redirectPath = '/dashboard/org';
                else if (primaryRole === 'doctor') redirectPath = '/dashboard/doctor';
                else if (primaryRole === 'patient') redirectPath = '/dashboard/patient';
            } else {
                // Fallback to priority logic
                if (isMinistry) {
                    primaryRole = 'ministry';
                    redirectPath = '/dashboard/ministry';
                } else if (isActiveOrgAdmin) {
                    // NEW: Org admin detection (entity-based)
                    primaryRole = 'org';
                    redirectPath = '/dashboard/org';
                } else if (isVerifiedOrg || isOrg) {
                    // Legacy org detection (fallback)
                    primaryRole = 'org';
                    redirectPath = '/dashboard/org';
                } else if (isVerifiedDoctor || isDoctor) {
                    primaryRole = 'doctor';
                    redirectPath = '/dashboard/doctor';
                } else if (isPatient) {
                    primaryRole = 'patient';
                    redirectPath = '/dashboard/patient';
                }
            }

            if (primaryRole) {
                setAuthRoles(available, primaryRole);
            }

            // Only redirect if on public path and we have a role
            if (isPublicPath && redirectPath) {
                router.replace(redirectPath);
            }

            // If on a protected path but no role, redirect to register
            if (!isPublicPath && !primaryRole && !pathname.includes('/register')) {
                router.replace('/register');
            }

            setSynced(true);
        } catch (error) {
            console.error('[useSessionSync] Error syncing session:', error);

            // JWT invalid or expired - clear and redirect to login
            clearAuthRoles();
            authService.logout();

            if (!isPublicPath) {
                router.replace('/login');
            }

            setSynced(true);
        } finally {
            setSyncing(false);
        }
    }, [router, pathname, isPublicPath]);

    useEffect(() => {
        syncSession();
    }, [syncSession]);

    return {
        syncing,
        synced,
        roles,
    };
}

/**
 * Standalone sync function for use outside of React components
 */
export async function syncSessionOnce(router) {
    if (!authService.isLoggedIn()) {
        return { success: false, reason: 'not_logged_in' };
    }

    try {
        const me = await authService.getMe();

        const {
            isPatient,
            isDoctor,
            isVerifiedDoctor,
            isMinistry,
            isOrg,
            isVerifiedOrg,
            isActiveOrgAdmin
        } = me;

        let primaryRole = null;
        let redirectPath = null;
        const available = [];

        if (isPatient) available.push('patient');
        if (isDoctor || isVerifiedDoctor) available.push('doctor');
        if (isOrg || isVerifiedOrg || isActiveOrgAdmin) available.push('org');
        if (isMinistry) available.push('ministry');

        // Default priority
        if (isMinistry) {
            primaryRole = 'ministry';
            redirectPath = '/dashboard/ministry';
        } else if (isActiveOrgAdmin) {
            // NEW: Org admin detection (entity-based)
            primaryRole = 'org';
            redirectPath = '/dashboard/org';
        } else if (isVerifiedOrg || isOrg) {
            primaryRole = 'org';
            redirectPath = '/dashboard/org';
        } else if (isVerifiedDoctor || isDoctor) {
            primaryRole = 'doctor';
            redirectPath = '/dashboard/doctor';
        } else if (isPatient) {
            primaryRole = 'patient';
            redirectPath = '/dashboard/patient';
        }

        // Check if current active role is valid
        const currentActive = getAuthRoles().active;
        if (currentActive && available.includes(currentActive)) {
            primaryRole = currentActive;
            // Set path based on active role
            if (primaryRole === 'ministry') redirectPath = '/dashboard/ministry';
            else if (primaryRole === 'org') redirectPath = '/dashboard/org';
            else if (primaryRole === 'doctor') redirectPath = '/dashboard/doctor';
            else if (primaryRole === 'patient') redirectPath = '/dashboard/patient';
        }

        if (primaryRole) {
            setAuthRoles(available, primaryRole);
        }

        if (redirectPath) {
            router.replace(redirectPath);
        } else {
            router.replace('/register');
        }

        return { success: true, role: primaryRole, redirectPath };
    } catch (error) {
        console.error('[syncSessionOnce] Error:', error);
        clearAuthRoles();
        authService.logout();
        router.replace('/login');
        return { success: false, reason: 'error', error };
    }
}

export default useSessionSync;
