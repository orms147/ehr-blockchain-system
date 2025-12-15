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
        case 'Diagnosis': return 'bg-blue-100 text-blue-600';
        case 'Prescription': return 'bg-green-100 text-green-600';
        case 'Lab': return 'bg-purple-100 text-purple-600';
        case 'X-Ray': return 'bg-orange-100 text-orange-600';
        default: return 'bg-slate-100 text-slate-600';
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
                    {record.verified && (
                        <Badge variant="secondary" className="bg-teal-50 text-teal-700 border-teal-200 flex gap-1 items-center">
                            <CheckCircle2 className="w-3 h-3" /> Verified
                        </Badge>
                    )}
                </div>

                <h3 className="font-semibold text-slate-900 mb-1 truncate" title={record.title}>
                    {record.title}
                </h3>
                <p className="text-sm text-slate-500 mb-4">{record.date}</p>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                            {record.doctor.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-sm text-slate-600 truncate max-w-[100px]" title={record.doctor}>
                            {record.doctor}
                        </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => onViewDetails(record)} className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200">
                        View Details
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default RecordCard;
