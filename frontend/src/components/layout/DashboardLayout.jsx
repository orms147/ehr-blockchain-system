"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    User,
    Settings,
    LogOut,
    Menu,
    X,
    Shield,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import RoleSwitcher from '@/components/role/RoleSwitcher';
import { useWeb3AuthDisconnect } from '@web3auth/modal/react';
import authService from '@/services/auth.service';
import { getActiveRole, clearAuthRoles } from '@/hooks/useAuthRoles';
import { NotificationProvider, useNotifications } from '@/contexts/NotificationContext'; // Import Context
import { Bell } from 'lucide-react'; // Import Bell

const DashboardLayout = ({ children }) => {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [role, setRole] = useState('patient');
    const [isLoading, setIsLoading] = useState(true);
    const pathname = usePathname();
    const router = useRouter();
    const { disconnect } = useWeb3AuthDisconnect();

    // Auth guard: Redirect to home if not authenticated
    useEffect(() => {
        const checkAuth = () => {
            const isAuthenticated = authService.isLoggedIn();
            if (!isAuthenticated) {
                router.replace('/');
                return;
            }
            setIsLoading(false);
        };
        checkAuth();
    }, [router]);

    // Get role from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const activeRole = getActiveRole() || 'patient';
            setRole(activeRole);
        }
    }, [pathname]);

    const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);

    // Show loading while checking auth
    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
            </div>
        );
    }


    const handleLogout = async () => {
        // Clear all auth data
        clearAuthRoles();
        authService.logout();

        try {
            await disconnect();
        } catch (e) {
        }

        toast({
            title: "Đã đăng xuất",
            description: "Bạn đã đăng xuất thành công.",
        });
        router.push('/');
    };

    const getRoleInfo = () => {
        if (role === 'doctor') return { label: 'Bác sĩ', subLabel: 'Chuyên gia y tế', initials: 'BS' };
        if (role === 'admin') return { label: 'Quản trị', subLabel: 'Super Admin', initials: 'AD' };
        if (role === 'organization') return { label: 'Tổ chức', subLabel: 'Đơn vị y tế', initials: 'TC' };
        if (role === 'ministry') return { label: 'Bộ Y tế', subLabel: 'Quản lý hệ thống', initials: 'BY' };
        return { label: 'Bệnh nhân', subLabel: 'Truy cập tiêu chuẩn', initials: 'BN' };
    };

    const { label, subLabel, initials } = getRoleInfo();

    // Determine dashboard path based on active role
    const getDashboardPath = () => {
        if (role === 'doctor') return '/dashboard/doctor';
        if (role === 'admin') return '/dashboard/admin';
        if (role === 'organization') return '/dashboard/organization';
        if (role === 'ministry') return '/dashboard/ministry';
        return '/dashboard/patient';
    };

    const navItems = [
        { icon: LayoutDashboard, label: 'Bảng điều khiển', path: getDashboardPath() },
        { icon: User, label: 'Hồ sơ của tôi', path: '/dashboard/profile' },
        { icon: Settings, label: 'Cài đặt', path: '/dashboard/settings' },
    ];

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 
                transform transition-transform duration-300 ease-in-out
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-100">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-teal-500 rounded-md flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-teal-600 bg-clip-text text-transparent">
                        EHR Chain
                    </span>
                </div>

                <nav className="p-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname === item.path ||
                            (item.path !== '/dashboard/profile' && item.path !== '/dashboard/settings' && pathname.startsWith(item.path));
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                onClick={() => setSidebarOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                    }`}
                            >
                                <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                                {item.label}
                            </Link>
                        );
                    })}

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors mt-8"
                    >
                        <LogOut className="w-5 h-5" />
                        Đăng xuất
                    </button>
                </nav>

                {/* Role Switcher - Mobile Only */}
                <div className="lg:hidden absolute bottom-4 left-4 right-4">
                    <RoleSwitcher />
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                {/* Unified Header (Desktop & Mobile) */}
                <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 sm:px-6 z-30 shrink-0">
                    <div className="flex items-center gap-4">
                        {/* Mobile Toggle */}
                        <button onClick={toggleSidebar} className="p-2 rounded-md hover:bg-slate-100 lg:hidden">
                            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>

                        {/* Mobile Logo */}
                        <div className="flex items-center gap-2 lg:hidden">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-teal-500 rounded-md flex items-center justify-center">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            <span className="font-bold text-slate-900">EHR Chain</span>
                        </div>
                    </div>

                    {/* Right Side Actions */}
                    <div className="flex items-center gap-4">
                        {/* Notification Bell */}
                        <NotificationBell />

                        {/* Role Switcher (Moved here for better visibility) */}
                        <div className="hidden sm:block">
                            <RoleSwitcher />
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
};

// Notification Bell Component
const NotificationBell = () => {
    const { unreadCount } = useNotifications();
    return (
        <button className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            )}
        </button>
    );
};

// Wrapper Component
export default function DashboardLayoutWrapper(props) {
    return (
        <NotificationProvider>
            <DashboardLayout {...props} />
        </NotificationProvider>
    );
}
