"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, Calendar, FileText, ChevronRight } from 'lucide-react';

const PatientListItem = ({ patient, onViewRecords }) => {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            whileHover={{ scale: 1.005, backgroundColor: '#F8FAFC' }}
            transition={{ duration: 0.2 }}
            className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm gap-4 mb-3 group"
        >
            <div className="flex items-center gap-4 w-full sm:w-auto">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-teal-100 flex items-center justify-center text-blue-700 font-bold shadow-inner">
                    {patient.initials}
                </div>
                <div>
                    <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                        {patient.name}
                        {patient.verified && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 h-5 bg-teal-50 text-teal-700 border-teal-200">
                                Verified
                            </Badge>
                        )}
                    </h4>
                    <p className="text-xs font-mono text-slate-500 truncate max-w-[200px] sm:max-w-xs">
                        {patient.address}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                <div className="hidden md:flex flex-col items-end">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                        <Calendar className="w-3 h-3" /> Last Visit
                    </div>
                    <span className="text-sm font-medium text-slate-700">{patient.lastVisit}</span>
                </div>

                <Button
                    onClick={() => onViewRecords(patient.id)}
                    className="bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 shadow-sm group-hover:border-blue-300 transition-all duration-300"
                >
                    <FileText className="w-4 h-4 mr-2" />
                    View Records
                    <ChevronRight className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Button>
            </div>
        </motion.div>
    );
};

export default PatientListItem;
