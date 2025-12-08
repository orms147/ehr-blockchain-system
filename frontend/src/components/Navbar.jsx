"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Menu, X, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const Navbar = () => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleConnectWallet = () => {
        toast({
            title: "Kết nối Ví",
            description: "🚧 Tính năng này chưa được phát triển—nhưng đừng lo! Bạn có thể yêu cầu trong prompt tiếp theo! 🚀",
            duration: 4000,
        });
    };

    const menuItems = [
        { name: 'Trang chủ', href: '#home' },
        { name: 'Giới thiệu', href: '#about' },
        { name: 'Liên hệ', href: '#contact' },
    ];

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5 }}
                        className="flex items-center gap-2"
                    >
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-teal-500 rounded-lg flex items-center justify-center">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-teal-600 bg-clip-text text-transparent">
                            EHR Chain
                        </span>
                    </motion.div>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center gap-8">
                        {menuItems.map((item, index) => (
                            <motion.a
                                key={item.name}
                                href={item.href}
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: index * 0.1 }}
                                className="text-slate-700 hover:text-blue-600 transition-colors duration-200 font-medium"
                            >
                                {item.name}
                            </motion.a>
                        ))}
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.3 }}
                        >
                            <Button
                                onClick={handleConnectWallet}
                                className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                            >
                                Kết nối Ví
                            </Button>
                        </motion.div>
                    </div>

                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        {mobileMenuOpen ? (
                            <X className="w-6 h-6 text-slate-700" />
                        ) : (
                            <Menu className="w-6 h-6 text-slate-700" />
                        )}
                    </button>
                </div>

                {/* Mobile Menu */}
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden py-4 border-t border-slate-200"
                    >
                        <div className="flex flex-col gap-4">
                            {menuItems.map((item) => (
                                <a
                                    key={item.name}
                                    href={item.href}
                                    className="text-slate-700 hover:text-blue-600 transition-colors duration-200 font-medium px-2"
                                    onClick={() => setMobileMenuOpen(false)}
                                >
                                    {item.name}
                                </a>
                            ))}
                            <Button
                                onClick={handleConnectWallet}
                                className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white w-full"
                            >
                                Kết nối Ví
                            </Button>
                        </div>
                    </motion.div>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
