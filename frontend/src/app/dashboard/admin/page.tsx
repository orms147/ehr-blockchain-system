"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Admin dashboard redirects to Ministry dashboard
 * In EHR context: "Admin" is just a technical term, 
 * "Ministry" (Bộ Y tế) is the actual role with permissions
 */
export default function AdminDashboardPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/dashboard/ministry');
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-600 border-t-transparent mx-auto mb-4" />
                <p className="text-slate-600">Đang chuyển hướng đến Bảng điều khiển Bộ Y tế...</p>
            </div>
        </div>
    );
}
