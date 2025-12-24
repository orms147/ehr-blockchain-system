"use client";

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    CheckCircle2, Calendar, User, Lock, Unlock, Loader2,
    FileText, Copy, ExternalLink, AlertCircle, Image as ImageIcon,
    Download, RefreshCw
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ipfsService, importAESKey, decryptData, keyShareService } from '@/services';
import { getOrCreateEncryptionKeypair, decryptFromSender } from '@/services/nacl-crypto';
import AccessManagementTab from './AccessManagementTab';
import { useWalletAddress } from '@/hooks/useWalletAddress';

const RecordModal = ({ record, open, onOpenChange, onUpdate }) => {
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decryptedData, setDecryptedData] = useState(null);
    const [decryptError, setDecryptError] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [activeTab, setActiveTab] = useState('content');
    const { address: walletAddress, provider, loading: walletLoading } = useWalletAddress();

    // Debug wallet address
    console.log('RecordModal - walletAddress:', walletAddress, 'loading:', walletLoading);

    // Copy to clipboard function
    const copyToClipboard = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            toast({
                title: "Đã sao chép!",
                description: "CID Hash đã được sao chép vào clipboard.",
                className: "bg-green-50 border-green-200 text-green-800",
            });
        } catch (err) {
            toast({
                title: "Lỗi sao chép",
                description: "Không thể sao chép vào clipboard.",
                variant: "destructive",
            });
        }
    };

    // Reset state when modal opens/closes
    useEffect(() => {
        if (!open) {
            setDecryptedData(null);
            setDecryptError(null);
            setActiveTab('content');
        }
    }, [open]);

    if (!record) return null;


    // Get local record data (CID + AES key)
    const getLocalRecordData = () => {
        try {
            const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
            return localRecords[record.cidHash] || null;
        } catch {
            return null;
        }
    };

    // Decrypt and view record
    const handleDecrypt = async () => {
        setIsDecrypting(true);
        setDecryptError(null);

        try {
            let cid, aesKeyString;

            // 1. Try to get from local storage first (for records created on this device)
            const localData = getLocalRecordData();

            if (localData) {
                cid = localData.cid;
                aesKeyString = localData.aesKey;
                console.log('📦 Using local key for decryption');
            } else {
                // 2. Fetch shared key from backend (for records shared by others)
                console.log('🔑 Fetching shared key from backend...');

                if (!provider || !walletAddress) {
                    throw new Error('Chưa kết nối ví. Vui lòng đăng nhập lại.');
                }

                // Get shared key from backend
                const sharedKey = await keyShareService.getKeyForRecord(record.cidHash);

                if (!sharedKey) {
                    throw new Error('Không tìm thấy key giải mã. Bạn có thể chưa được chia sẻ key cho hồ sơ này.');
                }

                // Decrypt the shared key using NaCl
                const myKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

                // Decrypt the encrypted payload using sender's public key
                const decryptedPayload = decryptFromSender(
                    sharedKey.encryptedPayload,
                    sharedKey.senderPublicKey,
                    myKeypair.secretKey
                );

                // Parse the payload to get CID and AES key
                const keyData = JSON.parse(decryptedPayload);
                cid = keyData.cid;
                aesKeyString = keyData.aesKey;

                console.log('✅ Shared key decrypted successfully');
            }

            // 3. Download encrypted data from IPFS
            const encryptedContent = await ipfsService.download(cid);

            // 4. Import AES key
            const aesKey = await importAESKey(aesKeyString);

            // 5. Decrypt data
            const decrypted = await decryptData(encryptedContent, aesKey);

            setDecryptedData(decrypted);

            // 6. Save key to localStorage so Patient can re-share this record later
            if (!localData && cid && aesKeyString) {
                try {
                    const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
                    if (!localRecords[record.cidHash]) {
                        localRecords[record.cidHash] = {
                            cid,
                            aesKey: aesKeyString,
                            title: decrypted?.meta?.title || record.title || 'Hồ sơ được chia sẻ',
                            createdAt: record.createdAt || new Date().toISOString(),
                            fromDoctor: true, // Mark as received from Doctor
                        };
                        localStorage.setItem('ehr_local_records', JSON.stringify(localRecords));
                        console.log('💾 Saved shared key to localStorage for re-sharing');
                    }
                } catch (e) {
                    console.error('Error saving shared key to localStorage:', e);
                }
            }

            toast({
                title: "Giải mã thành công!",
                description: "Hồ sơ đã được giải mã.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

        } catch (err) {
            console.error('Decrypt error:', err);
            setDecryptError(err.message || 'Không thể giải mã hồ sơ');
            toast({
                title: "Lỗi giải mã",
                description: err.message || 'Vui lòng thử lại.',
                variant: "destructive",
            });
        } finally {
            setIsDecrypting(false);
        }
    };

    // Download decrypted file
    const handleDownload = async () => {
        if (!decryptedData) {
            toast({
                title: "Lỗi",
                description: "Vui lòng giải mã hồ sơ trước khi tải về.",
                variant: "destructive",
            });
            return;
        }

        setIsDownloading(true);
        try {
            // Check if there's an attachment to download
            if (decryptedData.attachment?.data) {
                // Create blob from base64 data
                const byteString = atob(decryptedData.attachment.data);
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) {
                    ia[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([ab], { type: decryptedData.attachment.contentType || 'application/octet-stream' });

                // Create download link
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = decryptedData.attachment.fileName || 'record_file';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } else {
                // Download as JSON
                const blob = new Blob([JSON.stringify(decryptedData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `record_${record.cidHash.slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            toast({
                title: "Tải xuống thành công!",
                description: "File đã được tải về máy.",
                className: "bg-green-50 border-green-200 text-green-800",
            });
        } catch (err) {
            console.error('Download error:', err);
            toast({
                title: "Lỗi tải xuống",
                description: err.message || "Không thể tải file.",
                variant: "destructive",
            });
        } finally {
            setIsDownloading(false);
        }
    };

    // Handle Update - trigger callback to parent
    const handleUpdate = () => {
        if (onUpdate) {
            onUpdate(record);
        }
        onOpenChange(false);
    };

    const localData = getLocalRecordData();


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto bg-white">
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
                        Ngày tạo: {record.date}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="content">📄 Nội dung</TabsTrigger>
                        <TabsTrigger value="access">🔐 Quyền truy cập</TabsTrigger>
                    </TabsList>

                    <TabsContent value="content" className="mt-0">
                        <div className="grid gap-4 py-4">
                            {/* Basic Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                                    <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                                        <Calendar className="w-4 h-4" /> Ngày
                                    </div>
                                    <div className="font-medium text-slate-900">{record.date}</div>
                                </div>
                                <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
                                    <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                                        <User className="w-4 h-4" /> Tạo bởi
                                    </div>
                                    <div className="font-medium text-slate-900 font-mono text-xs">
                                        {record.doctor || record.ownerAddress?.slice(0, 10) + '...'}
                                    </div>
                                </div>
                            </div>

                            {/* CID Hash Info */}
                            <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 text-sm text-blue-600 mb-1">
                                            <Lock className="w-4 h-4" /> CID Hash (Encrypted)
                                        </div>
                                        <div className="font-mono text-xs text-slate-700 break-all">
                                            {record.cidHash || record.cid}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => copyToClipboard(record.cidHash || record.cid)}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Decryption Status & Actions */}
                            {!decryptedData && !decryptError && (
                                <div className="p-6 rounded-lg bg-amber-50 border border-amber-200 text-center">
                                    <Lock className="w-8 h-8 mx-auto text-amber-600 mb-3" />
                                    <p className="text-amber-800 font-medium mb-4">
                                        Nội dung hồ sơ được mã hóa
                                    </p>
                                    <Button
                                        onClick={handleDecrypt}
                                        disabled={isDecrypting}
                                        className="bg-amber-600 hover:bg-amber-700"
                                    >
                                        {isDecrypting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Đang giải mã...
                                            </>
                                        ) : (
                                            <>
                                                <Unlock className="w-4 h-4 mr-2" />
                                                Giải mã nội dung
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}

                            {/* Decrypt Error */}
                            {decryptError && (
                                <div className="p-6 rounded-lg bg-red-50 border border-red-200">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-medium text-red-800 mb-1">
                                                Không tìm thấy key giải mã trên thiết bị này.
                                            </p>
                                            <p className="text-sm text-red-600">
                                                Hồ sơ có thể được tạo từ thiết bị khác hoặc key đã bị xóa.
                                            </p>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleDecrypt}
                                                className="mt-3"
                                            >
                                                <RefreshCw className="w-4 h-4 mr-2" />
                                                Thử lại
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            {decryptedData && (
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={handleDownload}
                                        disabled={isDownloading}
                                    >
                                        {isDownloading ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4 mr-2" />
                                        )}
                                        Tải xuống
                                    </Button>
                                    {onUpdate && (
                                        <Button variant="outline" onClick={handleUpdate}>
                                            <RefreshCw className="w-4 h-4 mr-2" />
                                            Cập nhật
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* Decrypted Content */}
                            {decryptedData && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-green-700">
                                        <Unlock className="w-5 h-5" />
                                        <span className="font-medium">Nội dung đã giải mã</span>
                                    </div>

                                    {/* Image Display - check both imageData and attachment */}
                                    {(decryptedData.imageData || (decryptedData.attachment?.data && decryptedData.attachment?.contentType?.startsWith('image/'))) && (
                                        <div className="p-4 rounded-lg border border-slate-200">
                                            <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                                <ImageIcon className="w-4 h-4" />
                                                Hình ảnh đính kèm
                                            </h4>
                                            <img
                                                src={decryptedData.imageData || `data:${decryptedData.attachment.contentType};base64,${decryptedData.attachment.data}`}
                                                alt="Đính kèm"
                                                className="max-w-full h-auto rounded-lg border"
                                                style={{ maxHeight: '300px', objectFit: 'contain' }}
                                            />
                                        </div>
                                    )}

                                    {/* Meta Info */}
                                    <div className="p-4 rounded-lg border border-slate-200">
                                        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            Thông tin hồ sơ
                                        </h4>
                                        <div className="space-y-2 text-sm">
                                            {decryptedData.meta?.title && (
                                                <p><strong>Tiêu đề:</strong> {decryptedData.meta.title}</p>
                                            )}
                                            {decryptedData.meta?.type && (
                                                <p><strong>Loại:</strong> {decryptedData.meta.type}</p>
                                            )}
                                            {decryptedData.meta?.createdAt && (
                                                <p><strong>Ngày tạo:</strong> {new Date(decryptedData.meta.createdAt).toLocaleString('vi-VN')}</p>
                                            )}
                                            {decryptedData.notes && (
                                                <p><strong>Ghi chú:</strong> {decryptedData.notes}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* FHIR Data (if text mode) */}
                                    {decryptedData.entry && decryptedData.entry.length > 0 && (
                                        <div className="p-4 rounded-lg border border-slate-200">
                                            <h4 className="text-sm font-semibold text-slate-900 mb-3">
                                                Dữ liệu Y tế (FHIR)
                                            </h4>
                                            <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-x-auto">
                                                {JSON.stringify(decryptedData.entry, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="access" className="mt-0">
                        <AccessManagementTab
                            record={record}
                            currentUserAddress={walletAddress}
                        />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};

export default RecordModal;
