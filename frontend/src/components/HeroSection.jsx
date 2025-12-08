"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import DnaAnimation from '@/components/DnaAnimation';

const HeroSection = () => {
    const handleGetStarted = () => {
        toast({
            title: "Bắt đầu ngay",
            description: "🚧 Tính năng này chưa được phát triển—nhưng đừng lo! Bạn có thể yêu cầu trong prompt tiếp theo! 🚀",
            duration: 4000,
        });
    };

    return (
        <section id="home" className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
                <div className="grid lg:grid-cols-[1.4fr_0.8fr] gap-8 items-center">
                    {/* Left Content */}
                    <motion.div
                        className="space-y-8"
                    >
                        <div className="space-y-4">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: 0.2 }}
                                className="inline-block"
                            >
                                <span className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold">
                                    Chăm sóc sức khỏe trên nền tảng Blockchain
                                </span>
                            </motion.div>

                            <motion.h1
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: 0.3 }}
                                className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight"
                            >
                                Hồ Sơ Y Tế
                                <br />
                                <span className="bg-gradient-to-r from-blue-600 to-teal-600 bg-clip-text text-transparent whitespace-nowrap">
                                    Bảo Mật & Phi Tập Trung
                                </span>
                                <br />
                                Cho Mọi Người
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: 0.4 }}
                                className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl"
                            >
                                Kiểm soát dữ liệu sức khỏe của bạn với hệ thống EHR dựa trên blockchain mang tính cách mạng của chúng tôi.
                                Trải nghiệm bảo mật tuyệt đối, quyền riêng tư và truy cập tức thì vào hồ sơ y tế của bạn, mọi lúc, mọi nơi.
                            </motion.p>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.5 }}
                            className="flex flex-col sm:flex-row gap-4"
                        >
                            <Button
                                onClick={handleGetStarted}
                                size="lg"
                                className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-xl hover:shadow-2xl transition-all duration-300 text-lg px-8 py-6 group"
                            >
                                Bắt đầu ngay
                                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </Button>
                            <Button
                                variant="outline"
                                size="lg"
                                onClick={() => toast({
                                    title: "Tìm hiểu thêm",
                                    description: "🚧 Tính năng này chưa được phát triển—nhưng đừng lo! Bạn có thể yêu cầu trong prompt tiếp theo! 🚀",
                                    duration: 4000,
                                })}
                                className="border-2 border-blue-600 text-blue-600 hover:bg-blue-50 text-lg px-8 py-6 transition-all duration-300"
                            >
                                Tìm hiểu thêm
                            </Button>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6, delay: 0.6 }}
                            className="flex items-center gap-8 pt-4"
                        >
                            <div className="text-center">
                                <div className="text-3xl font-bold text-slate-900">100K+</div>
                                <div className="text-sm text-slate-600">Người dùng</div>
                            </div>
                            <div className="h-12 w-px bg-slate-300"></div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-slate-900">99.9%</div>
                                <div className="text-sm text-slate-600">Thời gian hoạt động</div>
                            </div>
                            <div className="h-12 w-px bg-slate-300"></div>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-slate-900">256-bit</div>
                                <div className="text-sm text-slate-600">Mã hóa</div>
                            </div>
                        </motion.div>
                    </motion.div>

                    {/* Right Content - Animation */}
                    <motion.div
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                        className="relative flex justify-end"
                    >
                        <div className="w-[80%]">
                            <DnaAnimation />
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};

export default HeroSection;
