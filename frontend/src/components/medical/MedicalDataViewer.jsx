"use client";

import React from 'react';
import {
    Activity, Pill, FlaskConical, Stethoscope, FileText, CalendarDays,
    Heart, Thermometer, Scale, Ruler, AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * MedicalDataViewer - Renders structured medical JSON into a readable UI.
 * Supports: FHIR-inspired format, plain text, and raw JSON fallback.
 * 
 * @param {Object} props
 * @param {Object|string} props.data - Decrypted medical record data
 */
export default function MedicalDataViewer({ data }) {
    // Handle null/undefined
    if (!data) {
        return <p className="text-slate-500 italic">Không có dữ liệu để hiển thị.</p>;
    }

    // If data is a string, try to parse it
    let parsed = data;
    if (typeof data === 'string') {
        try {
            parsed = JSON.parse(data);
        } catch {
            // Plain text fallback
            return (
                <Card className="bg-slate-50">
                    <CardContent className="p-4">
                        <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono">{data}</pre>
                    </CardContent>
                </Card>
            );
        }
    }

    // Check if it's our structured format
    const isStructured = parsed.resourceType === 'MedicalRecord' || parsed.encounter || parsed.diagnosis || parsed.medications;

    if (!isStructured) {
        // Raw JSON fallback — styled
        return (
            <Card className="bg-slate-50">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-slate-500 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Dữ liệu thô (JSON)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <pre className="text-xs text-slate-600 bg-white p-3 rounded-lg border overflow-x-auto max-h-96 overflow-y-auto">
                        {JSON.stringify(parsed, null, 2)}
                    </pre>
                </CardContent>
            </Card>
        );
    }

    // === Structured Medical Record Rendering ===
    return (
        <div className="space-y-4">
            {/* Encounter Info */}
            {parsed.encounter && (
                <Card className="bg-blue-50/50 border-blue-200">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                            <Stethoscope className="w-4 h-4" /> Thông tin lượt khám
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            {parsed.encounter.date && (
                                <div><span className="text-slate-500">Ngày khám:</span> <span className="font-medium">{parsed.encounter.date}</span></div>
                            )}
                            {parsed.encounter.facility && (
                                <div><span className="text-slate-500">Nơi khám:</span> <span className="font-medium">{parsed.encounter.facility}</span></div>
                            )}
                            {parsed.encounter.chiefComplaint && (
                                <div className="sm:col-span-2">
                                    <span className="text-slate-500">Lý do khám:</span>{' '}
                                    <span className="font-medium text-slate-800">{parsed.encounter.chiefComplaint}</span>
                                </div>
                            )}
                        </div>
                        {/* Practitioner info */}
                        {parsed.practitioner && (
                            <div className="mt-2 pt-2 border-t border-blue-100 text-sm text-slate-600">
                                Bác sĩ: <span className="font-medium">{parsed.practitioner.name}</span>
                                {parsed.practitioner.specialty && ` — ${parsed.practitioner.specialty}`}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Diagnosis (ICD-10) */}
            {parsed.diagnosis && parsed.diagnosis.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" /> Chẩn đoán
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="space-y-2">
                            {parsed.diagnosis.map((d, i) => (
                                <div key={i} className="flex items-start gap-3 p-2 bg-amber-50/50 rounded-lg border border-amber-100">
                                    {d.icd10Code && (
                                        <Badge variant="outline" className="shrink-0 font-mono text-xs border-amber-300 text-amber-700">
                                            {d.icd10Code}
                                        </Badge>
                                    )}
                                    <div>
                                        <p className="text-sm font-medium text-slate-800">{d.description || d.text || 'Không mô tả'}</p>
                                        {d.type && <p className="text-xs text-slate-500 mt-0.5">Loại: {d.type === 'primary' ? 'Chẩn đoán chính' : d.type}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Vital Signs */}
            {parsed.vitalSigns && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-red-500" /> Chỉ số sinh tồn
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {parsed.vitalSigns.bloodPressure && (
                                <VitalCard icon={Heart} label="Huyết áp" value={parsed.vitalSigns.bloodPressure} unit="mmHg" color="text-red-600" bgColor="bg-red-50" borderColor="border-red-100" />
                            )}
                            {parsed.vitalSigns.heartRate && (
                                <VitalCard icon={Activity} label="Nhịp tim" value={parsed.vitalSigns.heartRate} unit="bpm" color="text-pink-600" bgColor="bg-pink-50" borderColor="border-pink-100" />
                            )}
                            {parsed.vitalSigns.temperature && (
                                <VitalCard icon={Thermometer} label="Nhiệt độ" value={parsed.vitalSigns.temperature} unit="°C" color="text-orange-600" bgColor="bg-orange-50" borderColor="border-orange-100" />
                            )}
                            {parsed.vitalSigns.weight && (
                                <VitalCard icon={Scale} label="Cân nặng" value={parsed.vitalSigns.weight} unit="kg" color="text-blue-600" bgColor="bg-blue-50" borderColor="border-blue-100" />
                            )}
                            {parsed.vitalSigns.height && (
                                <VitalCard icon={Ruler} label="Chiều cao" value={parsed.vitalSigns.height} unit="cm" color="text-teal-600" bgColor="bg-teal-50" borderColor="border-teal-100" />
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Medications */}
            {parsed.medications && parsed.medications.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                            <Pill className="w-4 h-4 text-green-600" /> Đơn thuốc
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-medium">
                                        <th className="text-left py-3 px-4 uppercase text-[11px] tracking-wider">Tên thuốc</th>
                                        <th className="text-left py-3 px-4 uppercase text-[11px] tracking-wider hidden sm:table-cell">Liều lượng</th>
                                        <th className="text-left py-3 px-4 uppercase text-[11px] tracking-wider">Tần suất</th>
                                        <th className="text-left py-3 px-4 uppercase text-[11px] tracking-wider hidden md:table-cell">Thời gian</th>
                                        <th className="text-left py-3 px-4 uppercase text-[11px] tracking-wider hidden lg:table-cell">Ghi chú</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {parsed.medications.map((med, i) => (
                                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="py-2.5 px-4">
                                                <div className="font-semibold text-slate-800">{med.name}</div>
                                                {/* Hiển thị trên mobile nếu ẩn ở cột lớn */}
                                                <div className="text-xs text-slate-500 sm:hidden mt-0.5">Liều: {med.dosage || '—'}</div>
                                            </td>
                                            <td className="py-2.5 px-4 text-slate-700 font-medium hidden sm:table-cell bg-slate-50/30">{med.dosage || '—'}</td>
                                            <td className="py-2.5 px-4 text-slate-600">{med.frequency || '—'}</td>
                                            <td className="py-2.5 px-4 text-slate-600 hidden md:table-cell">{med.duration || '—'}</td>
                                            <td className="py-2.5 px-4 text-slate-500 text-xs hidden lg:table-cell max-w-[200px] truncate" title={med.notes}>{med.notes || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Lab Results */}
            {parsed.labResults && parsed.labResults.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                            <FlaskConical className="w-4 h-4 text-purple-600" /> Kết quả xét nghiệm
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                        {parsed.labResults.map((lab, i) => (
                            <div key={i}>
                                <p className="text-sm font-medium text-slate-700 mb-1">{lab.testName}</p>
                                {lab.items && lab.items.length > 0 ? (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-medium">
                                                    <th className="text-left py-3 px-4 uppercase text-[11px] tracking-wider">Chỉ số</th>
                                                    <th className="text-left py-3 px-4 uppercase text-[11px] tracking-wider">Kết quả</th>
                                                    <th className="text-left py-3 px-4 uppercase text-[11px] tracking-wider hidden sm:table-cell">Tham chiếu</th>
                                                    <th className="text-left py-3 px-4 uppercase text-[11px] tracking-wider text-right">Đánh giá</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {lab.items.map((item, j) => (
                                                    <tr key={j} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="py-2.5 px-4 font-medium text-slate-700">{item.name}</td>
                                                        <td className="py-2.5 px-4">
                                                            <span className="font-bold text-slate-900">{item.value}</span>
                                                            <span className="text-slate-500 text-xs ml-1">{item.unit || ''}</span>
                                                        </td>
                                                        <td className="py-2.5 px-4 text-slate-400 text-xs hidden sm:table-cell font-mono bg-slate-50/30">{item.range || '—'}</td>
                                                        <td className="py-2.5 px-4 text-right">
                                                            <LabStatus status={item.status} />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-500">{lab.value || 'Không có chi tiết'}</p>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Notes & Follow-up */}
            {(parsed.notes || parsed.followUpDate) && (
                <Card className="bg-slate-50/50">
                    <CardContent className="p-4">
                        {parsed.notes && (
                            <div className="mb-2">
                                <p className="text-xs text-slate-500 font-medium mb-1">Ghi chú bác sĩ</p>
                                <p className="text-sm text-slate-700">{parsed.notes}</p>
                            </div>
                        )}
                        {parsed.followUpDate && (
                            <div className="flex items-center gap-2 text-sm text-blue-700">
                                <CalendarDays className="w-4 h-4" />
                                Tái khám: <span className="font-medium">{parsed.followUpDate}</span>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

// === Sub-components ===

function VitalCard({ icon: Icon, label, value, unit, color, bgColor, borderColor }) {
    // Tách số và chữ nếu value truyền vào chứa cả số lẫn chữ (ví dụ "120/80 mmHg")
    // Nhưng vì ta đã format phần unit riêng nên value nên là text sạch.
    return (
        <div className={`relative p-3.5 bg-white rounded-xl border object-contain overflow-hidden ${borderColor} transition-all hover:shadow-md hover:-translate-y-0.5`}>
            {/* Background Decor */}
            <div className={`absolute -right-4 -top-4 w-16 h-16 rounded-full opacity-20 ${bgColor}`} />

            <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bgColor} ${color}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">{label}</p>
            </div>
            <div className="flex items-baseline gap-1">
                <p className="text-2xl font-bold text-slate-800 tracking-tight">{value}</p>
                {unit && <p className="text-xs font-semibold text-slate-400 uppercase">{unit}</p>}
            </div>
        </div>
    );
}

function LabStatus({ status }) {
    if (!status) return <span className="text-xs text-slate-400">—</span>;

    const configs = {
        normal: { label: 'Bình thường', className: 'bg-green-100 text-green-700' },
        high: { label: 'Cao', className: 'bg-red-100 text-red-700' },
        low: { label: 'Thấp', className: 'bg-amber-100 text-amber-700' },
        critical: { label: 'Nguy hiểm', className: 'bg-red-200 text-red-800 font-bold' },
    };

    const config = configs[status] || { label: status, className: 'bg-slate-100 text-slate-600' };

    return (
        <span className={`text-xs px-1.5 py-0.5 rounded ${config.className}`}>
            {config.label}
        </span>
    );
}
