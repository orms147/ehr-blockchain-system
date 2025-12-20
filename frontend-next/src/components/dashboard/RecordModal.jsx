"use client";

import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Calendar, User } from 'lucide-react';

const RecordModal = ({ record, open, onOpenChange }) => {
    if (!record) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <div className="flex items-start justify-between pr-8">
                        <div>
                            <Badge variant="secondary" className="mb-2">
                                {record.type}
                            </Badge>
                            <DialogTitle className="text-2xl font-bold text-slate-900">
                                {record.title}
                            </DialogTitle>
                        </div>
                        {record.verified && (
                            <Badge className="bg-teal-50 text-teal-700 border-teal-200">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
                            </Badge>
                        )}
                    </div>
                    <DialogDescription>
                        Record ID: #{Math.random().toString(36).substr(2, 9).toUpperCase()}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                                <Calendar className="w-4 h-4" /> Date
                            </div>
                            <div className="font-medium">{record.date}</div>
                        </div>
                        <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                            <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                                <User className="w-4 h-4" /> Doctor
                            </div>
                            <div className="font-medium">{record.doctor}</div>
                        </div>
                    </div>

                    <div className="p-4 rounded-lg border border-slate-200">
                        <h4 className="text-sm font-semibold text-slate-900 mb-2">Details</h4>
                        <p className="text-slate-600 text-sm leading-relaxed">
                            {record.details || "No additional details provided for this record. Please contact your healthcare provider for full documentation."}
                        </p>
                    </div>

                    {/* Mock Medical Data */}
                    <div className="p-4 rounded-lg bg-blue-50/50 border border-blue-100">
                        <h4 className="text-sm font-semibold text-blue-900 mb-2">Encrypted Data Hash</h4>
                        <p className="font-mono text-xs text-slate-500 break-all">
                            0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
                        </p>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default RecordModal;
