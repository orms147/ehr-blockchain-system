"use client";

import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { motion } from 'framer-motion';
import {
    Stethoscope, Users, FileText, Clock, Send, Plus, Award, UserPlus, Share2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/use-toast';
import { keyShareService, ipfsService, importAESKey, decryptData, requestService, authService, recordService } from '@/services';
import { decryptFromSender as naclDecrypt, getOrCreateEncryptionKeypair } from '@/services/nacl-crypto';
import RequestAccessForm from '@/components/dashboard/RequestAccessForm';
import DoctorVerificationForm from '@/components/dashboard/DoctorVerificationForm';
import DoctorAddRecordForm from '@/components/dashboard/DoctorAddRecordForm';
import PendingClaims from '@/components/dashboard/PendingClaims';
// PendingUpdateClaims removed 2026-04-19 — doctor updates are direct on-chain.
import UploadRecordModal from '@/components/dashboard/UploadRecordModal';
import DelegatableRecords from '@/components/dashboard/DelegatableRecords';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { useEncryptionKey } from '@/hooks/useEncryptionKey';
import { useSocket } from '@/hooks/useSocket';

// New Components
import DoctorSharedRecordsTab from '@/components/dashboard/DoctorSharedRecordsTab';
import DoctorExpiredRecordsTab from '@/components/dashboard/DoctorExpiredRecordsTab';
import DoctorOutgoingRequestsTab from '@/components/dashboard/DoctorOutgoingRequestsTab';

// Types (Keep local for now or move to types file later)
export interface KeyShare {
    id: string;
    cidHash: string;
    parentCidHash?: string;
    senderAddress: string;
    encryptedPayload: string;
    senderPublicKey?: string;
    status: string;
    createdAt: string;
    expiresAt?: string;
    active?: boolean;
    record?: { ownerAddress: string;[key: string]: any };
    versionCount?: number;
}

export interface DecryptedContent {
    meta?: { title?: string; type?: string };
    notes?: string;
    attachment?: { data?: string; contentType?: string };
    entry?: any[];
}

export interface OutgoingRequest {
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
    const [allSharedRecords, setAllSharedRecords] = useState<KeyShare[]>([]);
    const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRecord, setSelectedRecord] = useState<KeyShare | null>(null);
    const [decrypting, setDecrypting] = useState(false);
    const [decryptedContent, setDecryptedContent] = useState<DecryptedContent | null>(null);
    const [recordHistory, setRecordHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [updateModalOpen, setUpdateModalOpen] = useState(false);
    const [recordToUpdate, setRecordToUpdate] = useState<KeyShare | null>(null);

    // Auto-register encryption key on login
    const { registered: encryptionKeyRegistered } = useEncryptionKey(provider, walletAddress);

    const springConfig = { type: "spring" as const, stiffness: 100, damping: 20 };

    // Fetch shared records - group by chain and show only latest
    const fetchSharedRecords = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        try {
            const records = await keyShareService.getReceivedKeys();
            console.log('DEBUG: Received shared records:', records);
            setAllSharedRecords(records);

            // Deduplicate: Map by cidHash
            const uniqueRecordMap = new Map();
            records.forEach((r: any) => uniqueRecordMap.set(r.cidHash, r));
            const distinctRecords = Array.from(uniqueRecordMap.values());

            // FIX: Split Active vs Expired first
            // Backend sends 'active: boolean'
            const activeList = distinctRecords.filter((r: any) => r.active !== false);
            // We only care about hiding parents IF the child is also Active
            const activeParentCids = new Set(activeList.map((r: any) => r.parentCidHash?.toLowerCase()).filter(Boolean));

            const latestActiveRecords = activeList.filter((r: any) => {
                const isHidden = activeParentCids.has(r.cidHash?.toLowerCase());
                return !isHidden;
            });

            // Calculate version count & SMART SORT
            const processedRecords = latestActiveRecords.map((record: any) => {
                let count = 1;
                let current = record;
                const visited = new Set([record.cidHash]);
                // Simple chain walk
                while (current.parentCidHash && uniqueRecordMap.has(current.parentCidHash)) {
                    if (visited.has(current.parentCidHash)) break;
                    count++;
                    current = uniqueRecordMap.get(current.parentCidHash);
                    visited.add(current.cidHash);
                }

                // Effective Time for Sorting: Max(Self Created, Parent Created)
                // If Parent is re-granted (Unread/New), we want this group to float to top.
                let effectiveTime = new Date(record.createdAt).getTime();
                if (record.parentCidHash && uniqueRecordMap.has(record.parentCidHash)) {
                    const parent = uniqueRecordMap.get(record.parentCidHash);
                    const parentTime = new Date(parent.createdAt).getTime();
                    if (parentTime > effectiveTime) effectiveTime = parentTime;
                }

                return { ...record, versionCount: count, _sortTime: effectiveTime };
            });

            // Sort by Effective Time (Newest First)
            processedRecords.sort((a: any, b: any) => b._sortTime - a._sortTime);

            setSharedRecords(processedRecords);
        } catch (err) {
            console.error('Error fetching shared records:', err);
            if (!isBackground) {
                toast({
                    title: "Lỗi",
                    description: "Không thể tải danh sách hồ sơ được chia sẻ",
                    variant: "destructive",
                });
            }
        } finally {
            if (!isBackground) setLoading(false);
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
        'record:shared': () => fetchSharedRecords(true),
        'consent:updated': () => fetchSharedRecords(true),
        'access_revoked': () => {
            toast({ title: "Quyền truy cập đã bị thu hồi", description: "Bệnh nhân đã thu hồi quyền xem một hồ sơ.", variant: "destructive" });
            fetchSharedRecords(true);
        },
        'pending_update:approved': (data: any) => {
            toast({ title: "✅ Cập nhật được chấp nhận!", description: `Bệnh nhân đã duyệt yêu cầu cập nhật "${data.title || 'hồ sơ'}".`, className: "bg-green-50 border-green-200 text-green-800" });
        },
        'pending_update:rejected': (data: any) => {
            toast({ title: "❌ Cập nhật bị từ chối", description: `Bệnh nhân đã từ chối yêu cầu cập nhật "${data.title || 'hồ sơ'}".`, variant: "destructive" });
        },
    });

    useEffect(() => {
        fetchSharedRecords();
        fetchOutgoingRequests();
        const interval = setInterval(() => {
            fetchSharedRecords(true);
            fetchOutgoingRequests();
        }, 60000);
        return () => clearInterval(interval);
    }, [fetchSharedRecords, fetchOutgoingRequests]);

    // Claim and decrypt logic
    const handleViewRecord = async (keyShare: KeyShare) => {
        if (!provider || !walletAddress) {
            toast({ title: "Lỗi", description: "Không có provider", variant: "destructive" });
            return;
        }

        setSelectedRecord(keyShare);
        setDecrypting(true);
        setDecryptedContent(null);
        setRecordHistory([]);

        try {
            let payload = keyShare.encryptedPayload;
            let senderPubKey = keyShare.senderPublicKey;
            const isFirstView = keyShare.status === 'pending';

            // Claim Pending Root if necessary (Re-share scenario)
            if (keyShare.rootCidHash) {
                const rootRecord = allSharedRecords.find(r => r.cidHash === keyShare.rootCidHash);
                if (rootRecord && rootRecord.status === 'pending') {
                    console.log("Auto-claiming pending Root Record:", rootRecord.id);
                    try {
                        await keyShareService.claimKey(rootRecord.id);
                        // Update state for ALL records to reflect root claim
                        setAllSharedRecords(prev => prev.map(r => r.id === rootRecord.id ? { ...r, status: 'claimed' } : r));
                        setSharedRecords(prev => prev.map(r => r.id === rootRecord.id ? { ...r, status: 'claimed' } : r));
                    } catch (err) {
                        console.error("Failed to auto-claim root:", err);
                    }
                }
            }

            if (isFirstView) {
                const claimResult = await keyShareService.claimKey(keyShare.id);
                payload = claimResult.encryptedPayload;
                senderPubKey = claimResult.senderPublicKey || senderPubKey;
                // Update specific record status
                const updateStatus = (prev: any[]) => prev.map(r => r.id === keyShare.id ? { ...r, status: 'claimed' } : r);
                setSharedRecords(updateStatus);
                setAllSharedRecords(updateStatus);
            }

            const myKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

            // Decryption Logic
            let keyData: { cid?: string; aesKey?: string; encryptedData?: string; metadata?: { cid?: string } };
            try {
                if (senderPubKey) {
                    const decryptedPayload = naclDecrypt(payload, senderPubKey, myKeypair.secretKey);
                    keyData = JSON.parse(decryptedPayload);
                } else {
                    throw new Error('No sender public key');
                }
            } catch (naclError) {
                try {
                    const decoded = atob(payload);
                    keyData = JSON.parse(decoded);
                } catch {
                    try { keyData = JSON.parse(payload); }
                    catch { throw new Error('Không thể giải mã key.'); }
                }
            }

            // Double Encryption Handle
            if (keyData && (keyData as any).nonce && (keyData as any).ciphertext && !keyData.cid && !keyData.aesKey && senderPubKey) {
                try {
                    const innerPayload = JSON.stringify(keyData);
                    let innerDecrypted;
                    try {
                        innerDecrypted = naclDecrypt(innerPayload, senderPubKey, myKeypair.secretKey);
                        keyData = JSON.parse(innerDecrypted);
                    } catch (senderErr) {
                        const ownerAddress = keyShare.record?.ownerAddress;
                        if (ownerAddress) {
                            const ownerInfo = await authService.getEncryptionKey(ownerAddress);
                            if (ownerInfo?.encryptionPublicKey) {
                                innerDecrypted = naclDecrypt(innerPayload, ownerInfo.encryptionPublicKey, myKeypair.secretKey);
                                keyData = JSON.parse(innerDecrypted);
                            }
                        }
                    }
                } catch { }
            }

            // --- FETCH HISTORY ---
            setHistoryLoading(true);
            try {
                // Fetch chain history using the current record's cidHash
                const chainData = await recordService.getChainCids(keyShare.cidHash);
                console.log("Fetched history chain:", chainData);
                setRecordHistory(Array.isArray(chainData) ? chainData : []);
            } catch (err) {
                console.error("Failed to fetch record history:", err);
            } finally {
                setHistoryLoading(false);
            }

            let cid: string;
            let aesKey: string;

            if (keyData.encryptedData && keyData.aesKey) {
                cid = keyData.metadata?.cid || '';
                aesKey = keyData.aesKey;
            } else if (keyData.cid && keyData.aesKey) {
                cid = keyData.cid;
                aesKey = keyData.aesKey;
            } else {
                throw new Error('Key data format không hợp lệ');
            }

            let encryptedContent: string;
            if (cid) {
                encryptedContent = await ipfsService.download(cid);
            } else if (keyData.encryptedData) {
                encryptedContent = keyData.encryptedData;
            } else {
                throw new Error('Không tìm thấy nội dung');
            }

            const key = await importAESKey(aesKey);
            const content = await decryptData(encryptedContent, key);
            setDecryptedContent(content);

            if (cid && aesKey) {
                const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
                localRecords[keyShare.cidHash] = { cid, aesKey };
                localStorage.setItem('ehr_local_records', JSON.stringify(localRecords));
            }

            // Fetch History
            if ((keyShare.versionCount || 0) > 1 || keyShare.parentCidHash) {
                setHistoryLoading(true);
                try {
                    const chainData = await recordService.getRecordChain(keyShare.cidHash);
                    if (chainData && chainData.records) {
                        setRecordHistory(chainData.records);
                    }
                } catch (e) {
                    console.error("History fetch error", e);
                } finally {
                    setHistoryLoading(false);
                }
            }

            if (isFirstView) {
                toast({ title: "Giải mã thành công!", description: "Bạn có thể xem nội dung hồ sơ", className: "bg-green-50 border-green-200 text-green-800" });
            }

        } catch (err) {
            console.error('Decrypt error:', err);
            toast({ title: "Lỗi giải mã", description: err instanceof Error ? err.message : 'Không thể giải mã hồ sơ', variant: "destructive" });
        } finally {
            setDecrypting(false);
        }
    };

    const handleReject = async (keyShareId: string) => {
        setRejectingId(keyShareId);
        try {
            await keyShareService.rejectKey(keyShareId);
            toast({ title: "Đã từ chối", description: "Hồ sơ đã bị từ chối thành công", className: "bg-orange-50 border-orange-200 text-orange-800" });
            setSharedRecords(prev => prev.filter(r => r.id !== keyShareId));
        } catch (err) {
            toast({ title: "Lỗi", description: "Không thể từ chối hồ sơ", variant: "destructive" });
        } finally {
            setRejectingId(null);
        }
    };

    const handleRequestSuccess = () => {
        fetchOutgoingRequests();
        fetchSharedRecords();
    };

    // Calculate stats — use ownerAddress (actual patient) instead of senderAddress (could be doctor)
    const uniquePatients = new Set(
        sharedRecords
            .map(r => (r.record?.ownerAddress || r.senderAddress)?.toLowerCase())
            .filter((addr): addr is string => !!addr && addr !== walletAddress?.toLowerCase())
    ).size;

    const stats = [
        { icon: Users, label: 'Bệnh nhân', value: uniquePatients.toString(), color: 'from-blue-500 to-blue-600' },
        { icon: FileText, label: 'Hồ sơ được chia sẻ', value: sharedRecords.length.toString(), color: 'from-teal-500 to-teal-600' },
        { icon: Clock, label: 'Đang chờ xem', value: sharedRecords.filter(r => r.status === 'pending').length.toString(), color: 'from-orange-500 to-orange-600' },
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

                {/* Pending Actions */}
                <div className="space-y-4 mb-8">
                    <PendingClaims
                        walletAddress={walletAddress}
                        provider={provider}
                        onClaimed={() => { fetchSharedRecords(); fetchOutgoingRequests(); }}
                    />
                </div>

                {/* Main Tabs */}
                <Tabs defaultValue="shared" className="space-y-6">
                    <TabsList className="bg-white border border-slate-200 p-1 rounded-xl flex flex-wrap">
                        <TabsTrigger value="shared" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <FileText className="w-4 h-4 mr-2" />
                            Hồ sơ được chia sẻ
                        </TabsTrigger>
                        <TabsTrigger value="expired" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <Clock className="w-4 h-4 mr-2" />
                            Đã hết hạn
                        </TabsTrigger>
                        <TabsTrigger value="request" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <Plus className="w-4 h-4 mr-2" />
                            Yêu cầu truy cập
                        </TabsTrigger>
                        <TabsTrigger value="pending" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <Send className="w-4 h-4 mr-2" />
                            Đã gửi ({outgoingRequests.length})
                        </TabsTrigger>
                        <TabsTrigger value="add-record" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <UserPlus className="w-4 h-4 mr-2" />
                            Thêm hồ sơ
                        </TabsTrigger>
                        <TabsTrigger value="delegatable" className="rounded-lg px-4 py-2 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700">
                            <Share2 className="w-4 h-4 mr-2" />
                            Hồ sơ ủy quyền
                        </TabsTrigger>
                        <TabsTrigger value="verification" className="rounded-lg px-4 py-2 data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700">
                            <Award className="w-4 h-4 mr-2" />
                            Xác thực
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab Contents */}
                    <TabsContent value="shared" className="outline-none">
                        <DoctorSharedRecordsTab
                            records={sharedRecords}
                            allRecords={allSharedRecords}
                            loading={loading}
                            onRefresh={fetchSharedRecords}
                            walletAddress={walletAddress}
                            onViewRecord={handleViewRecord}
                            decrypting={decrypting}
                            selectedRecordId={selectedRecord?.id}
                            onUpdateRecord={(r) => {
                                // Check if latest
                                const hasChildren = sharedRecords.some((sr) => sr.parentCidHash === r.cidHash);
                                if (hasChildren) {
                                    toast({ title: "⚠️ Đây không phải bản mới nhất!", description: "Vui lòng cập nhật từ bản mới nhất.", variant: "destructive" });
                                    return;
                                }
                                setRecordToUpdate(r);
                                setUpdateModalOpen(true);
                            }}
                            onRejectRecord={handleReject}
                            rejectingId={rejectingId}
                            decryptedContent={decryptedContent}
                            recordHistory={recordHistory}
                            historyLoading={historyLoading}
                            onHideRecord={() => {
                                setSelectedRecord(null);
                                setDecryptedContent(null);
                            }}
                        />
                    </TabsContent>

                    <TabsContent value="expired" className="outline-none">
                        <DoctorExpiredRecordsTab
                            records={sharedRecords}
                            loading={loading}
                            onRefresh={fetchSharedRecords}
                            walletAddress={walletAddress}
                        />
                    </TabsContent>

                    <TabsContent value="request" className="outline-none">
                        <div className="max-w-lg">
                            <RequestAccessForm onSuccess={handleRequestSuccess} />
                        </div>
                    </TabsContent>

                    <TabsContent value="pending" className="outline-none">
                        <DoctorOutgoingRequestsTab
                            requests={outgoingRequests}
                            onRefresh={fetchOutgoingRequests}
                        />
                    </TabsContent>

                    <TabsContent value="add-record" className="outline-none">
                        <div className="max-w-2xl">
                            <DoctorAddRecordForm onSuccess={handleRequestSuccess} />
                        </div>
                    </TabsContent>

                    <TabsContent value="delegatable" className="outline-none">
                        <DelegatableRecords />
                    </TabsContent>

                    <TabsContent value="verification" className="outline-none">
                        <div className="max-w-lg">
                            <DoctorVerificationForm />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Update Modal */}
            <UploadRecordModal
                open={updateModalOpen}
                onOpenChange={(open: boolean) => {
                    setUpdateModalOpen(open);
                    if (!open) setRecordToUpdate(null);
                }}
                parentRecord={recordToUpdate ? {
                    cidHash: recordToUpdate.cidHash,
                    title: `Update for ${recordToUpdate.cidHash.slice(0, 16)}...`,
                    ownerAddress: recordToUpdate.record?.ownerAddress || recordToUpdate.senderAddress,
                    expiresAt: recordToUpdate.expiresAt
                } : undefined}
                isDoctorUpdate={true}
                patientAddress={(recordToUpdate?.record?.ownerAddress || recordToUpdate?.senderAddress)?.toLowerCase()}
                onSuccess={() => {
                    setUpdateModalOpen(false);
                    setRecordToUpdate(null);
                    fetchSharedRecords();
                }}
            />
        </DashboardLayout>
    );
}
