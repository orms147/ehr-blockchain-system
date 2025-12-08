"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid } from 'lucide-react';
import SystemStats from '@/components/admin/SystemStats';
import VerificationPanel from '@/components/admin/VerificationPanel';

const AdminDashboard = () => {
    return (
        <div className="max-w-6xl mx-auto px-4 py-2">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                    <LayoutGrid className="w-8 h-8 text-blue-600" />
                    Admin Console
                </h1>
                <p className="text-slate-500 mt-1">Monitor system health and manage network participants.</p>
            </div>

            <SystemStats />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4 }}
            >
                <VerificationPanel />
            </motion.div>
        </div>
    );
};

export default AdminDashboard;
