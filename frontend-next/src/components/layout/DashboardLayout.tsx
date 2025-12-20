"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    User,
    Settings,
    LogOut,
    Menu,
    X,
    Shield,
    Stethoscope,
    LayoutGrid
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Toaster } from '@/components/ui/toaster';
import { authService } from '@/services';

interface DashboardLayoutProps {
    children: React.ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

    const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);

    const handleLogout = async () => {
        authService.logout();
        toast({
            title: "Đăng xuất thành công",
            description: "Bạn đã đăng xuất khỏi hệ thống.",
        });
        router.push('/');
    };

    const getRoleInfo = () => {
        if (pathname.includes('/dashboard/doctor')) return { role: 'doctor', label: 'Bác sĩ', subLabel: 'Nhà cung cấp Y tế', initials: 'BS' };
        if (pathname.includes('/dashboard/admin')) return { role: 'admin', label: 'Quản trị viên', subLabel: 'Super Admin', initials: 'AD' };
        return { role: 'patient', label: 'Bệnh nhân', subLabel: 'Quyền truy cập tiêu chuẩn', initials: 'BN' };
    };

    const { role, label, subLabel, initials } = getRoleInfo();

    const navItems = [
        { icon: LayoutDashboard, label: 'Bảng điều khiển', path: '/dashboard/patient', visible: role === 'patient' },
        { icon: Stethoscope, label: 'Bảng điều khiển', path: '/dashboard/doctor', visible: role === 'doctor' },
        { icon: LayoutGrid, label: 'Admin Portal', path: '/dashboard/admin', visible: role === 'admin' },
        { icon: User, label: 'Hồ sơ của tôi', path: '/dashboard/profile', visible: true },
        { icon: Settings, label: 'Cài đặt', path: '/dashboard/settings', visible: true },
    ].filter(item => item.visible);

    const springConfig = { type: "spring", stiffness: 300, damping: 30 };

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside className={`
                fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 
                transform transition-transform duration-300 ease-in-out
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Logo */}
                <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-100">
                    <Link href="/" className="flex items-center gap-2">
                        <motion.div
                            whileHover={{ rotate: 5, scale: 1.1 }}
                            transition={springConfig}
                            className="w-8 h-8 bg-gradient-to-br from-blue-600 to-teal-500 rounded-md flex items-center justify-center shadow-md"
                        >
                            <Shield className="w-5 h-5 text-white" />
                        </motion.div>
                        <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-teal-600 bg-clip-text text-transparent">
                            EHR Chain
                        </span>
                    </Link>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-2">
                    {navItems.map((item, index) => {
                        const isActive = pathname === item.path;
                        return (
                            <motion.div
                                key={item.path}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.05 }}
                            >
                                <Link
                                    href={item.path}
                                    onClick={() => setSidebarOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${isActive
                                            ? 'bg-gradient-to-r from-blue-50 to-teal-50 text-blue-700 font-medium shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                        }`}
                                >
                                    <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                                    {item.label}
                                    {isActive && (
                                        <motion.div
                                            layoutId="activeIndicator"
                                            className="absolute right-2 w-1.5 h-6 bg-blue-600 rounded-full"
                                        />
                                    )}
                                </Link>
                            </motion.div>
                        );
                    })}

                    <motion.button
                        onClick={handleLogout}
                        whileHover={{ x: 5 }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors mt-8"
                    >
                        <LogOut className="w-5 h-5" />
                        Đăng xuất
                    </motion.button>
                </nav>

                {/* User Info */}
                <div className="absolute bottom-4 left-4 right-4 p-4 bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                        <motion.div
                            whileHover={{ scale: 1.1 }}
                            className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center text-white font-bold shadow-md"
                        >
                            {initials}
                        </motion.div>
                        <div>
                            <p className="text-sm font-medium text-slate-900">{label}</p>
                            <p className="text-xs text-slate-500">{subLabel}</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="lg:hidden h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between sticky top-0 z-30 shadow-sm">
                    <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-teal-500 rounded-md flex items-center justify-center">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-slate-900">EHR Chain</span>
                    </Link>
                    <motion.button
                        onClick={toggleSidebar}
                        whileTap={{ scale: 0.9 }}
                        className="p-2 rounded-md hover:bg-slate-100 transition-colors"
                    >
                        <AnimatePresence mode="wait">
                            {isSidebarOpen ? (
                                <motion.div
                                    key="close"
                                    initial={{ rotate: -90 }}
                                    animate={{ rotate: 0 }}
                                    exit={{ rotate: 90 }}
                                >
                                    <X className="w-6 h-6" />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="menu"
                                    initial={{ rotate: 90 }}
                                    animate={{ rotate: 0 }}
                                    exit={{ rotate: -90 }}
                                >
                                    <Menu className="w-6 h-6" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.button>
                </header>

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    {children}
                </main>
            </div>

            <Toaster />
        </div>
    );
};

export default DashboardLayout;
