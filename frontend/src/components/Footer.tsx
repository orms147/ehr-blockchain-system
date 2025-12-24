"use client";

import { Shield, Twitter, Github, Linkedin, Mail } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { LucideIcon } from 'lucide-react';

const Footer = () => {
    const handleLinkClick = (linkName: string) => {
        toast({
            title: `${linkName}`,
            description: "🚧 Tính năng này chưa được phát triển—nhưng đừng lo! Bạn có thể yêu cầu trong prompt tiếp theo! 🚀",
            duration: 4000,
        });
    };

    const footerLinks = [
        {
            title: 'Sản phẩm',
            links: ['Tính năng', 'Bảng giá', 'Bảo mật', 'Lộ trình'],
        },
        {
            title: 'Công ty',
            links: ['Về chúng tôi', 'Tuyển dụng', 'Blog', 'Báo chí'],
        },
        {
            title: 'Tài nguyên',
            links: ['Tài liệu', 'Tài liệu API', 'Hỗ trợ', 'Cộng đồng'],
        },
        {
            title: 'Pháp lý',
            links: ['Chính sách bảo mật', 'Điều khoản dịch vụ', 'Chính sách Cookie', 'Tuân thủ HIPAA'],
        },
    ];

    const socialLinks: { icon: LucideIcon; name: string }[] = [
        { icon: Twitter, name: 'Twitter' },
        { icon: Github, name: 'GitHub' },
        { icon: Linkedin, name: 'LinkedIn' },
        { icon: Mail, name: 'Email' },
    ];

    return (
        <footer className="bg-slate-900 text-white pt-16 pb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 mb-12">
                    {/* Brand Column */}
                    <div className="col-span-2">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-teal-500 rounded-lg flex items-center justify-center">
                                <Shield className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold">EHR Chain</span>
                        </div>
                        <p className="text-slate-400 mb-6 max-w-sm">
                            Cách mạng hóa chăm sóc sức khỏe với công nghệ blockchain. Hồ sơ y tế bảo mật, riêng tư và có thể truy cập ngay lập tức cho mọi người.
                        </p>
                        <div className="flex gap-4">
                            {socialLinks.map((social) => (
                                <button
                                    key={social.name}
                                    onClick={() => handleLinkClick(social.name)}
                                    className="w-10 h-10 rounded-full bg-slate-800 hover:bg-blue-600 flex items-center justify-center transition-colors duration-300"
                                    aria-label={social.name}
                                >
                                    <social.icon className="w-5 h-5" />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Links Columns */}
                    {footerLinks.map((column) => (
                        <div key={column.title}>
                            <h3 className="font-semibold text-white mb-4">{column.title}</h3>
                            <ul className="space-y-3">
                                {column.links.map((link) => (
                                    <li key={link}>
                                        <button
                                            onClick={() => handleLinkClick(link)}
                                            className="text-slate-400 hover:text-white transition-colors duration-200 text-left"
                                        >
                                            {link}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-slate-800">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-slate-400 text-sm">
                            © {new Date().getFullYear()} EHR Chain. Bảo lưu mọi quyền.
                        </p>
                        <div className="flex gap-6">
                            <button
                                onClick={() => handleLinkClick('Chính sách bảo mật')}
                                className="text-slate-400 hover:text-white text-sm transition-colors duration-200"
                            >
                                Chính sách bảo mật
                            </button>
                            <button
                                onClick={() => handleLinkClick('Điều khoản dịch vụ')}
                                className="text-slate-400 hover:text-white text-sm transition-colors duration-200"
                            >
                                Điều khoản dịch vụ
                            </button>
                            <button
                                onClick={() => handleLinkClick('Liên hệ')}
                                className="text-slate-400 hover:text-white text-sm transition-colors duration-200"
                            >
                                Liên hệ
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
