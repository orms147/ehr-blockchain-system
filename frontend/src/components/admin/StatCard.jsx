import React, { useEffect, useRef } from 'react';
import { motion, useInView, useMotionValue, useSpring } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';

const AnimatedCounter = ({ value, suffix = '' }) => {
    const ref = useRef(null);
    const motionValue = useMotionValue(0);
    const springValue = useSpring(motionValue, { damping: 30, stiffness: 100 });
    const isInView = useInView(ref, { once: true, margin: "-10px" });

    useEffect(() => {
        if (isInView) {
            motionValue.set(value);
        }
    }, [motionValue, isInView, value]);

    useEffect(() => {
        return springValue.on("change", (latest) => {
            if (ref.current) {
                ref.current.textContent = Math.floor(latest).toLocaleString() + suffix;
            }
        });
    }, [springValue, suffix]);

    return <span ref={ref} className="text-3xl font-bold text-slate-900" />;
};

const StatCard = ({ title, value, icon: Icon, suffix, trend, trendLabel }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
        >
            <Card className="overflow-hidden border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-50 rounded-xl">
                            <Icon className="w-6 h-6 text-blue-600" />
                        </div>
                        {trend && (
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                +{trend}% {trendLabel}
                            </span>
                        )}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                        <AnimatedCounter value={value} suffix={suffix} />
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default StatCard;
