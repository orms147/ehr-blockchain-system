import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

const DashboardLayout = ({ children }) => {
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const pathname = location.pathname;

    const handleNavigate = (path) => {
        navigate(path);
    };

    const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);

    const handleLogout = () => {
        toast({
            title: "Logged out",
            description: "You have been successfully logged out.",
        });
        navigate('/');
    };

    const getRoleInfo = () => {
        if (pathname.includes('/dashboard/doctor')) return { role: 'doctor', label: 'Doctor User', subLabel: 'Medical Professional', initials: 'DR' };
        if (pathname.includes('/dashboard/admin')) return { role: 'admin', label: 'Admin User', subLabel: 'Super Admin', initials: 'AD' };
        return { role: 'patient', label: 'Patient User', subLabel: 'Standard Access', initials: 'PA' };
    };

    const { role, label, subLabel, initials } = getRoleInfo();

    const navItems = [
        { icon: LayoutDashboard, label: 'Patient Portal', path: '/dashboard/patient', visible: role === 'patient' },
        { icon: Stethoscope, label: 'Doctor Portal', path: '/dashboard/doctor', visible: role === 'doctor' },
        { icon: LayoutGrid, label: 'Admin Portal', path: '/dashboard/admin', visible: role === 'admin' },
        { icon: User, label: 'My Profile', path: '/dashboard/profile', visible: true },
        { icon: Settings, label: 'Settings', path: '/dashboard/settings', visible: true },
    ].filter(item => item.visible);

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
                        const isActive = pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
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
                        Log Out
                    </button>
                </nav>

                <div className="absolute bottom-4 left-4 right-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                            {initials}
                        </div>
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
                <header className="lg:hidden h-16 bg-white border-b border-slate-200 flex items-center px-4 justify-between sticky top-0 z-30">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-teal-500 rounded-md flex items-center justify-center">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-slate-900">EHR Chain</span>
                    </div>
                    <button onClick={toggleSidebar} className="p-2 rounded-md hover:bg-slate-100">
                        {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default DashboardLayout;
