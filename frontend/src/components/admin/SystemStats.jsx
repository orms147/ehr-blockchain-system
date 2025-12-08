"use client";
import React from 'react';
import { Users, FileText, Clock } from 'lucide-react';
import StatCard from '@/components/admin/StatCard';

const SystemStats = () => {
    const stats = [
        {
            title: "Total Users",
            value: 2845,
            icon: Users,
            trend: 12,
            trendLabel: "this week"
        },
        {
            title: "Total Records",
            value: 15234,
            icon: FileText,
            trend: 8,
            trendLabel: "this week"
        },
        {
            title: "System Uptime",
            value: 99,
            suffix: "%",
            icon: Clock,
            trend: 0.1,
            trendLabel: "improvement"
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {stats.map((stat, index) => (
                <StatCard key={index} {...stat} />
            ))}
        </div>
    );
};

export default SystemStats;
