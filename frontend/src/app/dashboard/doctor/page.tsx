"use client";

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import {
    Stethoscope, Users, FileText, Clock, AlertCircle, Loader2,
    RefreshCw, Eye, EyeOff, Lock, Unlock, Send, Plus, Award, UserPlus, XCircle, Edit
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { keyShareService, ipfsService, importAESKey, decryptData, parseKeySharePayload, requestService } from '@/services';
import { decryptFromSender as naclDecrypt, getOrCreateEncryptionKeypair } from '@/services/nacl-crypto';
import RequestAccessForm from '@/components/dashboard/RequestAccessForm';
import DoctorVerificationForm from '@/components/dashboard/DoctorVerificationForm';
import DoctorAddRecordForm from '@/components/dashboard/DoctorAddRecordForm';
import PendingClaims from '@/components/dashboard/PendingClaims';
import PendingUpdateClaims from '@/components/dashboard/PendingUpdateClaims';
import UploadRecordModal from '@/components/dashboard/UploadRecordModal';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { useEncryptionKey } from '@/hooks/useEncryptionKey';
import { useSocket } from '@/hooks/useSocket';


// Types
interface KeyShare {
    id: string;
    cidHash: string;
    parentCidHash?: string; // For chain grouping
    senderAddress: string;
    encryptedPayload: string;
    senderPublicKey?: string;  // NaCl public key for decryption
    status: string;
    createdAt: string;
}

interface DecryptedContent {
    meta?: { title?: string; type?: string };
    notes?: string;
    attachment?: { data?: string; contentType?: string };
    entry?: any[];
}

interface OutgoingRequest {
    id: string;
    requestId: string;
    patientAddress: string;
    cidHash: string;
    status: string;
    createdAt: string;
    deadline: string;
}

export default function DoctorDashboardPage() {
    const { address: walletAddress, provider } = useWalletAddress();
    const [sharedRecords, setSharedRecords] = useState<KeyShare[]>([]);
    const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState<KeyShare | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const [decryptedContent, setDecryptedContent] = useState<DecryptedContent | null>(null);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [updateModalOpen, setUpdateModalOpen] = useState(false);
    const [recordToUpdate, setRecordToUpdate] = useState<KeyShare | null>(null);

    // Auto-register encryption key on login
    const { registered: encryptionKeyRegistered } = useEncryptionKey(provider, walletAddress);

    const springConfig = { type: "spring" as const, stiffness: 100, damping: 20 };

    // Fetch shared records - group by chain and show only latest
    const fetchSharedRecords = useCallback(async () => {
        setLoading(true);
        try {
            const records = await keyShareService.getReceivedKeys();

            // Group records by chain - only show latest (ones not referenced as parent)
            const parentCidHashes = new Set(records.map((r: KeyShare) => r.parentCidHash).filter(Boolean));
            const latestRecords = records.filter((r: KeyShare) => !parentCidHashes.has(r.cidHash));

            setSharedRecords(latestRecords);
        } catch (err) {
            console.error('Error fetching shared records:', err);
            toast({
                title: "Lỗi",
                description: "Không thể tải danh sách hồ sơ được chia sẻ",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch outgoing requests
    const fetchOutgoingRequests = useCallback(async () => {
        try {
            const data = await requestService.getMyRequests();
            setOutgoingRequests(data.requests || []);
        } catch (err) {
            console.error('Error fetching outgoing requests:', err);
        }
    }, []);

    // WebSocket real-time updates
    useSocket({
        'record:shared': () => {
            fetchSharedRecords();
        },
        'consent:updated': () => {
            fetchSharedRecords();
        },
        'access_revoked': (data: any) => {
            toast({
                title: "Quyền truy cập đã bị thu hồi",
                description: "Bệnh nhân đã thu hồi quyền xem một hồ sơ.",
                variant: "destructive",
            });
            fetchSharedRecords();
        },
        'pending_update:approved': (data: any) => {
            toast({
                title: "✅ Cập nhật được chấp nhận!",
                description: `Bệnh nhân đã duyệt yêu cầu cập nhật "${data.title || 'hồ sơ'}". Bạn có thể tiến hành.`,
                className: "bg-green-50 border-green-200 text-green-800",
            });
            // Could refresh pending updates list here if needed
        },
        'pending_update:rejected': (data: any) => {
            toast({
                title: "❌ Cập nhật bị từ chối",
                description: `Bệnh nhân đã từ chối yêu cầu cập nhật "${data.title || 'hồ sơ'}".`,
                variant: "destructive",
            });
            // Could refresh pending updates list here if needed
        },
    });


    useEffect(() => {
        fetchSharedRecords();
        fetchOutgoingRequests();

        // Fallback polling every 60 seconds (in case WebSocket disconnects)
        const interval = setInterval(() => {
            fetchSharedRecords();
            fetchOutgoingRequests();
        }, 60000);

        return () => clearInterval(interval);
    }, [fetchSharedRecords, fetchOutgoingRequests]);

    // Claim and decrypt a shared record using NaCl
    const handleViewRecord = async (keyShare: any) => {
        if (!provider || !walletAddress) {
            toast({ title: "Lỗi", description: "Không có provider", variant: "destructive" });
            return;
        }

        setSelectedRecord(keyShare);
        setDecrypting(true);
        setDecryptedContent(null);

        try {
            let payload = keyShare.encryptedPayload;
            let senderPubKey = keyShare.senderPublicKey;
            const isFirstView = keyShare.status === 'pending';

            if (isFirstView) {
                const claimResult = await keyShareService.claimKey(keyShare.id);
                payload = claimResult.encryptedPayload;
                senderPubKey = claimResult.senderPublicKey || senderPubKey;

                setSharedRecords(prev => prev.map(r =>
                    r.id === keyShare.id ? { ...r, status: 'claimed' } : r
                ));
            }

            // Get my (Doctor's) NaCl keypair for decryption
            const myKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

            // Decrypt the payload - try multiple methods
            let keyData: { cid?: string; aesKey?: string; encryptedData?: string; metadata?: { cid?: string } };

            try {
                // Try NaCl decryption first (normal shared records)
                if (senderPubKey) {
                    const decryptedPayload = naclDecrypt(payload, senderPubKey, myKeypair.secretKey);
                    keyData = JSON.parse(decryptedPayload);
                } else {
                    throw new Error('No sender public key');
                }
            } catch (naclError) {
                // If NaCl fails, try base64 decode (doctor-created records)
                try {
                    const decoded = atob(payload);
                    keyData = JSON.parse(decoded);
                } catch (base64Error) {
                    // Try direct JSON parse
                    try {
                        keyData = JSON.parse(payload);
                    } catch {
                        throw new Error('Không thể giải mã key. Format không hợp lệ.');
                    }
                }
            }

            // Extract CID and AES key from keyData
            let cid: string;
            let aesKey: string;

            if (keyData.encryptedData && keyData.aesKey) {
                // Format from doctor update: {encryptedData, aesKey, metadata}
                cid = keyData.metadata?.cid || '';
                aesKey = keyData.aesKey;
                // If no CID in metadata, we can still try to use encryptedData directly
                if (!cid && keyData.encryptedData) {
                    // encryptedData is already the content, use it directly below
                }
            } else if (keyData.cid && keyData.aesKey) {
                // Normal format: {cid, aesKey}
                cid = keyData.cid;
                aesKey = keyData.aesKey;
            } else {
                throw new Error('Key data format không hợp lệ');
            }

            let encryptedContent: string;
            if (cid) {
                encryptedContent = await ipfsService.download(cid);
            } else if (keyData.encryptedData) {
                // For doctor-created records, encryptedData might be the actual content
                encryptedContent = keyData.encryptedData;
            } else {
                throw new Error('Không tìm thấy CID hoặc encryptedData');
            }

            const key = await importAESKey(aesKey);
            const content = await decryptData(encryptedContent, key);

            setDecryptedContent(content);

            // Only show success toast on first view (claim)
            if (isFirstView) {
                toast({
                    title: "Giải mã thành công!",
                    description: "Bạn có thể xem nội dung hồ sơ",
                    className: "bg-green-50 border-green-200 text-green-800",
                });
            }

        } catch (err) {
            console.error('Decrypt error:', err);
            toast({
                title: "Lỗi giải mã",
                description: err instanceof Error ? err.message : 'Không thể giải mã hồ sơ',
                variant: "destructive",
            });
        } finally {
            setDecrypting(false);
        }
    };

    // Reject a shared record
    const handleReject = async (keyShareId: string) => {
        setRejectingId(keyShareId);
        try {
            await keyShareService.rejectKey(keyShareId);
            toast({
                title: "Đã từ chối",
                description: "Hồ sơ đã bị từ chối thành công",
                className: "bg-orange-50 border-orange-200 text-orange-800",
            });
            // Remove from local state immediately
            setSharedRecords(prev => prev.filter(r => r.id !== keyShareId));
        } catch (err) {
            console.error('Reject error:', err);
            toast({
                title: "Lỗi",
                description: err instanceof Error ? err.message : 'Không thể từ chối hồ sơ',
                variant: "destructive",
            });
        } finally {
            setRejectingId(null);
        }
    };

    const handleRequestSuccess = () => {
        fetchOutgoingRequests();
    };

    // Calculate unique patients (exclude doctor's own address when they create records)
    const uniquePatients = new Set(
        sharedRecords
            .map((r: KeyShare) => r.senderAddress?.toLowerCase())
            .filter((addr: string | undefined) => addr && addr !== walletAddress?.toLowerCase())
    ).size;

    const stats = [
        { icon: Users, label: 'Bệnh nhân', value: uniquePatients.toString(), color: 'from-blue-500 to-blue-600' },
        { icon: FileText, label: 'Hồ sơ được chia sẻ', value: sharedRecords.length.toString(), color: 'from-teal-500 to-teal-600' },
        { icon: Clock, label: 'Đang chờ xem', value: sharedRecords.filter((r: any) => r.status === 'pending').length.toString(), color: 'from-orange-500 to-orange-600' },
        { icon: Send, label: 'Yêu cầu đã gửi', value: outgoingRequests.length.toString(), color: 'from-purple-500 to-purple-600' },
    ];


    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={springConfig}
                    className="mb-8"
                >
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Stethoscope className="w-8 h-8 text-teal-600" />
                        Bảng điều khiển Bác sĩ
                    </h1>
                    <p className="text-slate-500 mt-2">Quản lý và truy cập hồ sơ bệnh nhân được ủy quyền.</p>
                </motion.div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    {stats.map((stat, index) => (
                        <motion.div
                            key={stat.label}
                            initial={{ opacity: 0, y: 20, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ ...springConfig, delay: index * 0.1 }}
                        >
                            <Card className="hover:shadow-lg transition-shadow duration-300 overflow-hidden bg-white">
                                <CardContent className="p-6">
                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4 shadow-lg`}>
                                        <stat.icon className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-3xl font-bold text-slate-900">{stat.value}</div>
                                    <div className="text-sm text-slate-500">{stat.label}</div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>

                {/* Pending Claims Section */}
                <div className="space-y-4 mb-8">
                    <PendingClaims
                        walletAddress={walletAddress}
                        provider={provider}
                        onClaimed={() => {
                            fetchSharedRecords();
                            fetchOutgoingRequests();
                        }}
                    />
                    <PendingUpdateClaims
                        walletAddress={walletAddress}
                        provider={provider}
                        onClaimed={() => {
                            fetchSharedRecords();
                        }}
                    />
                </div>

                {/* Tabs */}
                <Tabs defaultValue="shared" className="space-y-6">
                    <TabsList className="bg-white border border-slate-200 p-1 rounded-xl flex flex-wrap">
                        <TabsTrigger value="shared" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <FileText className="w-4 h-4 mr-2" />
                            Hồ sơ được chia sẻ
                        </TabsTrigger>
                        <TabsTrigger value="request" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Yêu cầu truy cập
                        </TabsTrigger>
                        <TabsTrigger value="pending" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <Clock className="w-4 h-4 mr-2" />
                            Đã gửi ({outgoingRequests.length})
                        </TabsTrigger>
                        <TabsTrigger value="add-record" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <UserPlus className="w-4 h-4 mr-2" />
                            Thêm hồ sơ
                        </TabsTrigger>
                        <TabsTrigger value="verification" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <Award className="w-4 h-4 mr-2" />
                            Xác thực
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Shared Records */}
                    <TabsContent value="shared" className="outline-none">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...springConfig, delay: 0.4 }}
                        >
                            <Card className="bg-white">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="text-slate-900">Hồ sơ được chia sẻ</CardTitle>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={fetchSharedRecords}
                                        disabled={loading}
                                    >
                                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                    </Button>
                                </CardHeader>
                                <CardContent>
                                    {loading ? (
                                        <div className="flex items-center justify-center py-12">
                                            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                                            <span className="ml-3 text-slate-600">Đang tải...</span>
                                        </div>
                                    ) : sharedRecords.length === 0 ? (
                                        <div className="text-center py-12 bg-slate-50 rounded-xl">
                                            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                            <p className="text-slate-500">Chưa có hồ sơ nào được chia sẻ với bạn.</p>
                                            <p className="text-sm text-slate-400 mt-2">
                                                Bệnh nhân cần cấp quyền truy cập trước khi bạn có thể xem hồ sơ.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {sharedRecords.map((record: any) => (
                                                <div
                                                    key={record.id}
                                                    className="p-4 border border-slate-200 rounded-xl hover:border-teal-300 transition-colors bg-white"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
                                                                {record.status === 'claimed' ? (
                                                                    <Unlock className="w-6 h-6 text-teal-600" />
                                                                ) : (
                                                                    <Lock className="w-6 h-6 text-slate-500" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                {record.senderAddress?.toLowerCase() === walletAddress?.toLowerCase() ? (
                                                                    <>
                                                                        <p className="font-medium text-slate-900">
                                                                            Hồ sơ bạn tạo cho bệnh nhân
                                                                        </p>
                                                                        <p className="text-xs text-teal-600 font-medium">
                                                                            🩺 Do bạn tạo
                                                                        </p>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <p className="font-medium text-slate-900">
                                                                            Hồ sơ từ: {record.senderAddress?.slice(0, 8)}...{record.senderAddress?.slice(-6)}
                                                                        </p>
                                                                        <p className="text-xs text-blue-600 font-medium">
                                                                            👤 Bệnh nhân chia sẻ
                                                                        </p>
                                                                    </>
                                                                )}
                                                                <p className="text-sm text-slate-500">
                                                                    CID: {record.cidHash?.slice(0, 16)}...
                                                                </p>
                                                                <p className="text-xs text-slate-400">
                                                                    Chia sẻ lúc: {new Date(record.createdAt).toLocaleString('vi-VN')}
                                                                </p>
                                                                {record.expiresAt && (() => {
                                                                    const now = new Date();
                                                                    const expiry = new Date(record.expiresAt);
                                                                    const diffMs = expiry.getTime() - now.getTime();
                                                                    const isExpired = diffMs <= 0;

                                                                    // Calculate days, hours, minutes properly
                                                                    const totalMinutes = Math.floor(diffMs / (1000 * 60));
                                                                    const diffDays = Math.floor(totalMinutes / (60 * 24));
                                                                    const diffHours = Math.floor((totalMinutes % (60 * 24)) / 60);
                                                                    const diffMinutes = totalMinutes % 60;

                                                                    let timeText = '';
                                                                    if (diffDays > 0) {
                                                                        timeText = `Còn ${diffDays} ngày ${diffHours} giờ ${diffMinutes} phút`;
                                                                    } else if (diffHours > 0) {
                                                                        timeText = `Còn ${diffHours} giờ ${diffMinutes} phút`;
                                                                    } else if (diffMinutes > 0) {
                                                                        timeText = `Còn ${diffMinutes} phút`;
                                                                    } else {
                                                                        timeText = 'Sắp hết hạn';
                                                                    }

                                                                    return (
                                                                        <p className={`text-xs font-medium ${isExpired ? 'text-red-500' : diffDays < 1 ? 'text-orange-500' : 'text-green-600'}`}>
                                                                            ⏱️ {isExpired ? 'Đã hết hạn' : timeText}
                                                                        </p>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Badge
                                                                variant={record.status === 'claimed' ? 'default' : 'secondary'}
                                                                className={record.status === 'claimed' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : ''}
                                                            >
                                                                {record.status === 'claimed' ? 'Đã xem' : 'Chưa xem'}
                                                            </Badge>
                                                            <div className="flex items-center gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleViewRecord(record)}
                                                                    disabled={decrypting && selectedRecord?.id === record.id}
                                                                    className="bg-teal-600 hover:bg-teal-700"
                                                                >
                                                                    {decrypting && selectedRecord?.id === record.id ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                                    ) : (
                                                                        <>
                                                                            <Eye className="w-4 h-4 mr-1" />
                                                                            Xem
                                                                        </>
                                                                    )}
                                                                </Button>
                                                                {/* Only show Update button if doctor has already viewed the record */}
                                                                {record.status === 'claimed' && (
                                                                    <Button
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            // Check if this record has children (not latest)
                                                                            const hasChildren = sharedRecords.some(
                                                                                (r: KeyShare) => r.parentCidHash === record.cidHash
                                                                            );
                                                                            if (hasChildren) {
                                                                                toast({
                                                                                    title: "⚠️ Đây không phải bản mới nhất!",
                                                                                    description: "Hồ sơ này đã có bản cập nhật mới hơn. Vui lòng cập nhật từ bản mới nhất.",
                                                                                    variant: "destructive",
                                                                                });
                                                                                return;
                                                                            }
                                                                            setRecordToUpdate(record);
                                                                            setUpdateModalOpen(true);
                                                                        }}
                                                                        className="bg-blue-600 hover:bg-blue-700"
                                                                    >
                                                                        <Edit className="w-4 h-4 mr-1" />
                                                                        Cập nhật
                                                                    </Button>
                                                                )}
                                                                {/* Hide reject button if claimed OR if doctor is the creator */}
                                                                {record.status !== 'claimed' && record.senderAddress?.toLowerCase() !== walletAddress?.toLowerCase() && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        onClick={() => handleReject(record.id)}
                                                                        disabled={rejectingId === record.id}
                                                                        className="border-red-300 text-red-600 hover:bg-red-50"
                                                                    >
                                                                        {rejectingId === record.id ? (
                                                                            <Loader2 className="w-4 h-4 animate-spin" />
                                                                        ) : (
                                                                            <>
                                                                                <XCircle className="w-4 h-4 mr-1" />
                                                                                Từ chối
                                                                            </>
                                                                        )}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Show decrypted content */}
                                                    {selectedRecord?.id === record.id && decryptedContent && (
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            className="mt-4 p-4 bg-green-50 rounded-xl border border-green-200"
                                                        >
                                                            <div className="flex items-center justify-between mb-3">
                                                                <h4 className="font-semibold text-green-800 flex items-center gap-2">
                                                                    <Unlock className="w-4 h-4" />
                                                                    Nội dung hồ sơ
                                                                </h4>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => {
                                                                        setSelectedRecord(null);
                                                                        setDecryptedContent(null);
                                                                    }}
                                                                    className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                                                >
                                                                    <EyeOff className="w-4 h-4 mr-1" />
                                                                    Ẩn
                                                                </Button>
                                                            </div>

                                                            {/* Image */}
                                                            {decryptedContent.attachment?.data &&
                                                                decryptedContent.attachment?.contentType?.startsWith('image/') && (
                                                                    <div className="mb-4">
                                                                        <img
                                                                            src={`data:${decryptedContent.attachment.contentType};base64,${decryptedContent.attachment.data}`}
                                                                            alt="Medical Record"
                                                                            className="max-w-md rounded-lg border"
                                                                        />
                                                                    </div>
                                                                )}

                                                            {/* Metadata */}
                                                            <div className="text-sm text-slate-700 space-y-1">
                                                                {decryptedContent.meta?.title && (
                                                                    <p><strong>Tiêu đề:</strong> {decryptedContent.meta.title}</p>
                                                                )}
                                                                {decryptedContent.meta?.type && (
                                                                    <p><strong>Loại:</strong> {decryptedContent.meta.type}</p>
                                                                )}
                                                                {decryptedContent.notes && (
                                                                    <p><strong>Ghi chú:</strong> {decryptedContent.notes}</p>
                                                                )}
                                                            </div>

                                                            {/* FHIR data */}
                                                            {decryptedContent.entry && (
                                                                <details className="mt-3">
                                                                    <summary className="cursor-pointer text-sm text-teal-700">
                                                                        Xem dữ liệu FHIR
                                                                    </summary>
                                                                    <pre className="mt-2 text-xs bg-white p-3 rounded overflow-x-auto">
                                                                        {JSON.stringify(decryptedContent.entry, null, 2)}
                                                                    </pre>
                                                                </details>
                                                            )}
                                                        </motion.div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    </TabsContent>

                    {/* Tab 2: Request Access Form */}
                    <TabsContent value="request" className="outline-none">
                        <div className="max-w-lg">
                            <RequestAccessForm onSuccess={handleRequestSuccess} />
                        </div>
                    </TabsContent>

                    {/* Tab 3: Outgoing Requests */}
                    <TabsContent value="pending" className="outline-none">
                        <Card className="bg-white">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-slate-900">Yêu cầu đã gửi</CardTitle>
                                <Button variant="ghost" size="sm" onClick={fetchOutgoingRequests}>
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {outgoingRequests.length === 0 ? (
                                    <div className="text-center py-12 bg-slate-50 rounded-xl">
                                        <Send className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                                        <p className="text-slate-500">Chưa có yêu cầu nào.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {outgoingRequests.map((req) => (
                                            <div key={req.id} className="p-4 border rounded-xl">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="font-medium text-slate-900">
                                                            Bệnh nhân: {req.patientAddress?.slice(0, 8)}...{req.patientAddress?.slice(-6)}
                                                        </p>
                                                        <p className="text-sm text-slate-500">
                                                            Gửi lúc: {new Date(req.createdAt).toLocaleString('vi-VN')}
                                                        </p>
                                                        <p className="text-xs text-slate-400">
                                                            Hạn: {new Date(req.deadline).toLocaleString('vi-VN')}
                                                        </p>
                                                    </div>
                                                    <Badge className={
                                                        req.status === 'claimed' ? 'bg-blue-100 text-blue-800' :
                                                            req.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                                req.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                                    'bg-yellow-100 text-yellow-800'
                                                    }>
                                                        {req.status === 'claimed' ? 'Đã nhận' :
                                                            req.status === 'approved' ? 'Đã duyệt' :
                                                                req.status === 'rejected' ? 'Đã từ chối' : 'Đang chờ'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tab 4: Add Record for Patient */}
                    <TabsContent value="add-record" className="outline-none">
                        <div className="max-w-2xl">
                            <DoctorAddRecordForm onSuccess={handleRequestSuccess} />
                        </div>
                    </TabsContent>

                    {/* Tab 5: Verification */}
                    <TabsContent value="verification" className="outline-none">
                        <div className="max-w-lg">
                            <DoctorVerificationForm />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Update Record Modal */}
            <UploadRecordModal
                open={updateModalOpen}
                onOpenChange={(open: boolean) => {
                    setUpdateModalOpen(open);
                    if (!open) setRecordToUpdate(null);
                }}
                parentRecord={recordToUpdate ? {
                    cidHash: recordToUpdate.cidHash,
                    title: `Update for ${recordToUpdate.cidHash.slice(0, 16)}...`,
                    ownerAddress: recordToUpdate.senderAddress // Patient's address
                } : undefined}
                isDoctorUpdate={true}
                patientAddress={recordToUpdate?.senderAddress || null}
                onSuccess={() => {
                    setUpdateModalOpen(false);
                    setRecordToUpdate(null);
                    fetchSharedRecords();
                }}
            />
        </DashboardLayout>
    );
}
