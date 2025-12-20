"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle } from 'lucide-react';

const RequestItem = ({ request, onApprove, onReject }) => {
    return (
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                    <h4 className="font-semibold text-slate-900">{request.requesterName}</h4>
                    <p className="text-sm text-slate-500 mt-1 mb-2">{request.requesterRole || "Healthcare Provider"}</p>
                    <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-700 border border-slate-100">
                        <span className="font-medium text-slate-900 block mb-1">Reason for access:</span>
                        {request.reason}
                    </div>
                </div>

                <div className="flex sm:flex-col gap-2 justify-center min-w-[120px]">
                    <Button
                        onClick={() => onApprove(request.id)}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white flex items-center gap-2 justify-center"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        Approve
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => onReject(request.id)}
                        className="flex-1 border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-2 justify-center"
                    >
                        <XCircle className="w-4 h-4" />
                        Reject
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default RequestItem;
