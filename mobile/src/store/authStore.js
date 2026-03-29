import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';
import walletActionService from '../services/walletAction.service';

const ROLE_CONFIG = {
    patient: { label: 'Bệnh nhân', emoji: '👤' },
    doctor: { label: 'Bác sĩ', emoji: '🩺' },
    org: { label: 'Tổ chức', emoji: '🏥' },
    organization: { label: 'Tổ chức', emoji: '🏥' },
    ministry: { label: 'Bộ Y tế', emoji: '🏛️' },
    admin: { label: 'Quản trị', emoji: '🛡️' },
};

const useAuthStore = create((set, get) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
    
    // Role management
    activeRole: 'patient',
    availableRoles: ['patient'],

    // Actions
    login: async (token, userData, roles = ['patient']) => {
        api.setToken(token);
        await SecureStore.setItemAsync('jwt_token', token);
        if (userData) {
            await SecureStore.setItemAsync('user_data', JSON.stringify(userData));
        }
        // Persist roles
        const activeRole = roles[0] || 'patient';
        await SecureStore.setItemAsync('auth_roles', JSON.stringify({ available: roles, active: activeRole }));
        
        set({ 
            token, 
            user: userData, 
            isAuthenticated: true, 
            isLoading: false,
            availableRoles: roles,
            activeRole,
        });
    },

    logout: async () => {
        api.clearToken();
        try {
            await walletActionService.logoutWeb3Auth();
        } catch (error) {
            console.warn('Web3Auth logout warning:', error);
        }
        await SecureStore.deleteItemAsync('jwt_token');
        await SecureStore.deleteItemAsync('user_data');
        await SecureStore.deleteItemAsync('auth_roles');
        set({ 
            token: null, user: null, isAuthenticated: false, isLoading: false,
            activeRole: 'patient', availableRoles: ['patient'],
        });
    },

    switchRole: (role) => {
        const { availableRoles } = get();
        if (availableRoles.includes(role)) {
            // Persist
            SecureStore.setItemAsync('auth_roles', JSON.stringify({ available: availableRoles, active: role }));
            set({ activeRole: role });
        }
    },

    setRoles: (available, active) => {
        SecureStore.setItemAsync('auth_roles', JSON.stringify({ available, active }));
        set({ availableRoles: available, activeRole: active || available[0] || 'patient' });
    },

    loadToken: async () => {
        try {
            set({ isLoading: true });
            const token = await SecureStore.getItemAsync('jwt_token');
            const userDataStr = await SecureStore.getItemAsync('user_data');
            const rolesStr = await SecureStore.getItemAsync('auth_roles');
            
            let availableRoles = ['patient'];
            let activeRole = 'patient';
            if (rolesStr) {
                try {
                    const parsed = JSON.parse(rolesStr);
                    availableRoles = parsed.available || ['patient'];
                    activeRole = parsed.active || availableRoles[0] || 'patient';
                } catch {}
            }

            if (token) {
                api.setToken(token);
                set({ 
                    token, 
                    user: userDataStr ? JSON.parse(userDataStr) : null,
                    isAuthenticated: true,
                    isLoading: false,
                    availableRoles,
                    activeRole,
                });
            } else {
                set({ isAuthenticated: false, isLoading: false });
            }
        } catch (error) {
            console.error('Failed to load token:', error);
            set({ isAuthenticated: false, isLoading: false });
        }
    },

    // Helper
    getRoleConfig: () => ROLE_CONFIG,
}));

export { ROLE_CONFIG };
export default useAuthStore;
