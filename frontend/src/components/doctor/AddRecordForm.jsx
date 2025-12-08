"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilePlus, UploadCloud, X, Search } from 'lucide-react';

import { createFHIRBundle, createFHIRCondition, createFHIRDiagnosticReport, createFHIRImagingStudy } from '@/lib/fhir-utils';

const AddRecordForm = ({ onSubmit }) => {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        address: '',
        type: '',
        diagnosis: '',
        icdCode: ''
    });

    const handleFileDrop = (e) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) setFile(droppedFile);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        // 1. Convert to FHIR Standard
        let resource;
        if (formData.type === 'X-Ray') {
            resource = createFHIRImagingStudy(formData.address, formData.diagnosis, file);
        } else if (['Lab Result', 'Prescription'].includes(formData.type)) {
            resource = createFHIRDiagnosticReport(formData.address, formData.diagnosis, formData.type, file);
        } else {
            resource = createFHIRCondition(formData.address, formData.diagnosis, formData.icdCode);
        }

        const fhirBundle = createFHIRBundle([resource]);

        // Demo Verification
        console.log("🏥 Generated HL7 FHIR Bundle:", JSON.stringify(fhirBundle, null, 2));

        await new Promise(resolve => setTimeout(resolve, 1500));

        // Pass the standardized data (or original if backend isn't ready, but here we simulate standard)
        onSubmit({
            ...formData,
            file,
            fhirData: fhirBundle // Pass this to parent
        });

        setLoading(false);
        setFormData({ address: '', type: '', diagnosis: '', icdCode: '' });
        setFile(null);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
        >
            <Card className="max-w-2xl mx-auto border-slate-200 shadow-md">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                    <CardTitle className="flex items-center gap-2 text-xl text-slate-900">
                        <FilePlus className="w-5 h-5 text-blue-600" />
                        Tạo Hồ sơ Bệnh án Mới
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="record-address">Địa chỉ Bệnh nhân</Label>
                                <Input
                                    id="record-address"
                                    placeholder="0x..."
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    required
                                    className="font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="record-type">Loại Hồ sơ</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(val) => setFormData({ ...formData, type: val })}
                                    required
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Chọn loại hồ sơ" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Diagnosis">Chẩn đoán</SelectItem>
                                        <SelectItem value="Prescription">Đơn thuốc</SelectItem>
                                        <SelectItem value="Lab Result">Kết quả xét nghiệm</SelectItem>
                                        <SelectItem value="X-Ray">X-Ray / Chẩn đoán hình ảnh</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="diagnosis">Chẩn đoán & Ghi chú Lâm sàng</Label>
                            <Textarea
                                id="diagnosis"
                                placeholder="Nhập chẩn đoán chi tiết, quan sát và phác đồ điều trị..."
                                className="min-h-[150px] resize-none"
                                value={formData.diagnosis}
                                onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="icd-code" className="flex items-center gap-2">
                                Mã ICD-10
                                <span className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full uppercase">
                                    Tiêu chuẩn
                                </span>
                            </Label>
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    <Search className="w-4 h-4" />
                                </div>
                                <Input
                                    id="icd-code"
                                    placeholder="Tìm mã (ví dụ: A01.0)"
                                    value={formData.icdCode}
                                    onChange={(e) => setFormData({ ...formData, icdCode: e.target.value })}
                                    className="pl-10 font-mono bg-slate-50 border-slate-200 focus:border-blue-500 transition-colors"
                                />
                            </div>
                            <p className="text-xs text-slate-500">
                                Hỗ trợ Phân loại Quốc tế về Bệnh tật (Bản sửa đổi lần thứ 10)
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Tài liệu đính kèm</Label>
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleFileDrop}
                                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${file ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                                    }`}
                            >
                                {file ? (
                                    <div className="flex items-center justify-center gap-2 text-blue-700">
                                        <span className="font-medium">{file.name}</span>
                                        <button
                                            type="button"
                                            onClick={() => setFile(null)}
                                            className="p-1 hover:bg-blue-200 rounded-full transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-slate-500">
                                        <UploadCloud className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                                        <p className="text-sm font-medium">Kéo và thả tệp vào đây</p>
                                        <p className="text-xs mt-1">hoặc nhấp để chọn (PDF, JPG, PNG)</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="pt-2">
                            <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                                disabled={loading}
                            >
                                {loading ? 'Đang mã hóa & Tải lên...' : 'Tạo Hồ sơ Bảo mật'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default AddRecordForm;
