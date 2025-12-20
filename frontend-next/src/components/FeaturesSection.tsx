"use client";

import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Shield, Lock, Zap, LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRef } from 'react';

interface Feature {
    icon: LucideIcon;
    title: string;
    description: string;
    gradient: string;
    bgGradient: string;
    shadowColor: string;
}

// 3D Card component with mouse tracking
const FeatureCard = ({ feature, index }: { feature: Feature; index: number }) => {
    const cardRef = useRef<HTMLDivElement>(null);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 30 });
    const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-8, 8]), { stiffness: 300, damping: 30 });

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        mouseX.set(x);
        mouseY.set(y);
    };

    const handleMouseLeave = () => {
        mouseX.set(0);
        mouseY.set(0);
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 60, scale: 0.9 },
        visible: {
            opacity: 1,
            y: 0,
            scale: 1,
            transition: {
                type: "spring",
                stiffness: 100,
                damping: 15,
                delay: index * 0.15,
            },
        },
    };

    return (
        <motion.div
            ref={cardRef}
            variants={cardVariants}
            style={{
                rotateX,
                rotateY,
                transformPerspective: 1000,
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            whileHover={{ scale: 1.02 }}
            className="cursor-pointer"
        >
            <Card className={`h-full border-2 border-slate-200 hover:border-slate-300 transition-all duration-500 group overflow-hidden relative bg-white/80 backdrop-blur-sm hover:shadow-2xl ${feature.shadowColor}`}>
                {/* Animated gradient background */}
                <motion.div
                    className={`absolute inset-0 bg-gradient-to-br ${feature.bgGradient} -z-10`}
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                />

                {/* Shine effect on hover */}
                <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -z-5 opacity-0 group-hover:opacity-100"
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                />

                <CardHeader className="relative z-10">
                    {/* Icon with pulse animation */}
                    <motion.div
                        className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 shadow-lg`}
                        whileHover={{
                            scale: 1.15,
                            rotate: [0, -5, 5, 0],
                        }}
                        transition={{
                            scale: { type: "spring", stiffness: 400, damping: 17 },
                            rotate: { duration: 0.5 }
                        }}
                    >
                        <feature.icon className="w-8 h-8 text-white" />
                    </motion.div>

                    <CardTitle className="text-2xl font-bold text-slate-900 mb-2 group-hover:text-blue-700 transition-colors duration-300">
                        {feature.title}
                    </CardTitle>
                    <CardDescription className="text-slate-600 text-base leading-relaxed">
                        {feature.description}
                    </CardDescription>
                </CardHeader>

                <CardContent className="relative z-10">
                    <motion.div
                        className="flex items-center gap-2 text-blue-600 font-semibold cursor-pointer"
                        whileHover={{ x: 5 }}
                    >
                        <span>Tìm hiểu thêm</span>
                        <motion.svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            whileHover={{ x: 4 }}
                            transition={{ type: "spring", stiffness: 400, damping: 10 }}
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </motion.svg>
                    </motion.div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

const FeaturesSection = () => {
    const features: Feature[] = [
        {
            icon: Shield,
            title: 'Bảo mật',
            description: 'Mã hóa cấp quân sự và công nghệ blockchain đảm bảo hồ sơ y tế của bạn được bảo vệ khỏi truy cập trái phép và giả mạo.',
            gradient: 'from-blue-500 to-blue-600',
            bgGradient: 'from-blue-50 to-blue-100/50',
            shadowColor: 'hover:shadow-blue-200/50',
        },
        {
            icon: Lock,
            title: 'Quyền riêng tư',
            description: 'Bạn kiểm soát ai có thể truy cập dữ liệu của mình. Lưu trữ phi tập trung có nghĩa là không có thực thể đơn lẻ nào sở hữu hoặc kiểm soát thông tin sức khỏe nhạy cảm của bạn.',
            gradient: 'from-teal-500 to-teal-600',
            bgGradient: 'from-teal-50 to-teal-100/50',
            shadowColor: 'hover:shadow-teal-200/50',
        },
        {
            icon: Zap,
            title: 'Truy cập tức thì',
            description: 'Truy cập toàn bộ lịch sử y tế của bạn ngay lập tức từ bất kỳ đâu trên thế giới. Chia sẻ hồ sơ với các nhà cung cấp dịch vụ chăm sóc sức khỏe trong vài giây.',
            gradient: 'from-cyan-500 to-cyan-600',
            bgGradient: 'from-cyan-50 to-cyan-100/50',
            shadowColor: 'hover:shadow-cyan-200/50',
        },
    ];

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.15,
                delayChildren: 0.2,
            },
        },
    };

    return (
        <section id="about" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white/50 to-slate-50/80">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="text-center mb-20"
                >
                    <motion.span
                        className="inline-block px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold mb-6"
                        initial={{ opacity: 0, scale: 0.8 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                    >
                        Tính năng nổi bật
                    </motion.span>

                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-6">
                        Tại sao chọn{' '}
                        <span className="gradient-text-animated">
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
                    viewport={{ once: true, margin: "-50px" }}
                    className="grid md:grid-cols-3 gap-8"
                >
                    {features.map((feature, index) => (
                        <FeatureCard key={index} feature={feature} index={index} />
                    ))}
                </motion.div>
            </div>
        </section>
    );
};

export default FeaturesSection;
