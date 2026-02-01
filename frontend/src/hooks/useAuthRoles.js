"use client";

/**
 * Utility functions for managing user roles in localStorage
 * Single source of truth: auth_roles = { available: [...], active: '...' }
 * 
 * Replaces fragmented: activeRole, userRole, userRoles
 */

const AUTH_ROLES_KEY = 'auth_roles';

// Default empty state
const DEFAULT_ROLES = {
    available: [],
    active: null,
};

/**
 * Get current auth roles from localStorage
 */
export function getAuthRoles() {
    if (typeof window === 'undefined') return DEFAULT_ROLES;

    try {
        const stored = localStorage.getItem(AUTH_ROLES_KEY);
        if (stored) {
            return JSON.parse(stored);
        }

        // Migration: check old keys
        const legacyRoles = localStorage.getItem('userRoles');
        const legacyActive = localStorage.getItem('activeRole') || localStorage.getItem('userRole');

        if (legacyRoles || legacyActive) {
            const available = legacyRoles ? JSON.parse(legacyRoles) : [];
            const active = legacyActive || (available[0] ?? null);

            // Migrate to new format
            const migrated = { available, active };
            localStorage.setItem(AUTH_ROLES_KEY, JSON.stringify(migrated));

            // Clean up old keys
            localStorage.removeItem('userRoles');
            localStorage.removeItem('activeRole');
            localStorage.removeItem('userRole');

            return migrated;
        }

        return DEFAULT_ROLES;
    } catch (error) {
        console.error('[getAuthRoles] Error:', error);
        return DEFAULT_ROLES;
    }
}

/**
 * Set auth roles in localStorage
 */
export function setAuthRoles(available, active) {
    if (typeof window === 'undefined') return;

    const roles = {
        available: Array.isArray(available) ? available : [],
        active: active || null,
    };

    localStorage.setItem(AUTH_ROLES_KEY, JSON.stringify(roles));
}

/**
 * Add a role to available roles and optionally set as active
 */
export function addRole(role, setAsActive = false) {
    const current = getAuthRoles();

    if (!current.available.includes(role)) {
        current.available.push(role);
    }

    if (setAsActive || !current.active) {
        current.active = role;
    }

    setAuthRoles(current.available, current.active);
    return current;
}

/**
 * Switch active role (must be in available list)
 */
export function switchRole(role) {
    const current = getAuthRoles();

    if (current.available.includes(role)) {
        current.active = role;
        setAuthRoles(current.available, current.active);
    }

    return current;
}

/**
 * Get active role only
 */
export function getActiveRole() {
    return getAuthRoles().active;
}

/**
 * Clear all auth roles (on logout)
 */
export function clearAuthRoles() {
    if (typeof window === 'undefined') return;

    localStorage.removeItem(AUTH_ROLES_KEY);
    // Also clean up legacy keys if they exist
    localStorage.removeItem('userRoles');
    localStorage.removeItem('activeRole');
    localStorage.removeItem('userRole');
}

/**
 * Check if user has a specific role
 */
export function hasRole(role) {
    return getAuthRoles().available.includes(role);
}

/**
 * React hook for auth roles (with state sync)
 */
import { useState, useEffect, useCallback } from 'react';

export function useAuthRoles() {
    const [roles, setRolesState] = useState(DEFAULT_ROLES);

    useEffect(() => {
        setRolesState(getAuthRoles());
    }, []);

    const updateRoles = useCallback((available, active) => {
        setAuthRoles(available, active);
        setRolesState({ available, active });
    }, []);

    const addRoleAndUpdate = useCallback((role, setAsActive = false) => {
        const updated = addRole(role, setAsActive);
        setRolesState(updated);
        return updated;
    }, []);

    const switchRoleAndUpdate = useCallback((role) => {
        const updated = switchRole(role);
        setRolesState(updated);
        return updated;
    }, []);

    const clearAndUpdate = useCallback(() => {
        clearAuthRoles();
        setRolesState(DEFAULT_ROLES);
    }, []);

    return {
        roles,
        available: roles.available,
        active: roles.active,
        setRoles: updateRoles,
        addRole: addRoleAndUpdate,
        switchRole: switchRoleAndUpdate,
        clear: clearAndUpdate,
        hasRole: (role) => roles.available.includes(role),
    };
}

export default useAuthRoles;
