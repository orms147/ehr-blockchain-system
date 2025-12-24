"use client";

import React, { useState, useEffect } from 'react';
import { ChevronDown, User, Stethoscope, Building2, ShieldCheck, Check } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

const ROLE_CONFIG = {
    patient: {
        label: 'Bệnh nhân',
        icon: User,
        color: 'bg-blue-100 text-blue-700',
        dashboard: '/dashboard/patient'
    },
    doctor: {
        label: 'Bác sĩ',
        icon: Stethoscope,
        color: 'bg-green-100 text-green-700',
        dashboard: '/dashboard/doctor'
    },
    organization: {
        label: 'Tổ chức',
        icon: Building2,
        color: 'bg-orange-100 text-orange-700',
        dashboard: '/dashboard/organization'
    },
    admin: {
        label: 'Quản trị',
        icon: ShieldCheck,
        color: 'bg-purple-100 text-purple-700',
        dashboard: '/dashboard/admin'
    }
};

/**
 * RoleSwitcher component for multi-role users
 * Displays current role and allows switching between registered roles
 */
export function RoleSwitcher() {
    const [isOpen, setIsOpen] = useState(false);
    const [userRoles, setUserRoles] = useState([]);
    const [activeRole, setActiveRole] = useState('patient');
    const router = useRouter();
    const pathname = usePathname();

    // Load roles from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            // Get all registered roles
            const rolesStr = localStorage.getItem('userRoles');
            const roles = rolesStr ? JSON.parse(rolesStr) : [];

            // If no roles array, check for single role (backward compatibility)
            if (roles.length === 0) {
                const singleRole = localStorage.getItem('userRole');
                if (singleRole) {
                    roles.push(singleRole);
                    localStorage.setItem('userRoles', JSON.stringify(roles));
                }
            }

            // Default to patient if no roles
            if (roles.length === 0) {
                roles.push('patient');
            }

            setUserRoles(roles);

            // Get active role
            const active = localStorage.getItem('activeRole') ||
                localStorage.getItem('userRole') ||
                roles[0] ||
                'patient';
            setActiveRole(active);
        }
    }, []);

    const handleRoleSwitch = (role) => {
        setActiveRole(role);
        localStorage.setItem('activeRole', role);
        localStorage.setItem('userRole', role); // Keep backward compatibility
        setIsOpen(false);

        // Navigate to the role's dashboard
        const config = ROLE_CONFIG[role];
        if (config) {
            router.push(config.dashboard);
        }
    };

    const addNewRole = () => {
        setIsOpen(false);
        router.push('/register');
    };

    const currentConfig = ROLE_CONFIG[activeRole] || ROLE_CONFIG.patient;
    const CurrentIcon = currentConfig.icon;

    // Don't show if only one role and no ability to add more
    if (userRoles.length === 0) return null;

    return (
        <div className="relative">
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${currentConfig.color} hover:opacity-90`}
            >
                <CurrentIcon className="w-5 h-5" />
                <div className="flex-1 text-left">
                    <p className="text-sm font-medium">{currentConfig.label}</p>
                    {userRoles.length > 1 && (
                        <p className="text-xs opacity-70">Nhấn để đổi role</p>
                    )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Menu */}
                    <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                        <div className="p-2">
                            <p className="px-3 py-2 text-xs font-medium text-slate-500 uppercase">
                                Vai trò của bạn
                            </p>

                            {userRoles.map((role) => {
                                const config = ROLE_CONFIG[role];
                                if (!config) return null;
                                const Icon = config.icon;
                                const isActive = role === activeRole;

                                return (
                                    <button
                                        key={role}
                                        onClick={() => handleRoleSwitch(role)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'hover:bg-slate-50 text-slate-700'
                                            }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        <span className="flex-1 text-left text-sm font-medium">
                                            {config.label}
                                        </span>
                                        {isActive && <Check className="w-4 h-4" />}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Add Role Button */}
                        <div className="border-t border-slate-100 p-2">
                            <button
                                onClick={addNewRole}
                                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-teal-600 hover:bg-teal-50 transition-colors"
                            >
                                <span className="w-5 h-5 rounded-full border-2 border-dashed border-teal-400 flex items-center justify-center text-sm">+</span>
                                <span className="text-sm font-medium">Thêm vai trò mới</span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Hook to get current active role
 */
export function useActiveRole() {
    const [activeRole, setActiveRole] = useState('patient');
    const [userRoles, setUserRoles] = useState([]);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const rolesStr = localStorage.getItem('userRoles');
            const roles = rolesStr ? JSON.parse(rolesStr) : [];
            setUserRoles(roles);

            const active = localStorage.getItem('activeRole') ||
                localStorage.getItem('userRole') ||
                'patient';
            setActiveRole(active);
        }
    }, []);

    const switchRole = (role) => {
        setActiveRole(role);
        localStorage.setItem('activeRole', role);
        localStorage.setItem('userRole', role);
    };

    const addRole = (role) => {
        if (!userRoles.includes(role)) {
            const newRoles = [...userRoles, role];
            setUserRoles(newRoles);
            localStorage.setItem('userRoles', JSON.stringify(newRoles));
        }
    };

    return { activeRole, userRoles, switchRole, addRole };
}

export default RoleSwitcher;
