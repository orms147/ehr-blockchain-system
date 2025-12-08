"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const FeaturesSection = () => {
    const features = [
        {
            icon: Shield,
            title: 'Bảo mật',
            description: 'Mã hóa cấp quân sự và công nghệ blockchain đảm bảo hồ sơ y tế của bạn được bảo vệ khỏi truy cập trái phép và giả mạo.',
            gradient: 'from-blue-500 to-blue-600',
            bgGradient: 'from-blue-50 to-blue-100/50',
        },
        {
            icon: Lock,
            title: 'Quyền riêng tư',
            description: 'Bạn kiểm soát ai có thể truy cập dữ liệu của mình. Lưu trữ phi tập trung có nghĩa là không có thực thể đơn lẻ nào sở hữu hoặc kiểm soát thông tin sức khỏe nhạy cảm của bạn.',
            gradient: 'from-teal-500 to-teal-600',
            bgGradient: 'from-teal-50 to-teal-100/50',
        },
        {
            icon: Zap,
            title: 'Truy cập tức thì',
            description: 'Truy cập toàn bộ lịch sử y tế của bạn ngay lập tức từ bất kỳ đâu trên thế giới. Chia sẻ hồ sơ với các nhà cung cấp dịch vụ chăm sóc sức khỏe trong vài giây.',
            gradient: 'from-cyan-500 to-cyan-600',
            bgGradient: 'from-cyan-50 to-cyan-100/50',
        },
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.2,
            },
        },
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 50 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                duration: 0.6,
                ease: 'easeOut',
            },
        },
    };

    return (
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white/50">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-4">
                        Tại sao chọn{' '}
                        <span className="bg-gradient-to-r from-blue-600 to-teal-600 bg-clip-text text-transparent">
                            EHR Chain
                        </span>
                    </h2>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                        Trải nghiệm tương lai quản lý dữ liệu y tế với công nghệ blockchain tiên tiến
                    </p>
                </motion.div>

                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="grid md:grid-cols-3 gap-8"
                >
                    {features.map((feature, index) => (
                        <motion.div key={index} variants={cardVariants}>
                            <Card className="h-full border-2 border-slate-200 hover:border-slate-300 transition-all duration-300 hover:shadow-2xl group overflow-hidden relative">
                                <div className={`absolute inset-0 bg-gradient-to-br ${feature.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10`}></div>
                                <CardHeader className="relative z-10">
                                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                                        <feature.icon className="w-8 h-8 text-white" />
                                    </div>
                                    <CardTitle className="text-2xl font-bold text-slate-900 mb-2">
                                        {feature.title}
                                    </CardTitle>
                                    <CardDescription className="text-slate-600 text-base leading-relaxed">
                                        {feature.description}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="relative z-10">
                                    <div className="flex items-center gap-2 text-blue-600 font-semibold group-hover:gap-3 transition-all duration-300 cursor-pointer">
                                        <span>Tìm hiểu thêm</span>
                                        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
};

export default FeaturesSection;
