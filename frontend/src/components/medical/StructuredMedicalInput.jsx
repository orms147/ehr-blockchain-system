"use client";

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Search, X, Plus, Trash2, Activity, Pill, FlaskConical, Stethoscope
} from 'lucide-react';
import ICD10_CODES from '@/data/icd10-common';

/* ─────────── ICD-10 Autocomplete ─────────── */
export function ICD10Input({ value = [], onChange }) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const results = useMemo(() => {
        if (!query || query.length < 1) return [];
        const q = query.toLowerCase();
        return ICD10_CODES
            .filter(c =>
                c.code.toLowerCase().includes(q) ||
                c.name.toLowerCase().includes(q)
            )
            .slice(0, 8);
    }, [query]);

    useEffect(() => {
        const handleClick = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const addCode = (item) => {
        if (!value.find(v => v.code === item.code)) {
            onChange([...value, item]);
        }
        setQuery('');
        setIsOpen(false);
    };

    const removeCode = (code) => {
        onChange(value.filter(v => v.code !== code));
    };

    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Chẩn đoán ICD-10
            </Label>

            {/* Selected Codes */}
            {value.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                    {value.map(item => (
                        <Badge
                            key={item.code}
                            className="bg-blue-100 text-blue-800 hover:bg-blue-200 pl-2 pr-1 py-1 gap-1"
                        >
                            <span className="font-mono font-bold text-xs">{item.code}</span>
                            <span className="text-xs">{item.name}</span>
                            <button
                                type="button"
                                onClick={() => removeCode(item.code)}
                                className="ml-1 hover:bg-blue-300 rounded-full p-0.5"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}

            {/* Search Input */}
            <div ref={wrapperRef} className="relative">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                        placeholder="Tìm mã ICD-10 hoặc tên bệnh..."
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => query && setIsOpen(true)}
                        className="pl-10"
                    />
                </div>

                {/* Dropdown */}
                {isOpen && results.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                        {results.map(item => {
                            const isSelected = value.find(v => v.code === item.code);
                            return (
                                <button
                                    key={item.code}
                                    type="button"
                                    onClick={() => addCode(item)}
                                    disabled={isSelected}
                                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors
                                        ${isSelected
                                            ? 'bg-slate-50 text-slate-400 cursor-default'
                                            : 'hover:bg-teal-50 cursor-pointer'
                                        }`}
                                >
                                    <span className="font-mono text-sm font-bold text-blue-600 w-14 shrink-0">
                                        {item.code}
                                    </span>
                                    <span className="text-sm text-slate-700 truncate">
                                        {item.name}
                                    </span>
                                    {isSelected && (
                                        <span className="ml-auto text-xs text-slate-400">Đã chọn</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─────────── Vital Signs Input ─────────── */
export function VitalSignsInput({ value = {}, onChange }) {
    const fields = [
        { key: 'bloodPressure', label: 'Huyết áp (mmHg)', placeholder: '120/80', icon: '🫀' },
        { key: 'heartRate', label: 'Nhịp tim (bpm)', placeholder: '72', icon: '💓' },
        { key: 'temperature', label: 'Nhiệt độ (°C)', placeholder: '36.5', icon: '🌡️' },
        { key: 'respiratoryRate', label: 'Nhịp thở (/ph)', placeholder: '16', icon: '🫁' },
        { key: 'spO2', label: 'SpO₂ (%)', placeholder: '98', icon: '🩸' },
        { key: 'weight', label: 'Cân nặng (kg)', placeholder: '65', icon: '⚖️' },
        { key: 'height', label: 'Chiều cao (cm)', placeholder: '170', icon: '📏' },
    ];

    const update = (key, val) => {
        onChange({ ...value, [key]: val });
    };

    return (
        <div className="space-y-3">
            <Label className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-rose-500" />
                Sinh hiệu
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {fields.map(f => (
                    <div key={f.key} className="space-y-1">
                        <label className="text-xs text-slate-500 flex items-center gap-1">
                            <span>{f.icon}</span> {f.label}
                        </label>
                        <Input
                            placeholder={f.placeholder}
                            value={value[f.key] || ''}
                            onChange={(e) => update(f.key, e.target.value)}
                            className="h-9 text-sm"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─────────── Medications Input ─────────── */
export function MedicationsInput({ value = [], onChange }) {
    const addMedication = () => {
        onChange([...value, { name: '', dosage: '', frequency: '', duration: '', note: '' }]);
    };

    const updateMedication = (index, field, val) => {
        const updated = [...value];
        updated[index] = { ...updated[index], [field]: val };
        onChange(updated);
    };

    const removeMedication = (index) => {
        onChange(value.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                    <Pill className="w-4 h-4 text-green-600" />
                    Đơn thuốc
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={addMedication} className="h-7 text-xs gap-1">
                    <Plus className="w-3 h-3" /> Thêm thuốc
                </Button>
            </div>

            {value.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    Chưa có thuốc. Bấm "Thêm thuốc" để bắt đầu.
                </p>
            )}

            {value.map((med, index) => (
                <div key={index} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 relative group">
                    <button
                        type="button"
                        onClick={() => removeMedication(index)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="col-span-2">
                            <label className="text-xs text-slate-500">Tên thuốc *</label>
                            <Input
                                placeholder="VD: Amoxicillin 500mg"
                                value={med.name}
                                onChange={(e) => updateMedication(index, 'name', e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Liều dùng</label>
                            <Input
                                placeholder="1 viên"
                                value={med.dosage}
                                onChange={(e) => updateMedication(index, 'dosage', e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Tần suất</label>
                            <Input
                                placeholder="3 lần/ngày"
                                value={med.frequency}
                                onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-xs text-slate-500">Thời gian</label>
                            <Input
                                placeholder="7 ngày"
                                value={med.duration}
                                onChange={(e) => updateMedication(index, 'duration', e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Ghi chú</label>
                            <Input
                                placeholder="Uống sau ăn"
                                value={med.note}
                                onChange={(e) => updateMedication(index, 'note', e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ─────────── Lab Results Input ─────────── */
export function LabResultsInput({ value = [], onChange }) {
    const addResult = () => {
        onChange([...value, { testName: '', result: '', unit: '', referenceRange: '', status: 'normal' }]);
    };

    const updateResult = (index, field, val) => {
        const updated = [...value];
        updated[index] = { ...updated[index], [field]: val };
        onChange(updated);
    };

    const removeResult = (index) => {
        onChange(value.filter((_, i) => i !== index));
    };

    const STATUS_OPTIONS = [
        { value: 'normal', label: 'Bình thường', color: 'bg-green-100 text-green-700' },
        { value: 'low', label: 'Thấp', color: 'bg-blue-100 text-blue-700' },
        { value: 'high', label: 'Cao', color: 'bg-red-100 text-red-700' },
        { value: 'critical', label: 'Nguy hiểm', color: 'bg-red-200 text-red-900' },
    ];

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                    <FlaskConical className="w-4 h-4 text-purple-600" />
                    Kết quả xét nghiệm
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={addResult} className="h-7 text-xs gap-1">
                    <Plus className="w-3 h-3" /> Thêm XN
                </Button>
            </div>

            {value.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    Chưa có kết quả xét nghiệm.
                </p>
            )}

            {value.map((lab, index) => (
                <div key={index} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 relative group">
                    <button
                        type="button"
                        onClick={() => removeResult(index)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        <div className="col-span-2">
                            <label className="text-xs text-slate-500">Tên xét nghiệm *</label>
                            <Input
                                placeholder="VD: Glucose máu"
                                value={lab.testName}
                                onChange={(e) => updateResult(index, 'testName', e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Kết quả</label>
                            <Input
                                placeholder="5.6"
                                value={lab.result}
                                onChange={(e) => updateResult(index, 'result', e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Đơn vị</label>
                            <Input
                                placeholder="mmol/L"
                                value={lab.unit}
                                onChange={(e) => updateResult(index, 'unit', e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500">Tham chiếu</label>
                            <Input
                                placeholder="3.9-6.1"
                                value={lab.referenceRange}
                                onChange={(e) => updateResult(index, 'referenceRange', e.target.value)}
                                className="h-8 text-sm"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 mb-1 block">Trạng thái</label>
                        <div className="flex gap-2">
                            {STATUS_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => updateResult(index, 'status', opt.value)}
                                    className={`px-2 py-1 rounded text-xs font-medium transition-all border
                                        ${lab.status === opt.value
                                            ? `${opt.color} border-current ring-1 ring-current/30`
                                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
