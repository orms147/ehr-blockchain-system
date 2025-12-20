"use client";

import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import DnaAnimation from '@/components/DnaAnimation';
import Link from 'next/link';
import { useRef } from 'react';

const HeroSection = () => {
    const containerRef = useRef<HTMLElement>(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end start"]
    });

    // Smooth parallax - subtle Y movement only, no opacity fading
    const y = useTransform(scrollYProgress, [0, 1], [0, 80]);

    // Spring animation config
    const springConfig = { type: "spring", stiffness: 100, damping: 20 };

    // Counter animation
    const stats = [
        { value: '100K+', label: 'Người dùng' },
        { value: '99.9%', label: 'Thời gian hoạt động' },
        { value: '256-bit', label: 'Mã hóa' },
    ];

    return (
        <section ref={containerRef} id="home" className="pt-28 pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden relative">
            {/* Background gradient orbs */}
            <motion.div
                className="absolute top-20 left-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl"
                animate={{
                    x: [0, 30, 0],
                    y: [0, -20, 0],
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />
            <motion.div
                className="absolute bottom-20 right-10 w-96 h-96 bg-teal-400/20 rounded-full blur-3xl"
                animate={{
                    x: [0, -40, 0],
                    y: [0, 30, 0],
                }}
                transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />

            <motion.div style={{ y }} className="max-w-7xl mx-auto relative z-10">
                <div className="grid lg:grid-cols-[1.4fr_0.8fr] gap-12 items-center">
                    {/* Left Content */}
                    <motion.div className="space-y-8">
                        <div className="space-y-6">
                            {/* Badge */}
                            <motion.div
                                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ ...springConfig, delay: 0.1 }}
                                className="inline-block"
                            >
                                <motion.span
                                    className="px-4 py-2 bg-gradient-to-r from-blue-100 to-teal-100 text-blue-700 rounded-full text-sm font-semibold inline-flex items-center gap-2 shadow-sm"
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Chăm sóc sức khỏe trên nền tảng Blockchain
                                </motion.span>
                            </motion.div>

                            {/* Heading */}
                            <motion.h1
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ ...springConfig, delay: 0.2 }}
                                className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight"
                            >
                                Hồ Sơ Y Tế
                                <br />
                                <span className="gradient-text-animated whitespace-nowrap">
                                    An Toàn & Tiện Lợi
                                </span>
                                <br />
                                Cho Mọi Người
                            </motion.h1>

                            {/* Description */}
                            <motion.p
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ ...springConfig, delay: 0.3 }}
                                className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl"
                            >
                                Quản lý hồ sơ sức khỏe của bạn một cách an toàn và bảo mật.
                                Truy cập thông tin y tế mọi lúc, mọi nơi - chỉ với một tài khoản.
                            </motion.p>
                        </div>

                        {/* Buttons */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...springConfig, delay: 0.4 }}
                            className="flex flex-col sm:flex-row gap-4"
                        >
                            <Link href="/register">
                                <motion.div
                                    whileHover={{ scale: 1.02, y: -3 }}
                                    whileTap={{ scale: 0.98 }}
                                    transition={springConfig}
                                >
                                    <Button
                                        size="lg"
                                        className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-xl shadow-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/40 transition-all duration-300 text-lg px-8 py-6 group"
                                    >
                                        Đăng ký miễn phí
                                        <motion.span
                                            className="ml-2"
                                            animate={{ x: [0, 5, 0] }}
                                            transition={{ duration: 1.5, repeat: Infinity }}
                                        >
                                            <ArrowRight className="w-5 h-5" />
                                        </motion.span>
                                    </Button>
                                </motion.div>
                            </Link>
                            <motion.div
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                transition={springConfig}
                            >
                                <Button
                                    variant="outline"
                                    size="lg"
                                    onClick={() => toast({
                                        title: "Tìm hiểu thêm",
                                        description: "🚧 Tính năng này chưa được phát triển—nhưng đừng lo! Bạn có thể yêu cầu trong prompt tiếp theo! 🚀",
                                        duration: 4000,
                                    })}
                                    className="border-2 border-blue-600 text-blue-600 hover:bg-blue-50 hover:border-blue-700 text-lg px-8 py-6 transition-all duration-300"
                                >
                                    Tìm hiểu thêm
                                </Button>
                            </motion.div>
                        </motion.div>

                        {/* Stats */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...springConfig, delay: 0.5 }}
                            className="flex items-center gap-8 pt-4"
                        >
                            {stats.map((stat, index) => (
                                <motion.div
                                    key={stat.label}
                                    className="text-center"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ ...springConfig, delay: 0.6 + index * 0.1 }}
                                    whileHover={{ scale: 1.1, y: -5 }}
                                >
                                    <motion.div
                                        className="text-3xl font-bold text-slate-900"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: 0.8 + index * 0.15 }}
                                    >
                                        {stat.value}
                                    </motion.div>
                                    <div className="text-sm text-slate-600">{stat.label}</div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </motion.div>

                    {/* Right Content - DNA Animation */}
                    <motion.div
                        initial={{ opacity: 0, x: 80, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ ...springConfig, delay: 0.3 }}
                        className="relative flex justify-end"
                    >
                        <motion.div
                            className="w-[85%] float"
                            whileHover={{ scale: 1.02 }}
                            transition={springConfig}
                        >
                            <DnaAnimation />
                        </motion.div>
                    </motion.div>
                </div>
            </motion.div>
        </section>
    );
};

export default HeroSection;
