"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const PatientSearchBar = ({ value, onChange }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mb-6"
        >
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400" />
            </div>
            <Input
                type="text"
                placeholder="Search patients by name or wallet address..."
                value={value}
                onChange={onChange}
                className="pl-10 h-12 bg-white shadow-sm border-slate-200 focus:border-blue-500 focus:ring-blue-500 transition-all duration-200 text-base"
            />
        </motion.div>
    );
};

export default PatientSearchBar;
