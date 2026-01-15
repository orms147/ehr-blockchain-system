"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OrgDashboard } from '@/components/org';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { Loader2 } from 'lucide-react';

export default function OrgDashboardPage() {
    const router = useRouter();
    const { address, loading, isConnected } = useWalletAddress();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        // Redirect to login if not connected (after mounting)
        if (mounted && !loading && !isConnected) {
            router.push('/login');
        }
    }, [mounted, loading, isConnected, router]);

    if (!mounted || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        );
    }

    if (!isConnected) {
        return null; // Will redirect in useEffect
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50">
            <div className="container mx-auto px-4 py-8 max-w-4xl">
                <OrgDashboard />
            </div>
        </div>
    );
}
