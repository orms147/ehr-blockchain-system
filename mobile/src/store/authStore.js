import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';
import walletActionService from '../services/walletAction.service';
import localRecordStore from '../services/localRecordStore';
import { clearEncryptionKeypair } from '../services/nacl-crypto';
import { deriveRolesFromUser, resolveActiveRole, sanitizeRoles } from '../utils/authRoles';
import { setSentryUser } from '../lib/sentry';
import { queryClient } from '../lib/queryClient';
import pushService from '../services/push.service';

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
    // SecureStore chỉ cho key [a-zA-Z0-9._-] → KHÔNG dùng ":" (gây "Invalid key").
    // Bug: tài khoản nhiều role gọi isRoleSelectionDone → getItemAsync key có ":" → crash login.
    return normalized ? `role_selection_done_${normalized}` : null;
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

        // Defence in depth: wipe any query cache that could have survived a
        // racy logout (an in-flight fetch from the previous account resolving
        // AFTER queryClient.clear but BEFORE this login). Without this, the
        // next dashboard render might hydrate from the previous user's data
        // before its refetch lands.
        try {
            api.abortAll();
            await queryClient.cancelQueries();
            queryClient.clear();
            queryClient.removeQueries();
        } catch (err) {
            console.warn('Login: pre-clear cache failed', err);
        }
        try {
            await localRecordStore.clear();
        } catch (err) {
            console.warn('Login: clear ehr_local_records failed', err);
        }

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

        // Fire-and-forget — don't block login on push registration.
        pushService.syncPushTokenWithBackend().catch(() => { });
    },

    logout: async () => {
        // Clear the in-memory token FIRST so any in-flight request that
        // resolves during the rest of logout can't leak A's data into the
        // cache (the cache clear below would then be undone by that response).
        api.clearToken();

        // Abort every in-flight HTTP request so a slow fetch started as user
        // A can't resolve into the TanStack cache after we clear it. Without
        // this, B's dashboard hydrated from A's late-arriving data until the
        // first refetch landed — the "still see A's dashboard after login B"
        // bug.
        try {
            api.abortAll();
        } catch (err) {
            console.warn('Logout: abortAll failed', err);
        }

        // Tell TanStack to also cancel any query-layer retries / reconciliation.
        try {
            await queryClient.cancelQueries();
        } catch (err) {
            console.warn('Logout: cancelQueries failed', err);
        }

        try {
            await walletActionService.logoutWeb3Auth();
        } catch (error) {
            console.warn('Web3Auth logout warning:', error);
        }

        // Tell backend to forget our push token before clearing the JWT.
        await pushService.unregisterPushToken().catch(() => { });

        await clearPersistedAuth();

        // Blow away caches that were tied to the previous user so the next
        // login doesn't briefly flash stale data. Missing any of these has
        // caused cross-account leaks (e.g. signing in as patient after
        // a doctor session still showed the doctor's dashboard until the
        // first refetch).
        try {
            queryClient.clear();
            queryClient.removeQueries();
        } catch (err) {
            console.warn('Logout: queryClient.clear failed', err);
        }
        try {
            // ehr_local_records holds decrypted cids + aes keys per cidHash.
            // These are per-user secrets — must not persist across accounts.
            await localRecordStore.clear();
        } catch (err) {
            console.warn('Logout: clear ehr_local_records failed', err);
        }

        // NaCl encryption keypair (ehr_nacl_*) is derived from wallet signature
        // → per-user secret. Without clear, user B login sees ghost of A's pubkey
        // until first getOrCreateEncryptionKeypair call overwrites — but that may
        // be too late if backend reads stale pubkey first. Wipe for clean slate.
        try {
            await clearEncryptionKeypair();
        } catch (err) {
            console.warn('Logout: clear nacl keypair failed', err);
        }

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

            // Verify Web3Auth session matches the restored JWT. On cold start
            // the JWT survives in SecureStore but Web3Auth's in-memory private
            // key state is empty (SDK v8.1.0 does not auto-restore session),
            // leaving the user "half logged in" — backend trusts them, but
            // nothing can be signed/decrypted. Detect this here and treat it
            // as unauthenticated so the UI goes straight to LoginScreen
            // without flashing dashboard → redirect.
            try {
                await walletActionService.ensureWeb3AuthReady();
                if (!walletActionService.hasActiveSession()) {
                    console.warn('[authStore] Web3Auth session not hydrated — treating as logged out.');
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
            } catch (web3authError) {
                console.warn('[authStore] Web3Auth init failed during loadToken — treating as logged out:', web3authError?.message || web3authError);
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