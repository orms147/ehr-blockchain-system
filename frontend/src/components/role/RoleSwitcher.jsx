"use client";

import React, { useState } from 'react';
import { ChevronDown, User, Stethoscope, Building2, ShieldCheck, Check, Landmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuthRoles } from '@/hooks/useAuthRoles';

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
    org: {
        label: 'Tổ chức',
        icon: Building2,
        color: 'bg-orange-100 text-orange-700',
        dashboard: '/dashboard/org'
    },
    organization: {
        label: 'Tổ chức',
        icon: Building2,
        color: 'bg-orange-100 text-orange-700',
        dashboard: '/dashboard/org'
    },
    ministry: {
        label: 'Bộ Y tế',
        icon: Landmark,
        color: 'bg-red-100 text-red-700',
        dashboard: '/dashboard/ministry'
    },
    admin: {
        label: 'Quản trị',
        icon: ShieldCheck,
        color: 'bg-purple-100 text-purple-700',
        dashboard: '/dashboard/ministry'
    }
};

/**
 * RoleSwitcher component for multi-role users
 * Displays current role and allows switching between registered roles
 */
export function RoleSwitcher() {
    const [isOpen, setIsOpen] = useState(false);
    const { available, active, switchRole } = useAuthRoles();
    const router = useRouter();

    const handleRoleSwitch = (role) => {
        switchRole(role);
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

    const currentConfig = ROLE_CONFIG[active] || ROLE_CONFIG.patient;
    const CurrentIcon = currentConfig.icon;

    // Don't show if no roles
    if (available.length === 0) return null;

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
                    {available.length > 1 && (
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

                            {available.map((role) => {
                                const config = ROLE_CONFIG[role];
                                if (!config) return null;
                                const Icon = config.icon;
                                const isActive = role === active;

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

                        {/* Add Role Button - Hide for system roles (org/ministry/admin) */}
                        {!available.some(r => ['org', 'organization', 'ministry', 'admin'].includes(r)) && (
                            <div className="border-t border-slate-100 p-2">
                                <button
                                    onClick={addNewRole}
                                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-teal-600 hover:bg-teal-50 transition-colors"
                                >
                                    <span className="w-5 h-5 rounded-full border-2 border-dashed border-teal-400 flex items-center justify-center text-sm">+</span>
                                    <span className="text-sm font-medium">Thêm vai trò mới</span>
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default RoleSwitcher;

