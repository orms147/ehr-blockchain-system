import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';
import walletActionService from '../services/walletAction.service';
import { deriveRolesFromUser, resolveActiveRole, sanitizeRoles } from '../utils/authRoles';
import { setSentryUser } from '../lib/sentry';

const ROLE_CONFIG = {
    patient: { label: 'Bệnh nhân', emoji: '👤' },
    doctor: { label: 'Bác sĩ', emoji: '🩺' },
    org: { label: 'Tổ chức', emoji: '🏥' },
    organization: { label: 'Tổ chức', emoji: '🏥' },
    ministry: { label: 'Bộ Y tế', emoji: '🏛️' },
    admin: { label: 'Quản trị', emoji: '🛡️' },
};

function normalizeWalletAddress(value) {
    return typeof value === 'string' ? value.toLowerCase() : null;
}

function roleSelectionDoneKey(walletAddress) {
    const normalized = normalizeWalletAddress(walletAddress);
    return normalized ? `role_selection_done:${normalized}` : null;
}

async function isRoleSelectionDone(walletAddress) {
    const key = roleSelectionDoneKey(walletAddress);
    if (!key) return true;

    const value = await SecureStore.getItemAsync(key);
    return value === '1';
}

async function markRoleSelectionDone(walletAddress) {
    const key = roleSelectionDoneKey(walletAddress);
    if (!key) return;

    await SecureStore.setItemAsync(key, '1');
}

async function clearPersistedAuth() {
    await SecureStore.deleteItemAsync('jwt_token');
    await SecureStore.deleteItemAsync('user_data');
    await SecureStore.deleteItemAsync('auth_roles');
}

async function resolveRoleRequirements(availableRoles, walletAddress) {
    const hasRoles = Array.isArray(availableRoles) && availableRoles.length > 0;
    const needsRoleRegistration = !hasRoles;

    if (needsRoleRegistration) {
        return {
            needsRoleRegistration: true,
            needsRoleSelection: false,
        };
    }

    const needsRoleSelection =
        availableRoles.length > 1
        && !(await isRoleSelectionDone(walletAddress));

    return {
        needsRoleRegistration: false,
        needsRoleSelection,
    };
}

const useAuthStore = create((set, get) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,

    activeRole: 'patient',
    availableRoles: [],
    needsRoleSelection: false,
    needsRoleRegistration: false,

    login: async (token, userData, roles = []) => {
        const availableRoles = sanitizeRoles(roles, userData);
        const defaultActiveRole = resolveActiveRole(availableRoles, availableRoles[0]);
        const walletAddress = normalizeWalletAddress(userData?.walletAddress);
        const { needsRoleRegistration, needsRoleSelection } = await resolveRoleRequirements(
            availableRoles,
            walletAddress
        );

        api.setToken(token);
        await SecureStore.setItemAsync('jwt_token', token);

        if (userData) {
            await SecureStore.setItemAsync('user_data', JSON.stringify(userData));
        }

        await SecureStore.setItemAsync(
            'auth_roles',
            JSON.stringify({ available: availableRoles, active: defaultActiveRole })
        );

        set({
            token,
            user: userData,
            isAuthenticated: true,
            isLoading: false,
            availableRoles,
            activeRole: defaultActiveRole,
            needsRoleSelection,
            needsRoleRegistration,
        });

        setSentryUser(userData ? { id: userData.id, walletAddress } : null);
    },

    logout: async () => {
        api.clearToken();
        try {
            await walletActionService.logoutWeb3Auth();
        } catch (error) {
            console.warn('Web3Auth logout warning:', error);
        }

        await clearPersistedAuth();

        setSentryUser(null);

        set({
            token: null,
            user: null,
            isAuthenticated: false,
            isLoading: false,
            activeRole: 'patient',
            availableRoles: [],
            needsRoleSelection: false,
            needsRoleRegistration: false,
        });
    },

    refreshAuthSession: async () => {
        const { token, user, activeRole } = get();
        if (!token) return null;

        const me = await api.get('/api/auth/me');
        const effectiveUser = { ...(user || {}), ...(me || {}) };
        const availableRoles = sanitizeRoles(me?.roles, effectiveUser);
        const nextActiveRole = resolveActiveRole(availableRoles, activeRole);
        const walletAddress = normalizeWalletAddress(effectiveUser?.walletAddress);
        const { needsRoleRegistration, needsRoleSelection } = await resolveRoleRequirements(
            availableRoles,
            walletAddress
        );

        await SecureStore.setItemAsync('user_data', JSON.stringify(effectiveUser));
        await SecureStore.setItemAsync(
            'auth_roles',
            JSON.stringify({ available: availableRoles, active: nextActiveRole })
        );

        set({
            user: effectiveUser,
            availableRoles,
            activeRole: nextActiveRole,
            needsRoleSelection,
            needsRoleRegistration,
        });

        return {
            user: effectiveUser,
            roles: availableRoles,
        };
    },

    completeRoleSelection: async (role) => {
        const { availableRoles, user } = get();
        if (!Array.isArray(availableRoles) || availableRoles.length === 0) {
            return;
        }

        const selectedRole = resolveActiveRole(availableRoles, role);

        await SecureStore.setItemAsync(
            'auth_roles',
            JSON.stringify({ available: availableRoles, active: selectedRole })
        );

        await markRoleSelectionDone(user?.walletAddress);

        set({
            activeRole: selectedRole,
            needsRoleSelection: false,
            needsRoleRegistration: false,
        });
    },

    switchRole: (role) => {
        const { availableRoles } = get();
        const normalizedRole = resolveActiveRole(availableRoles, role);

        if (availableRoles.includes(normalizedRole)) {
            SecureStore.setItemAsync(
                'auth_roles',
                JSON.stringify({ available: availableRoles, active: normalizedRole })
            );
            set({ activeRole: normalizedRole });
        }
    },

    setRoles: async (available, active) => {
        const user = get().user;
        const availableRoles = sanitizeRoles(available, user);
        const activeRole = resolveActiveRole(availableRoles, active);
        const walletAddress = normalizeWalletAddress(user?.walletAddress);
        const { needsRoleRegistration, needsRoleSelection } = await resolveRoleRequirements(
            availableRoles,
            walletAddress
        );

        await SecureStore.setItemAsync(
            'auth_roles',
            JSON.stringify({ available: availableRoles, active: activeRole })
        );

        set({
            availableRoles,
            activeRole,
            needsRoleSelection,
            needsRoleRegistration,
        });
    },

    loadToken: async () => {
        try {
            set({ isLoading: true });

            const token = await SecureStore.getItemAsync('jwt_token');
            const userDataStr = await SecureStore.getItemAsync('user_data');
            const rolesStr = await SecureStore.getItemAsync('auth_roles');

            const userData = userDataStr ? JSON.parse(userDataStr) : null;
            const fallbackRoles = deriveRolesFromUser(userData);

            let storedAvailable = fallbackRoles;
            let storedActive = fallbackRoles[0] || 'patient';

            if (rolesStr) {
                try {
                    const parsed = JSON.parse(rolesStr);
                    storedAvailable = sanitizeRoles(parsed?.available, userData);
                    storedActive = resolveActiveRole(storedAvailable, parsed?.active);
                } catch {
                    storedAvailable = fallbackRoles;
                    storedActive = fallbackRoles[0] || 'patient';
                }
            }

            if (!token) {
                api.clearToken();
                set({
                    token: null,
                    user: null,
                    isAuthenticated: false,
                    isLoading: false,
                    availableRoles: [],
                    activeRole: 'patient',
                    needsRoleSelection: false,
                    needsRoleRegistration: false,
                });
                return;
            }

            api.setToken(token);

            let effectiveUser = userData;
            let effectiveRoles = storedAvailable;
            let effectiveActive = storedActive;

            try {
                // Session sync with backend to avoid stale local role state.
                const me = await api.get('/api/auth/me');
                if (me) {
                    effectiveUser = { ...(userData || {}), ...me };
                    effectiveRoles = sanitizeRoles(me.roles, effectiveUser);
                    effectiveActive = resolveActiveRole(effectiveRoles, storedActive);

                    await SecureStore.setItemAsync('user_data', JSON.stringify(effectiveUser));
                    await SecureStore.setItemAsync(
                        'auth_roles',
                        JSON.stringify({ available: effectiveRoles, active: effectiveActive })
                    );
                }
            } catch (error) {
                if (error?.status === 401) {
                    api.clearToken();
                    await clearPersistedAuth();
                    set({
                        token: null,
                        user: null,
                        isAuthenticated: false,
                        isLoading: false,
                        availableRoles: [],
                        activeRole: 'patient',
                        needsRoleSelection: false,
                        needsRoleRegistration: false,
                    });
                    return;
                }

                console.warn('[authStore] Session sync warning:', error?.message || error);
            }

            const walletAddress = normalizeWalletAddress(effectiveUser?.walletAddress);
            const { needsRoleRegistration, needsRoleSelection } = await resolveRoleRequirements(
                effectiveRoles,
                walletAddress
            );

            set({
                token,
                user: effectiveUser,
                isAuthenticated: true,
                isLoading: false,
                availableRoles: effectiveRoles,
                activeRole: effectiveActive,
                needsRoleSelection,
                needsRoleRegistration,
            });
        } catch (error) {
            console.error('Failed to load token:', error);
            api.clearToken();
            set({
                token: null,
                user: null,
                isAuthenticated: false,
                isLoading: false,
                availableRoles: [],
                activeRole: 'patient',
                needsRoleSelection: false,
                needsRoleRegistration: false,
            });
        }
    },

    getRoleConfig: () => ROLE_CONFIG,
}));

export { ROLE_CONFIG };
export default useAuthStore;