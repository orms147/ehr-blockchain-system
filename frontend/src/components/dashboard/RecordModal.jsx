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
    Download, RefreshCw, Edit, History, Eye
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ipfsService, importAESKey, decryptData, keyShareService, recordService } from '@/services';
import { getOrCreateEncryptionKeypair, decryptFromSender } from '@/services/nacl-crypto';
import AccessManagementTab from './AccessManagementTab';
import RecordAccessLog from './RecordAccessLog';
import { useWalletAddress } from '@/hooks/useWalletAddress';

const RecordModal = ({ record, open, onOpenChange, onUpdate, onViewRecord }) => {
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decryptedData, setDecryptedData] = useState(null);
    const [decryptError, setDecryptError] = useState(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [activeTab, setActiveTab] = useState('content');
    const [chainRecords, setChainRecords] = useState([]);
    const [loadingChain, setLoadingChain] = useState(false);
    const [historyRecords, setHistoryRecords] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [selectedChainRecord, setSelectedChainRecord] = useState(null);
    const [chainDecryptedData, setChainDecryptedData] = useState(null);
    const [chainDecrypting, setChainDecrypting] = useState(false);
    const { address: walletAddress, provider, loading: walletLoading } = useWalletAddress();

    // Debug wallet address
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
            setChainRecords([]);
            setSelectedChainRecord(null);
            setChainDecryptedData(null);
        }
    }, [open]);

    // Fetch chain records when history tab is active
    useEffect(() => {
        if (activeTab === 'history' && record?.cidHash && open) {
            const fetchChain = async () => {
                setLoadingChain(true);
                try {
                    const chainData = await recordService.getChainCids(record.cidHash);

                    // Deduplicate records by cidHash
                    const uniqueRecords = new Map();
                    (chainData.records || []).forEach(r => {
                        if (!uniqueRecords.has(r.cidHash)) {
                            uniqueRecords.set(r.cidHash, r);
                        }
                    });

                    // Sort by creation time (oldest first for timeline)
                    const sorted = Array.from(uniqueRecords.values()).sort(
                        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
                    );
                    setChainRecords(sorted);
                } catch (err) {
                    console.error('Failed to fetch chain:', err);
                }
                setLoadingChain(false);
            };
            fetchChain();
        }
    }, [activeTab, record?.cidHash, open]);

    // Handle viewing an old record version from chain
    const handleViewChainRecord = async (oldRecord) => {
        setChainDecrypting(true);
        setChainDecryptedData(null);
        setSelectedChainRecord(oldRecord);

        try {
            // Try to get key from localStorage (owner's records)
            const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
            const localData = localRecords[oldRecord.cidHash];

            let cid, aesKeyString;

            if (localData) {
                cid = localData.cid;
                aesKeyString = localData.aesKey;
            } else {
                // Try to fetch from keyShare (for shared records)
                console.log(`Fetching key for chain record: ${oldRecord.cidHash}`);
                const sharedKey = await keyShareService.getKeyForRecord(oldRecord.cidHash);
                console.log('Got shared key:', sharedKey);

                if (!sharedKey) {
                    throw new Error('Không tìm thấy key giải mã cho hồ sơ này.');
                }

                // Try to decrypt the keyShare
                const myKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

                try {
                    const decrypted = decryptFromSender(
                        sharedKey.encryptedPayload,
                        sharedKey.senderPublicKey,
                        myKeypair.secretKey
                    );
                    const keyData = JSON.parse(decrypted);
                    console.log('Decrypted key data:', keyData);
                    cid = keyData.cid;
                    aesKeyString = keyData.aesKey;
                } catch (e) {
                    console.warn('Standard decryption failed, trying fallback:', e);
                    // Try base64/JSON parse fallback
                    try {
                        const decoded = atob(sharedKey.encryptedPayload);
                        const keyData = JSON.parse(decoded);
                        cid = keyData.cid;
                        aesKeyString = keyData.aesKey;
                    } catch {
                        const keyData = JSON.parse(sharedKey.encryptedPayload);
                        cid = keyData.cid;
                        aesKeyString = keyData.aesKey;
                    }
                }
            }

            // Download and decrypt
            const encryptedContent = await ipfsService.download(cid);
            const key = await importAESKey(aesKeyString);
            const content = await decryptData(encryptedContent, key);

            setChainDecryptedData(content);
            toast({
                title: "Giải mã thành công!",
                description: `Đang hiển thị phiên bản: ${oldRecord.title || 'Không có tiêu đề'}`,
                className: "bg-green-50 border-green-200 text-green-800",
            });

        } catch (err) {
            console.error('Chain record decrypt error:', err);
            toast({
                title: "Lỗi giải mã",
                description: err instanceof Error ? err.message : 'Không thể giải mã hồ sơ cũ',
                variant: "destructive",
            });
            setSelectedChainRecord(null);
        } finally {
            setChainDecrypting(false);
        }
    };

    if (!record) return null;


    // Get local record data (CID + AES key)
    const getLocalRecordData = () => {
        try {
            const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
            // Direct lookup
            if (localRecords[record.cidHash]) return localRecords[record.cidHash];

            // Case-insensitive lookup (Robust fix)
            const targetHash = record.cidHash?.toLowerCase();
            const foundKey = Object.keys(localRecords).find(k => k.toLowerCase() === targetHash);
            return foundKey ? localRecords[foundKey] : null;
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
            } else {
                // 2. Fetch shared key from backend (for records shared by others)
                if (!provider || !walletAddress) {
                    throw new Error('Chưa kết nối ví. Vui lòng đăng nhập lại.');
                }

                // Get shared key from backend
                const sharedKey = await keyShareService.getKeyForRecord(record.cidHash);

                if (!sharedKey) {
                    throw new Error('Không tìm thấy key giải mã. Bạn có thể chưa được chia sẻ key cho hồ sơ này.');
                }

                // Auto-claim if pending (UX improvement: View = Claim)
                if (sharedKey.status === 'pending' && sharedKey.id) {
                    try {
                        keyShareService.claimKey(sharedKey.id);
                        // Don't await, let it happen in background
                    } catch (e) {
                        console.warn('Auto-claim failed:', e);
                    }
                }

                // Decrypt the shared key using NaCl
                const myKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

                let keyData;

                try {
                    // Try NaCl decrypt first (normal shared records)
                    const decryptedPayload = decryptFromSender(
                        sharedKey.encryptedPayload,
                        sharedKey.senderPublicKey,
                        myKeypair.secretKey
                    );
                    keyData = JSON.parse(decryptedPayload);
                } catch (naclError) {
                    // If NaCl fails, try parsing as raw base64 (doctor-created records)
                    try {
                        const decoded = atob(sharedKey.encryptedPayload);
                        keyData = JSON.parse(decoded);
                    } catch (base64Error) {
                        // Try parsing as direct JSON (some edge cases)
                        try {
                            keyData = JSON.parse(sharedKey.encryptedPayload);
                        } catch {
                            throw new Error('Không thể giải mã key. Format không hợp lệ.');
                        }
                    }
                }

                // Extract CID and AES key from keyData
                if (keyData.encryptedData && keyData.aesKey) {
                    // Format from doctor update: {encryptedData, aesKey, metadata}
                    cid = keyData.metadata?.cid || null;
                    aesKeyString = keyData.aesKey;
                    // If no CID in metadata, we need to get it from IPFS upload
                    if (!cid) {
                        // For doctor-created records, CID is in the record metadata
                        const recordMeta = await recordService.getByHash(record.cidHash);
                        cid = recordMeta?.cid;
                    }
                } else if (keyData.cid && keyData.aesKey) {
                    // Normal format: {cid, aesKey}
                    cid = keyData.cid;
                    aesKeyString = keyData.aesKey;
                } else {
                    // Log the key data format for debugging
                    console.error('Invalid keyData format:', {
                        hasEncryptedData: !!keyData.encryptedData,
                        hasAesKey: !!keyData.aesKey,
                        hasCid: !!keyData.cid,
                        keys: Object.keys(keyData || {}),
                    });
                    throw new Error('Key đã được mã hóa bằng khóa cũ. Vui lòng yêu cầu người chia sẻ gửi lại key.');
                }
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
                    <div className="flex items-start justify-between">
                        <div>
                            <Badge variant="secondary" className="mb-2">
                                {record.type}
                            </Badge>
                            <DialogTitle className="text-2xl font-bold text-slate-900">
                                {record.title}
                            </DialogTitle>
                        </div>
                        <div className="flex items-center gap-2">
                            {record.verified && (
                                <Badge className="bg-teal-50 text-teal-700 border-teal-200">
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
                                </Badge>
                            )}
                            {onUpdate && (
                                <Button
                                    onClick={() => {
                                        onOpenChange(false);
                                        onUpdate(record);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                    size="sm"
                                >
                                    <Edit className="w-4 h-4 mr-1" />
                                    Cập nhật
                                </Button>
                            )}
                        </div>
                    </div>
                    <DialogDescription>
                        Ngày tạo: {record.date}
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-4">
                        <TabsTrigger value="content">📄 Nội dung</TabsTrigger>
                        <TabsTrigger value="history">📅 Lịch sử</TabsTrigger>
                        <TabsTrigger value="access">🔐 Quyền</TabsTrigger>
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

                    <TabsContent value="history" className="mt-0">
                        <div className="py-4">
                            {loadingChain ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                                    <span className="ml-2 text-slate-600">Đang tải lịch sử...</span>
                                </div>
                            ) : chainRecords.length > 1 ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                                        <History className="w-4 h-4" />
                                        <span>Chuỗi hồ sơ có {chainRecords.length} phiên bản</span>
                                    </div>

                                    {/* Timeline of all versions */}
                                    {chainRecords.map((r, idx) => {
                                        const isCurrent = r.cidHash === record.cidHash;
                                        const isFirst = idx === 0;
                                        const isLast = idx === chainRecords.length - 1;
                                        const isViewing = selectedChainRecord?.cidHash === r.cidHash;

                                        return (
                                            <div
                                                key={r.cidHash}
                                                className={`relative pl-8 pb-8 last:pb-0 ${!isCurrent ? 'cursor-pointer group' : ''}`}
                                                onClick={() => {
                                                    if (!isCurrent && !chainDecrypting && !isViewing) {
                                                        handleViewChainRecord(r);
                                                    }
                                                }}
                                            >
                                                {/* Timeline Connector */}
                                                <div className="absolute left-[11px] top-8 bottom-0 w-px bg-slate-200 last:hidden" />

                                                {/* Timeline Dot */}
                                                <div className={`absolute left-0 top-1 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center bg-white z-10 transition-colors ${isCurrent
                                                        ? 'border-blue-500 text-blue-500'
                                                        : isViewing
                                                            ? 'border-amber-500 text-amber-500'
                                                            : 'border-slate-300 text-slate-400 group-hover:border-teal-500 group-hover:text-teal-500'
                                                    }`}>
                                                    <div className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-blue-500' : isViewing ? 'bg-amber-500' : 'bg-slate-300 group-hover:bg-teal-500'
                                                        }`} />
                                                </div>

                                                {/* Content Card */}
                                                <div className={`p-3 rounded-lg border transition-all ${isCurrent
                                                        ? 'bg-blue-50 border-blue-200 shadow-sm'
                                                        : isViewing
                                                            ? 'bg-amber-50 border-amber-200 shadow-md ring-1 ring-amber-100'
                                                            : 'bg-white border-slate-100 hover:border-teal-200 hover:shadow-md'
                                                    }`}>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className={`font-medium ${isCurrent ? 'text-blue-900' : 'text-slate-700'}`}>
                                                            {isCurrent ? '📌 Phiên bản hiện tại' : isFirst ? '📝 Hồ sơ gốc' : `📄 Phiên bản ${idx + 1}`}
                                                            {isViewing && <span className="ml-2 text-xs text-amber-600 font-normal">(Đang xem)</span>}
                                                        </span>

                                                        <div className="flex items-center gap-1">
                                                            {/* Copy CID Button */}
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    copyToClipboard(r.cidHash);
                                                                }}
                                                                className="h-6 w-6 p-0 hover:bg-slate-200"
                                                            >
                                                                <Copy className="w-3 h-3 text-slate-400" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="flex justify-between items-end">
                                                        <div>
                                                            <p className={`text-sm ${isCurrent ? 'text-blue-700' : 'text-slate-600'}`}>
                                                                {r.title || 'Không có tiêu đề'}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <p className={`text-xs ${isCurrent ? 'text-blue-500' : 'text-slate-500'}`}>
                                                                    {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                                                                </p>
                                                                {!isCurrent && !isViewing && (
                                                                    <span className="text-[10px] text-teal-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        Nhấn để xem
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {chainDecrypting && selectedChainRecord?.cidHash === r.cidHash && (
                                                            <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Display selected old record content */}
                                    {selectedChainRecord && chainDecryptedData && (
                                        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="font-medium text-amber-900">
                                                    📜 Nội dung phiên bản: {selectedChainRecord.title || 'Không có tiêu đề'}
                                                </h4>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedChainRecord(null);
                                                        setChainDecryptedData(null);
                                                    }}
                                                    className="h-6 text-xs"
                                                >
                                                    Đóng
                                                </Button>
                                            </div>
                                            <div className="text-sm text-amber-800">
                                                {chainDecryptedData.notes && (
                                                    <p className="mb-2"><strong>Ghi chú:</strong> {chainDecryptedData.notes}</p>
                                                )}
                                                {chainDecryptedData.title && (
                                                    <p className="mb-2"><strong>Tiêu đề:</strong> {chainDecryptedData.title}</p>
                                                )}
                                                {chainDecryptedData.type && (
                                                    <p className="mb-2"><strong>Loại:</strong> {chainDecryptedData.type}</p>
                                                )}
                                                {chainDecryptedData.entry && (
                                                    <div className="mt-3">
                                                        <p className="font-medium mb-1">Dữ liệu FHIR:</p>
                                                        <pre className="text-xs bg-white p-2 rounded border overflow-x-auto max-h-60">
                                                            {JSON.stringify(chainDecryptedData.entry, null, 2)}
                                                        </pre>
                                                    </div>
                                                )}
                                                {/* Support both imageBase64 and attachment.data formats */}
                                                {(chainDecryptedData.imageBase64 || chainDecryptedData.attachment?.data) && (
                                                    <div className="mt-3">
                                                        <p className="font-medium mb-1">Hình ảnh:</p>
                                                        <img
                                                            src={chainDecryptedData.imageBase64 ||
                                                                `data:${chainDecryptedData.attachment?.contentType || 'image/jpeg'};base64,${chainDecryptedData.attachment?.data}`}
                                                            alt={chainDecryptedData.attachment?.fileName || "Record image"}
                                                            className="max-w-full h-auto rounded border"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : record.parentCidHash ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                                        <History className="w-4 h-4" />
                                        <span>Đây là bản cập nhật của hồ sơ trước đó</span>
                                    </div>
                                    <div className="relative pl-6 pb-4 border-l-2 border-blue-500">
                                        <div className="absolute -left-2 top-0 w-4 h-4 bg-blue-500 rounded-full"></div>
                                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                            <p className="font-medium text-blue-900">Phiên bản hiện tại</p>
                                            <p className="text-sm text-blue-700">{record.title}</p>
                                            <p className="text-xs text-blue-500 mt-1">{record.date}</p>
                                        </div>
                                    </div>
                                    <div className="relative pl-6 border-l-2 border-slate-300">
                                        <div className="absolute -left-2 top-0 w-4 h-4 bg-slate-400 rounded-full"></div>
                                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-slate-700">Phiên bản trước</span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => copyToClipboard(record.parentCidHash)}
                                                    className="h-6 w-6 p-0"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                </Button>
                                            </div>
                                            <p className="text-xs text-slate-500 font-mono mt-1">
                                                {record.parentCidHash?.slice(0, 20)}...
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-slate-50 rounded-xl">
                                    <History className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                                    <p className="text-slate-600 font-medium">Đây là hồ sơ gốc</p>
                                    <p className="text-sm text-slate-500 mt-1">
                                        Chưa có lịch sử chỉnh sửa
                                    </p>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="access" className="mt-0 space-y-4">
                        <AccessManagementTab
                            record={record}
                            currentUserAddress={walletAddress}
                        />

                        {/* Access Audit Log */}
                        <RecordAccessLog cidHash={record?.cidHash} />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};

export default RecordModal;
