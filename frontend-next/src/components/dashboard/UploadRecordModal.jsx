"use client";

import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
    Upload, Loader2, CheckCircle, AlertCircle, FileText, Calendar,
    Stethoscope, Pill, FlaskConical, Info, Camera, FileEdit, ArrowLeft,
    Image as ImageIcon, X, ExternalLink, Copy
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

import { recordService, ipfsService, computeCidHash, generateAESKey, exportAESKey, encryptData } from '@/services';

// Record types 
const RECORD_TYPES = [
    { value: 'diagnosis', label: 'Chẩn đoán', icon: Stethoscope },
    { value: 'prescription', label: 'Đơn thuốc', icon: Pill },
    { value: 'lab_result', label: 'Xét nghiệm', icon: FlaskConical },
    { value: 'imaging', label: 'X-ray/CT/MRI', icon: ImageIcon },
    { value: 'checkup', label: 'Khám định kỳ', icon: Calendar },
    { value: 'vaccination', label: 'Tiêm chủng', icon: Pill },
    { value: 'surgery', label: 'Phẫu thuật', icon: Stethoscope },
    { value: 'discharge', label: 'Ra viện', icon: FileText },
    { value: 'other', label: 'Khác', icon: FileText },
];

// Common ICD-10 codes
const COMMON_ICD10_CODES = [
    { code: 'J00-J06', name: 'Viêm đường hô hấp trên' },
    { code: 'I10', name: 'Tăng huyết áp' },
    { code: 'E11', name: 'Tiểu đường type 2' },
    { code: 'K29', name: 'Viêm dạ dày' },
    { code: 'M54', name: 'Đau lưng' },
    { code: 'J18', name: 'Viêm phổi' },
];

const UploadRecordModal = ({ open, onOpenChange, onSuccess }) => {
    const [mode, setMode] = useState(null);
    const [step, setStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});

    // Image preview
    const [imagePreview, setImagePreview] = useState(null);
    const fileInputRef = useRef(null);

    // Image mode data
    const [imageData, setImageData] = useState({
        title: '',
        type: 'other',
        file: null,
        fileName: '',
        notes: '',
    });

    // Text mode data
    const [formData, setFormData] = useState({
        recordTitle: '',
        recordType: '',
        patientName: '',
        patientDob: '',
        patientGender: '',
        patientInsuranceId: '',
        facilityName: '',
        doctorName: '',
        examDate: new Date().toISOString().split('T')[0],
        icd10Code: '',
        icd10Name: '',
        diagnosisVN: '',
        treatment: '',
        notes: '',
    });

    const [uploadResult, setUploadResult] = useState(null);

    // Validation
    const validateImageMode = () => {
        const errors = {};
        if (!imageData.title.trim()) errors.title = 'Vui lòng nhập tiêu đề';
        if (!imageData.file) errors.file = 'Vui lòng chọn ảnh hồ sơ';
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const validateTextMode = () => {
        const errors = {};
        if (!formData.recordTitle.trim()) errors.recordTitle = 'Vui lòng nhập tiêu đề';
        if (!formData.recordType) errors.recordType = 'Vui lòng chọn loại hồ sơ';
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // Handle file selection with preview
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 10 * 1024 * 1024) {
                toast({
                    title: "File quá lớn",
                    description: "Vui lòng chọn file nhỏ hơn 10MB",
                    variant: "destructive",
                });
                return;
            }

            // Create preview URL
            const previewUrl = URL.createObjectURL(file);
            setImagePreview(previewUrl);

            setImageData(prev => ({ ...prev, file, fileName: file.name }));
            setValidationErrors(prev => ({ ...prev, file: null }));
        }
    };

    // Remove selected file
    const removeFile = () => {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
        setImageData(prev => ({ ...prev, file: null, fileName: '' }));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Upload handler
    const handleUpload = async () => {
        if (mode === 'image' && !validateImageMode()) return;
        if (mode === 'text' && !validateTextMode()) return;

        setIsLoading(true);
        setError(null);
        setStep(2);

        try {
            const aesKey = await generateAESKey();
            const aesKeyString = await exportAESKey(aesKey);

            let recordContent;
            let title, type;

            if (mode === 'image') {
                title = imageData.title;
                type = imageData.type;

                // Read image as base64
                const reader = new FileReader();
                const base64Promise = new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(imageData.file);
                });
                const base64 = await base64Promise;

                recordContent = {
                    resourceType: 'DocumentReference',
                    title: imageData.title,
                    type: imageData.type,
                    notes: imageData.notes,
                    attachment: {
                        contentType: imageData.file.type,
                        fileName: imageData.fileName,
                        data: base64
                    },
                    meta: {
                        uploadMode: 'image',
                        createdAt: new Date().toISOString(),
                    }
                };
            } else {
                title = formData.recordTitle;
                type = formData.recordType;

                recordContent = {
                    resourceType: 'Bundle',
                    type: 'document',
                    timestamp: new Date().toISOString(),
                    entry: [
                        formData.patientName && {
                            resource: {
                                resourceType: 'Patient',
                                name: [{ text: formData.patientName }],
                                birthDate: formData.patientDob,
                                gender: formData.patientGender,
                                identifier: formData.patientInsuranceId ? [{
                                    system: 'urn:vn:bhyt',
                                    value: formData.patientInsuranceId
                                }] : []
                            }
                        },
                        {
                            resource: {
                                resourceType: 'Encounter',
                                period: { start: formData.examDate },
                                serviceProvider: { display: formData.facilityName },
                            }
                        },
                        formData.icd10Code && {
                            resource: {
                                resourceType: 'Condition',
                                code: {
                                    coding: [{
                                        system: 'http://hl7.org/fhir/sid/icd-10',
                                        code: formData.icd10Code,
                                        display: formData.icd10Name
                                    }],
                                    text: formData.diagnosisVN
                                }
                            }
                        },
                    ].filter(Boolean),
                    meta: {
                        title: formData.recordTitle,
                        type: formData.recordType,
                        notes: formData.notes,
                        uploadMode: 'text',
                        createdAt: new Date().toISOString(),
                    }
                };
            }

            // Encrypt
            const encryptedData = await encryptData(recordContent, aesKey);

            // Upload to IPFS
            const cid = await ipfsService.upload(encryptedData, { name: title, type });

            // Compute hashes
            const cidHash = computeCidHash(cid);
            const recordTypeHash = computeCidHash(type);

            // Store in backend
            const result = await recordService.createRecord(cidHash, recordTypeHash);

            // Store locally with all needed info for viewing later
            const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
            localRecords[cidHash] = {
                cid,
                aesKey: aesKeyString,
                title,
                type,
                ipfsUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
                createdAt: new Date().toISOString(),
            };
            localStorage.setItem('ehr_local_records', JSON.stringify(localRecords));

            setUploadResult({
                id: result.id,
                cidHash,
                cid,
                title,
                ipfsUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
            });
            setStep(3);

            toast({
                title: "Tải lên thành công!",
                description: "Hồ sơ đã được mã hóa và lưu an toàn.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            if (onSuccess) onSuccess();

        } catch (err) {
            console.error('Upload error:', err);
            setError(err.message || 'Không thể tải lên');
            setStep(1);
            toast({
                title: "Lỗi tải lên",
                description: err.message || 'Vui lòng thử lại.',
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setMode(null);
        setStep(1);
        setImagePreview(null);
        setImageData({ title: '', type: 'other', file: null, fileName: '', notes: '' });
        setFormData({
            recordTitle: '', recordType: '', patientName: '', patientDob: '',
            patientGender: '', patientInsuranceId: '', facilityName: '', doctorName: '',
            examDate: new Date().toISOString().split('T')[0], icd10Code: '', icd10Name: '',
            diagnosisVN: '', treatment: '', notes: '',
        });
        setUploadResult(null);
        setError(null);
        setValidationErrors({});
        onOpenChange(false);
    };

    const goBack = () => {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setMode(null);
        setImagePreview(null);
        setValidationErrors({});
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast({ title: "Đã sao chép!", description: text.slice(0, 30) + "..." });
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white">
                <DialogDescription className="sr-only">Upload medical record form</DialogDescription>

                {/* Mode Selection */}
                {mode === null && step === 1 && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-2xl text-center text-slate-900">
                                Thêm Hồ sơ Y tế
                            </DialogTitle>
                            <p className="text-center text-slate-600 mt-2">
                                Chọn cách bạn muốn thêm hồ sơ
                            </p>
                        </DialogHeader>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-8">
                            <button
                                onClick={() => setMode('image')}
                                className="group p-8 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left bg-white"
                            >
                                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                                    <Camera className="w-8 h-8 text-blue-600" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">
                                    📷 Tải ảnh hồ sơ
                                </h3>
                                <p className="text-slate-600 text-sm">
                                    Đơn giản, nhanh chóng. Chỉ cần chụp ảnh hoặc scan hồ sơ.
                                </p>
                            </button>

                            <button
                                onClick={() => setMode('text')}
                                className="group p-8 rounded-2xl border-2 border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left bg-white"
                            >
                                <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-teal-200 transition-colors">
                                    <FileEdit className="w-8 h-8 text-teal-600" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">
                                    ✍️ Nhập thông tin
                                </h3>
                                <p className="text-slate-600 text-sm">
                                    Nhập chi tiết bệnh án theo chuẩn y tế ICD-10.
                                </p>
                            </button>
                        </div>
                    </>
                )}

                {/* Image Upload Mode */}
                {mode === 'image' && step === 1 && (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-2">
                                <button onClick={goBack} className="p-2 hover:bg-slate-100 rounded-lg">
                                    <ArrowLeft className="w-5 h-5 text-slate-700" />
                                </button>
                                <DialogTitle className="flex items-center gap-2 text-slate-900">
                                    <Camera className="w-6 h-6 text-blue-600" />
                                    Tải ảnh hồ sơ
                                </DialogTitle>
                            </div>
                        </DialogHeader>

                        <div className="space-y-6 py-4">
                            {/* Title Input */}
                            <div className="space-y-2">
                                <Label htmlFor="img-title" className="text-slate-800 font-medium">
                                    Tên hồ sơ <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="img-title"
                                    placeholder="VD: Đơn thuốc tháng 12"
                                    value={imageData.title}
                                    onChange={(e) => {
                                        setImageData(prev => ({ ...prev, title: e.target.value }));
                                        setValidationErrors(prev => ({ ...prev, title: null }));
                                    }}
                                    onFocus={(e) => e.target.placeholder = ''}
                                    onBlur={(e) => e.target.placeholder = 'VD: Đơn thuốc tháng 12'}
                                    className={`bg-white text-slate-900 ${validationErrors.title ? 'border-red-500' : 'border-slate-300'}`}
                                />
                                {validationErrors.title && (
                                    <p className="text-red-500 text-sm flex items-center gap-1">
                                        <AlertCircle className="w-4 h-4" />
                                        {validationErrors.title}
                                    </p>
                                )}
                            </div>

                            {/* Image Upload with Preview */}
                            <div className="space-y-2">
                                <Label className="text-slate-800 font-medium">
                                    Ảnh hồ sơ <span className="text-red-500">*</span>
                                </Label>

                                {imagePreview ? (
                                    // Show preview
                                    <div className="relative border-2 border-green-400 rounded-xl p-4 bg-green-50">
                                        <button
                                            onClick={removeFile}
                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 z-10"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                        <div className="flex items-center gap-4">
                                            <img
                                                src={imagePreview}
                                                alt="Preview"
                                                className="w-24 h-24 object-cover rounded-lg border border-slate-200"
                                            />
                                            <div>
                                                <p className="font-medium text-green-700 flex items-center gap-2">
                                                    <CheckCircle className="w-5 h-5" />
                                                    Đã chọn ảnh
                                                </p>
                                                <p className="text-sm text-slate-600 mt-1 truncate max-w-[200px]">
                                                    {imageData.fileName}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    // Upload zone
                                    <label
                                        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors bg-white ${validationErrors.file
                                                ? 'border-red-400 bg-red-50'
                                                : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50/50'
                                            }`}
                                    >
                                        <Camera className="w-12 h-12 text-slate-400 mb-3" />
                                        <p className="text-slate-700 font-medium">Nhấn để chọn ảnh</p>
                                        <p className="text-sm text-slate-500 mt-1">JPG, PNG (tối đa 10MB)</p>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />
                                    </label>
                                )}
                                {validationErrors.file && (
                                    <p className="text-red-500 text-sm flex items-center gap-1">
                                        <AlertCircle className="w-4 h-4" />
                                        {validationErrors.file}
                                    </p>
                                )}
                            </div>

                            {/* Record Type */}
                            <div className="space-y-2">
                                <Label className="text-slate-800">Loại hồ sơ (tùy chọn)</Label>
                                <Select
                                    value={imageData.type}
                                    onValueChange={(value) => setImageData(prev => ({ ...prev, type: value }))}
                                >
                                    <SelectTrigger className="bg-white text-slate-900 border-slate-300">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {RECORD_TYPES.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                                {type.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Notes */}
                            <div className="space-y-2">
                                <Label className="text-slate-800">Ghi chú (tùy chọn)</Label>
                                <Textarea
                                    placeholder="Thông tin thêm..."
                                    value={imageData.notes}
                                    onChange={(e) => setImageData(prev => ({ ...prev, notes: e.target.value }))}
                                    onFocus={(e) => e.target.placeholder = ''}
                                    onBlur={(e) => e.target.placeholder = 'Thông tin thêm...'}
                                    rows={2}
                                    className="bg-white text-slate-900 border-slate-300"
                                />
                            </div>

                            {/* Info */}
                            <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-800 border border-blue-200">
                                <Info className="w-4 h-4 inline mr-2" />
                                Ảnh sẽ được mã hóa AES-256 trước khi lưu trữ. Chỉ bạn mới có thể xem.
                            </div>

                            <DialogFooter className="gap-2">
                                <Button variant="outline" onClick={handleClose} className="border-slate-300">
                                    Hủy
                                </Button>
                                <Button
                                    onClick={handleUpload}
                                    disabled={isLoading}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Tải lên
                                </Button>
                            </DialogFooter>
                        </div>
                    </>
                )}

                {/* Text Form Mode */}
                {mode === 'text' && step === 1 && (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-2">
                                <button onClick={goBack} className="p-2 hover:bg-slate-100 rounded-lg">
                                    <ArrowLeft className="w-5 h-5 text-slate-700" />
                                </button>
                                <DialogTitle className="flex items-center gap-2 text-slate-900">
                                    <FileEdit className="w-6 h-6 text-teal-600" />
                                    Nhập thông tin bệnh án
                                </DialogTitle>
                            </div>
                            <p className="text-sm text-slate-600 ml-9">
                                Các mục có dấu <span className="text-red-500">*</span> là bắt buộc
                            </p>
                        </DialogHeader>

                        <div className="space-y-5 py-4">
                            {/* Required Fields */}
                            <div className="space-y-4 p-4 bg-orange-50 rounded-xl border border-orange-200">
                                <h3 className="font-semibold text-orange-800 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    Thông tin bắt buộc
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-slate-800">
                                            Tiêu đề <span className="text-red-500">*</span>
                                        </Label>
                                        <Input
                                            placeholder="VD: Khám nội khoa"
                                            value={formData.recordTitle}
                                            onChange={(e) => {
                                                setFormData(prev => ({ ...prev, recordTitle: e.target.value }));
                                                setValidationErrors(prev => ({ ...prev, recordTitle: null }));
                                            }}
                                            onFocus={(e) => e.target.placeholder = ''}
                                            onBlur={(e) => e.target.placeholder = 'VD: Khám nội khoa'}
                                            className={`bg-white ${validationErrors.recordTitle ? 'border-red-500' : ''}`}
                                        />
                                        {validationErrors.recordTitle && (
                                            <p className="text-red-500 text-xs">{validationErrors.recordTitle}</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-slate-800">
                                            Loại hồ sơ <span className="text-red-500">*</span>
                                        </Label>
                                        <Select
                                            value={formData.recordType}
                                            onValueChange={(value) => {
                                                setFormData(prev => ({ ...prev, recordType: value }));
                                                setValidationErrors(prev => ({ ...prev, recordType: null }));
                                            }}
                                        >
                                            <SelectTrigger className={`bg-white ${validationErrors.recordType ? 'border-red-500' : ''}`}>
                                                <SelectValue placeholder="Chọn loại..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {RECORD_TYPES.map((type) => (
                                                    <SelectItem key={type.value} value={type.value}>
                                                        {type.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {validationErrors.recordType && (
                                            <p className="text-red-500 text-xs">{validationErrors.recordType}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Patient Info */}
                            <div className="space-y-4 p-4 bg-slate-50 rounded-xl">
                                <h3 className="font-semibold text-slate-700">Thông tin bệnh nhân (tùy chọn)</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <Input
                                        placeholder="Họ và tên"
                                        value={formData.patientName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, patientName: e.target.value }))}
                                        onFocus={(e) => e.target.placeholder = ''}
                                        onBlur={(e) => e.target.placeholder = 'Họ và tên'}
                                        className="bg-white"
                                    />
                                    <Input
                                        type="date"
                                        value={formData.patientDob}
                                        onChange={(e) => setFormData(prev => ({ ...prev, patientDob: e.target.value }))}
                                        className="bg-white"
                                    />
                                    <Select
                                        value={formData.patientGender}
                                        onValueChange={(value) => setFormData(prev => ({ ...prev, patientGender: value }))}
                                    >
                                        <SelectTrigger className="bg-white">
                                            <SelectValue placeholder="Giới tính" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="male">Nam</SelectItem>
                                            <SelectItem value="female">Nữ</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        placeholder="Số BHYT"
                                        value={formData.patientInsuranceId}
                                        onChange={(e) => setFormData(prev => ({ ...prev, patientInsuranceId: e.target.value }))}
                                        onFocus={(e) => e.target.placeholder = ''}
                                        onBlur={(e) => e.target.placeholder = 'Số BHYT'}
                                        className="bg-white"
                                    />
                                </div>
                            </div>

                            {/* Facility Info */}
                            <div className="space-y-4 p-4 bg-teal-50 rounded-xl">
                                <h3 className="font-semibold text-slate-700">Cơ sở y tế (tùy chọn)</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <Input
                                        placeholder="Tên bệnh viện"
                                        value={formData.facilityName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, facilityName: e.target.value }))}
                                        onFocus={(e) => e.target.placeholder = ''}
                                        onBlur={(e) => e.target.placeholder = 'Tên bệnh viện'}
                                        className="bg-white"
                                    />
                                    <Input
                                        placeholder="Bác sĩ khám"
                                        value={formData.doctorName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, doctorName: e.target.value }))}
                                        onFocus={(e) => e.target.placeholder = ''}
                                        onBlur={(e) => e.target.placeholder = 'Bác sĩ khám'}
                                        className="bg-white"
                                    />
                                    <Input
                                        type="date"
                                        value={formData.examDate}
                                        onChange={(e) => setFormData(prev => ({ ...prev, examDate: e.target.value }))}
                                        className="bg-white"
                                    />
                                </div>
                            </div>

                            {/* ICD-10 */}
                            <div className="space-y-4 p-4 bg-purple-50 rounded-xl">
                                <h3 className="font-semibold text-slate-700">Chẩn đoán ICD-10 (tùy chọn)</h3>
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {COMMON_ICD10_CODES.map((icd) => (
                                        <button
                                            key={icd.code}
                                            type="button"
                                            onClick={() => setFormData(prev => ({
                                                ...prev,
                                                icd10Code: icd.code,
                                                icd10Name: icd.name
                                            }))}
                                            className={`px-3 py-1.5 text-xs rounded-full border transition-all ${formData.icd10Code === icd.code
                                                    ? 'bg-purple-500 text-white border-purple-500'
                                                    : 'bg-white text-slate-700 border-slate-300 hover:border-purple-400'
                                                }`}
                                        >
                                            {icd.code}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <Input
                                        placeholder="Mã ICD-10"
                                        value={formData.icd10Code}
                                        onChange={(e) => setFormData(prev => ({ ...prev, icd10Code: e.target.value }))}
                                        onFocus={(e) => e.target.placeholder = ''}
                                        onBlur={(e) => e.target.placeholder = 'Mã ICD-10'}
                                        className="bg-white"
                                    />
                                    <Input
                                        placeholder="Tên bệnh"
                                        value={formData.icd10Name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, icd10Name: e.target.value }))}
                                        onFocus={(e) => e.target.placeholder = ''}
                                        onBlur={(e) => e.target.placeholder = 'Tên bệnh'}
                                        className="bg-white"
                                    />
                                </div>
                                <Textarea
                                    placeholder="Mô tả chẩn đoán..."
                                    value={formData.diagnosisVN}
                                    onChange={(e) => setFormData(prev => ({ ...prev, diagnosisVN: e.target.value }))}
                                    onFocus={(e) => e.target.placeholder = ''}
                                    onBlur={(e) => e.target.placeholder = 'Mô tả chẩn đoán...'}
                                    rows={2}
                                    className="bg-white"
                                />
                            </div>

                            {/* Treatment & Notes */}
                            <div className="space-y-3">
                                <Textarea
                                    placeholder="Phương pháp điều trị (tùy chọn)"
                                    value={formData.treatment}
                                    onChange={(e) => setFormData(prev => ({ ...prev, treatment: e.target.value }))}
                                    onFocus={(e) => e.target.placeholder = ''}
                                    onBlur={(e) => e.target.placeholder = 'Phương pháp điều trị (tùy chọn)'}
                                    rows={2}
                                    className="bg-white"
                                />
                                <Textarea
                                    placeholder="Ghi chú thêm (tùy chọn)"
                                    value={formData.notes}
                                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                    onFocus={(e) => e.target.placeholder = ''}
                                    onBlur={(e) => e.target.placeholder = 'Ghi chú thêm (tùy chọn)'}
                                    rows={2}
                                    className="bg-white"
                                />
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}

                            <DialogFooter className="gap-2">
                                <Button variant="outline" onClick={handleClose} className="border-slate-300">
                                    Hủy
                                </Button>
                                <Button
                                    onClick={handleUpload}
                                    disabled={isLoading}
                                    className="bg-gradient-to-r from-teal-600 to-blue-600 text-white"
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Mã hóa & Tải lên
                                </Button>
                            </DialogFooter>
                        </div>
                    </>
                )}

                {/* Loading */}
                {step === 2 && (
                    <div className="py-16 flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                        <p className="text-slate-700 font-medium">Đang mã hóa và tải lên...</p>
                        <div className="text-sm text-slate-600 text-center space-y-1">
                            <p>🔐 Mã hóa AES-256-GCM</p>
                            <p>📤 Upload lên IPFS</p>
                            <p>⛓️ Lưu metadata</p>
                        </div>
                    </div>
                )}

                {/* Success - Show CID for patient to view later */}
                {step === 3 && uploadResult && (
                    <div className="py-8 flex flex-col items-center justify-center space-y-6">
                        <CheckCircle className="w-20 h-20 text-green-500" />
                        <p className="text-2xl font-semibold text-slate-900">Tải lên thành công!</p>

                        <div className="w-full bg-green-50 p-5 rounded-xl border border-green-200 space-y-3">
                            <p className="text-slate-800">
                                <strong>Tiêu đề:</strong> {uploadResult.title}
                            </p>
                            <div className="flex items-center gap-2">
                                <p className="font-mono text-xs text-slate-600 flex-1 truncate">
                                    <strong>CID:</strong> {uploadResult.cid}
                                </p>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(uploadResult.cid)}
                                    className="shrink-0"
                                >
                                    <Copy className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="bg-yellow-50 p-4 rounded-xl w-full border border-yellow-200">
                            <p className="text-sm text-yellow-800">
                                <Info className="w-4 h-4 inline mr-2" />
                                <strong>Lưu ý:</strong> Hồ sơ đã được mã hóa và lưu trữ an toàn.
                                Bạn có thể xem lại trong mục "Hồ sơ của tôi".
                                Key giải mã được lưu trên thiết bị của bạn.
                            </p>
                        </div>

                        <Button onClick={handleClose} className="mt-4 bg-green-600 hover:bg-green-700 text-white px-8">
                            Hoàn tất
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default UploadRecordModal;
