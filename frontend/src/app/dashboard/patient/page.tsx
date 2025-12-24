"use client";

import DashboardLayout from '@/components/layout/DashboardLayout';
import PatientDashboard from '@/components/dashboard/PatientDashboard';

export default function PatientDashboardPage() {
    return (
        <DashboardLayout>
            <PatientDashboard />
        </DashboardLayout>
    );
}
