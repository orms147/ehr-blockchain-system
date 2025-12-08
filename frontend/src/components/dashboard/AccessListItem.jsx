"use client";
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, UserCheck, Ban } from 'lucide-react';

const AccessListItem = ({ access, onRevoke }) => {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors gap-4">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
                    <UserCheck className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                    <h4 className="font-semibold text-slate-900">{access.doctorName}</h4>
                    <div className="flex flex-wrap gap-2 mt-1">
                        <Badge variant="outline" className="text-slate-600 font-normal">
                            {access.accessScope}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-slate-500 px-2 py-0.5 rounded-full bg-slate-100">
                            <Clock className="w-3 h-3" />
                            expires: {access.expiryDate}
                        </div>
                    </div>
                </div>
            </div>

            <Button
                variant="destructive"
                size="sm"
                onClick={() => onRevoke(access.id)}
                className="w-full sm:w-auto flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 shadow-none"
            >
                <Ban className="w-4 h-4" />
                Revoke Access
            </Button>
        </div>
    );
};

export default AccessListItem;
