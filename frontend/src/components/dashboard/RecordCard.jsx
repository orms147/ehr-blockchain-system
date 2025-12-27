"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Stethoscope,
    Pill,
    FlaskConical,
    FileText,
    ScanLine,
    CheckCircle2
} from 'lucide-react';

const getIcon = (type) => {
    switch (type) {
        case 'Diagnosis': return <Stethoscope className="w-5 h-5" />;
        case 'Prescription': return <Pill className="w-5 h-5" />;
        case 'Lab': return <FlaskConical className="w-5 h-5" />;
        case 'X-Ray': return <ScanLine className="w-5 h-5" />;
        default: return <FileText className="w-5 h-5" />;
    }
};

const getColor = (type) => {
    switch (type) {
        case 'diagnosis': case 'Diagnosis': return 'bg-blue-100 text-blue-600';
        case 'prescription': case 'Prescription': return 'bg-green-100 text-green-600';
        case 'lab_result': case 'Lab': return 'bg-purple-100 text-purple-600';
        case 'imaging': case 'X-Ray': return 'bg-orange-100 text-orange-600';
        case 'other': return 'bg-slate-100 text-slate-600';
        default: return 'bg-slate-100 text-slate-600';
    }
};

// Vietnamese labels for record types
const getTypeLabel = (type) => {
    switch (type) {
        case 'diagnosis': case 'Diagnosis': return 'Chẩn đoán';
        case 'prescription': case 'Prescription': return 'Đơn thuốc';
        case 'lab_result': case 'Lab': return 'Xét nghiệm';
        case 'imaging': case 'X-Ray': return 'Hình ảnh';
        case 'checkup': case 'Checkup': return 'Khám định kỳ';
        case 'other': return 'Khác';
        default: return type || 'Hồ sơ';
    }
};

const RecordCard = ({ record, onViewDetails }) => {
    return (
        <Card className="hover:shadow-md transition-shadow duration-200 overflow-hidden border-slate-200">
            <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-xl ${getColor(record.type)}`}>
                        {getIcon(record.type)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-xs">
                            {getTypeLabel(record.type)}
                        </Badge>
                        {record.verified && (
                            <Badge variant="secondary" className="bg-teal-50 text-teal-700 border-teal-200 flex gap-1 items-center">
                                <CheckCircle2 className="w-3 h-3" /> Verified
                            </Badge>
                        )}
                    </div>
                </div>

                <h3 className="font-semibold text-slate-900 mb-1 truncate" title={record.title}>
                    {record.title}
                </h3>
                {record.description && (
                    <p className="text-sm text-slate-500 mb-2 line-clamp-2" title={record.description}>
                        {record.description}
                    </p>
                )}
                <p className="text-sm text-slate-400">{record.date}</p>


                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${record.isCreatedByDoctor ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-600'}`}>
                            {record.isCreatedByDoctor ? '🩺' : '👤'}
                        </div>
                        <span className="text-sm text-slate-600 truncate max-w-[100px]" title={record.createdByDisplay || record.createdBy}>
                            {record.createdByDisplay || 'Bạn'}
                        </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => onViewDetails(record)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200">
                        Xem chi tiết
                    </Button>
                </div>

            </CardContent>
        </Card>
    );
};

export default RecordCard;
