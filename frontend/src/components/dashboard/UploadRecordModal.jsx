import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

import { recordService, ipfsService, computeCidHash, generateAESKey, exportAESKey, encryptData } from '@/services';

const RECORD_TYPES = [
    { value: 'diagnosis', label: 'Diagnosis' },
    { value: 'prescription', label: 'Prescription' },
    { value: 'lab_result', label: 'Lab Result' },
    { value: 'imaging', label: 'X-Ray / MRI / CT' },
    { value: 'checkup', label: 'Checkup' },
    { value: 'vaccination', label: 'Vaccination' },
    { value: 'surgery', label: 'Surgery Report' },
    { value: 'other', label: 'Other' },
];

const UploadRecordModal = ({ open, onOpenChange, onSuccess }) => {
    const [step, setStep] = useState(1); // 1: Form, 2: Uploading, 3: Success
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [formData, setFormData] = useState({
        title: '',
        type: '',
        description: '',
        file: null,
        fileName: '',
    });

    const [uploadResult, setUploadResult] = useState(null);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setFormData({
                ...formData,
                file,
                fileName: file.name,
            });
        }
    };

    const handleUpload = async () => {
        setIsLoading(true);
        setError(null);
        setStep(2);

        try {
            // Step 1: Generate AES key
            const aesKey = await generateAESKey();
            const aesKeyString = await exportAESKey(aesKey);

            // Step 2: Prepare record data
            const recordData = {
                title: formData.title,
                type: formData.type,
                description: formData.description,
                fileName: formData.fileName,
                createdAt: new Date().toISOString(),
            };

            // If file exists, read and include it
            if (formData.file) {
                const fileContent = await formData.file.text();
                recordData.fileContent = fileContent;
            }

            // Step 3: Encrypt data
            const encryptedData = await encryptData(recordData, aesKey);

            // Step 4: Upload to IPFS
            const cid = await ipfsService.upload(encryptedData, {
                name: formData.title,
                type: formData.type,
            });

            // Step 5: Compute cidHash
            const cidHash = computeCidHash(cid);
            const recordTypeHash = computeCidHash(formData.type);

            // Step 6: Store metadata in backend
            const result = await recordService.createRecord(cidHash, recordTypeHash);

            // Step 7: Store CID and key locally (IndexedDB would be better)
            const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
            localRecords[cidHash] = {
                cid,
                aesKey: aesKeyString,
                title: formData.title,
                type: formData.type,
                createdAt: new Date().toISOString(),
            };
            localStorage.setItem('ehr_local_records', JSON.stringify(localRecords));

            setUploadResult({
                id: result.id,
                cidHash,
                cid,
                title: formData.title,
            });

            setStep(3);

            toast({
                title: "Record Uploaded Successfully",
                description: "Your medical record has been encrypted and stored securely.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            if (onSuccess) onSuccess();

        } catch (err) {
            console.error('Upload error:', err);
            setError(err.message || 'Failed to upload record');
            setStep(1);

            toast({
                title: "Upload Failed",
                description: err.message || 'An error occurred while uploading.',
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setStep(1);
        setFormData({ title: '', type: '', description: '', file: null, fileName: '' });
        setUploadResult(null);
        setError(null);
        onOpenChange(false);
    };

    const isFormValid = formData.title && formData.type;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="w-5 h-5 text-blue-600" />
                        Upload Medical Record
                    </DialogTitle>
                </DialogHeader>

                {step === 1 && (
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="title">Record Title *</Label>
                            <Input
                                id="title"
                                placeholder="e.g., Blood Test Results"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="type">Record Type *</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(value) => setFormData({ ...formData, type: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type..." />
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

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Additional notes about this record..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={3}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="file">Attach File (Optional)</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="file"
                                    type="file"
                                    onChange={handleFileChange}
                                    className="flex-1"
                                />
                            </div>
                            {formData.fileName && (
                                <p className="text-sm text-slate-500">Selected: {formData.fileName}</p>
                            )}
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        <DialogFooter className="pt-4">
                            <Button variant="outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleUpload}
                                disabled={!isFormValid || isLoading}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                Encrypt & Upload
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 2 && (
                    <div className="py-12 flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                        <p className="text-slate-600 font-medium">Encrypting and uploading...</p>
                        <p className="text-sm text-slate-500">This may take a few moments</p>
                    </div>
                )}

                {step === 3 && uploadResult && (
                    <div className="py-8 flex flex-col items-center justify-center space-y-4">
                        <CheckCircle className="w-16 h-16 text-green-500" />
                        <p className="text-lg font-semibold text-slate-900">Upload Successful!</p>
                        <div className="text-center text-sm text-slate-600 space-y-1">
                            <p><strong>Title:</strong> {uploadResult.title}</p>
                            <p className="font-mono text-xs break-all">
                                <strong>CID Hash:</strong> {uploadResult.cidHash.slice(0, 20)}...
                            </p>
                        </div>
                        <Button onClick={handleClose} className="mt-4">
                            Done
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default UploadRecordModal;
