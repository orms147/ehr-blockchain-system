import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from '@/components/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardLayout from '@/components/layout/DashboardLayout';
import AdminDashboard from '@/components/admin/AdminDashboard';
import DoctorDashboard from '@/components/doctor/DoctorDashboard';
import PatientDashboard from '@/components/dashboard/PatientDashboard';
import { Providers } from '@/components/Providers';
import { Toaster } from '@/components/ui/toaster';

function App() {
    return (
        <Providers>
            <Router>
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />

                    <Route path="/dashboard" element={<DashboardLayout />}>
                        <Route path="admin" element={<AdminDashboard />} />
                        <Route path="doctor" element={<DoctorDashboard />} />
                        <Route path="patient" element={<PatientDashboard />} />
                    </Route>
                </Routes>
            </Router>
            <Toaster />
        </Providers>
    );
}

export default App;
