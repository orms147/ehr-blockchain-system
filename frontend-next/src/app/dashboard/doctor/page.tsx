"use client";

import DashboardLayout from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import { Stethoscope, Users, FileText, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function DoctorDashboardPage() {
    const stats = [
        { icon: Users, label: 'Bệnh nhân', value: '156', color: 'from-blue-500 to-blue-600' },
        { icon: FileText, label: 'Hồ sơ truy cập', value: '42', color: 'from-teal-500 to-teal-600' },
        { icon: Clock, label: 'Đang chờ xử lý', value: '8', color: 'from-orange-500 to-orange-600' },
        { icon: AlertCircle, label: 'Cần xác nhận', value: '3', color: 'from-purple-500 to-purple-600' },
    ];

    const springConfig = { type: "spring", stiffness: 100, damping: 20 };

    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={springConfig}
                    className="mb-8"
                >
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Stethoscope className="w-8 h-8 text-teal-600" />
                        Bảng điều khiển Bác sĩ
                    </h1>
                    <p className="text-slate-500 mt-2">Quản lý và truy cập hồ sơ bệnh nhân được ủy quyền.</p>
                </motion.div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {stats.map((stat, index) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ ...springConfig, delay: index * 0.1 }}
                        >
                            <Card className="hover:shadow-lg transition-shadow duration-300 overflow-hidden">
                                <CardContent className="p-6">
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4 shadow-lg`}>
                                        <stat.icon className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-3xl font-bold text-slate-900">{stat.value}</div>
                                    <div className="text-sm text-slate-500">{stat.label}</div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Coming Soon */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springConfig, delay: 0.4 }}
                >
                    <Card className="border-2 border-dashed border-slate-300 bg-slate-50/50">
                        <CardHeader>
                            <CardTitle className="text-slate-600">🚧 Đang phát triển</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-slate-500">
                                Các tính năng quản lý bệnh nhân, xem hồ sơ được ủy quyền, và cập nhật chẩn đoán sẽ được thêm vào trong phiên bản tiếp theo.
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </DashboardLayout>
    );
}
