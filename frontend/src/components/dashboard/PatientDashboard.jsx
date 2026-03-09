"use client";

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Plus, Loader2, RefreshCw, FileX, Shield, Bell, FileText, History, Users } from 'lucide-react';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { useEncryptionKey } from '@/hooks/useEncryptionKey';

import RecordCard from '@/components/dashboard/RecordCard';
import GrantAccessForm from '@/components/dashboard/GrantAccessForm';
import RecordModal from '@/components/dashboard/RecordModal';
import UploadRecordModal from '@/components/dashboard/UploadRecordModal';
import AccessRequestList from '@/components/dashboard/AccessRequestList';
import ConsentList from '@/components/dashboard/ConsentList';
import QuotaDisplay from '@/components/dashboard/QuotaDisplay';
import PendingUpdatesSection from '@/components/dashboard/PendingUpdatesSection';
import AccessLogTab from '@/components/dashboard/AccessLogTab';
import DelegationManager from '@/components/dashboard/DelegationManager';
import { recordService } from '@/services';
import { useSocket } from '@/hooks/useSocket';
import { getDisplayName } from '@/components/ui/UserName';

const PatientDashboard = () => {
    const { address, provider, loading: walletLoading } = useWalletAddress();

    // Auto-register encryption key for NaCl key exchange with doctors
    const { registered: encryptionKeyRegistered } = useEncryptionKey(provider, address);

    // Debug: log the wallet state
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [parentRecord, setParentRecord] = useState(null); // For update flow


    // Real data from backend
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pendingRequestCount, setPendingRequestCount] = useState(0);

    // Fetch records from backend
    const fetchRecords = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await recordService.getMyRecords();

            // Transform backend data to frontend format
            const transformedRecords = data.map((record, index) => {
                const isCreatedBySelf = record.createdBy?.toLowerCase() === record.ownerAddress?.toLowerCase();
                // Prefer recordType from backend, fallback to hash-based detection
                const recordType = record.recordType || getRecordType(record.recordTypeHash);

                return {
                    id: record.id || index + 1,
                    cidHash: record.cidHash,
                    parentCidHash: record.parentCidHash || null,
                    type: recordType,
                    title: record.title || `${recordType} #${record.id || index + 1}`,
                    description: record.description || null,
                    date: new Date(record.createdAt).toLocaleDateString('vi-VN'),
                    createdAt: new Date(record.createdAt),
                    createdBy: record.createdBy,
                    createdByDisplay: isCreatedBySelf
                        ? 'Bạn'
                        : record.createdBy
                            ? `BS. ${getDisplayName(record.createdBy)}`
                            : 'Không rõ',
                    isCreatedByDoctor: !isCreatedBySelf,
                    verified: true,
                    details: `CID Hash: ${record.cidHash?.substring(0, 20)}...`,
                    ownerAddress: record.ownerAddress,
                };
            });

            // Filter to show only latest versions (records that are not parent of another record)
            // A record is "outdated" if another record has it as parentCidHash
            const parentCidHashes = new Set(transformedRecords.map(r => r.parentCidHash).filter(Boolean));
            const latestRecords = transformedRecords.filter(r => !parentCidHashes.has(r.cidHash));

            // Sort by creation date (newest first)
            latestRecords.sort((a, b) => b.createdAt - a.createdAt);

            setRecords(latestRecords);
        } catch (err) {
            console.error('Error fetching records:', err);
            setError(err.message || 'Không thể tải hồ sơ');
            toast({
                title: "Lỗi",
                description: "Không thể tải danh sách hồ sơ. Vui lòng thử lại.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    // Helper to determine record type from hash
    const getRecordType = (typeHash) => {
        if (!typeHash) return 'Record';
        const types = ['Diagnosis', 'Prescription', 'Lab', 'X-Ray', 'Checkup'];
        const index = parseInt(typeHash.substring(2, 4), 16) % types.length;
        return types[index];
    };

    // Load records on mount
    useEffect(() => {
        fetchRecords();
    }, []);

    // ---- WebSocket: "Banner" pattern instead of auto-refresh ----
    const [hasNewData, setHasNewData] = useState(false);
    const [newDataMessage, setNewDataMessage] = useState('');

    useSocket({
        'pending_update:claimed': (data) => {
            toast({
                title: "📋 Hồ sơ mới!",
                description: "Bác sĩ vừa thêm hồ sơ mới cho bạn.",
                className: "bg-blue-50 border-blue-200 text-blue-800",
            });
            setNewDataMessage('Bác sĩ vừa thêm hồ sơ mới cho bạn.');
            setHasNewData(true);
        },
        'pending_update:new': (data) => {
            toast({
                title: "🩺 Yêu cầu cập nhật mới!",
                description: `Bác sĩ muốn cập nhật hồ sơ "${data.title || 'mới'}". Vui lòng xem xét.`,
                className: "bg-amber-50 border-amber-200 text-amber-800",
            });
            setNewDataMessage('Có yêu cầu cập nhật hồ sơ mới từ bác sĩ.');
            setHasNewData(true);
        },
        'consent:updated': () => {
            setNewDataMessage('Quyền truy cập hồ sơ vừa thay đổi.');
            setHasNewData(true);
        },
        'record:created': () => {
            toast({
                title: "📂 Hồ sơ mới!",
                description: "Có hồ sơ y tế mới. Bấm cập nhật để xem.",
                className: "bg-green-50 border-green-200 text-green-800",
            });
            setNewDataMessage('Có hồ sơ y tế mới được thêm cho bạn.');
            setHasNewData(true);
        },
        'record:shared': () => {
            setNewDataMessage('Có thay đổi về hồ sơ được chia sẻ.');
            setHasNewData(true);
        },
    });

    // Handler: user clicks "Cập nhật" on the banner
    const handleBannerRefresh = () => {
        setHasNewData(false);
        setNewDataMessage('');
        fetchRecords();
    };

    // Handlers
    const handleViewDetails = (record) => {
        setSelectedRecord(record);
        setIsModalOpen(true);
    };

    const handleGrantAccess = (data) => {
        toast({
            title: "Đã cấp quyền truy cập",
            description: `Đã cấp quyền cho ${data.address.substring(0, 6)}... trong ${data.duration.replace('_', ' ')}.`,
            className: "bg-green-50 border-green-200 text-green-800",
        });
    };

    const handleUploadSuccess = () => {
        setIsUploadModalOpen(false);
        fetchRecords();
        toast({
            title: "Tải lên thành công",
            description: "Hồ sơ y tế đã được lưu an toàn.",
            className: "bg-green-50 border-green-200 text-green-800",
        });
    };

    const handleRequestApproved = (request) => {
        // Refresh data after approval
        fetchRecords();
    };

    // Handle update record - opens upload modal with parent record
    const handleUpdateRecord = (record) => {
        setParentRecord(record);
        setIsUploadModalOpen(true);
    };

    // Clear parent record when upload modal closes
    const handleUploadModalClose = (open) => {
        setIsUploadModalOpen(open);
        if (!open) {
            setParentRecord(null);
        }
    };

    // explicitly clear parentRecord when adding new
    const handleAddNewRecord = () => {
        setParentRecord(null);
        setIsUploadModalOpen(true);
    };

    // BLOCKING LOADING STATE: Wait for wallet connection
    if (walletLoading || !address) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <h2 className="text-xl font-semibold text-slate-700">Đang kết nối ví...</h2>
                <p className="text-slate-500">Vui lòng hoàn tất xác thực ví để tiếp tục.</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header with Quota */}
            <div className="mb-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Cổng thông tin Sức khỏe</h1>
                        <p className="text-slate-500 mt-2">Quản lý hồ sơ y tế và quyền truy cập một cách an toàn.</p>
                    </div>

                    {/* Quota Display */}
                    <div className="lg:w-80">
                        <QuotaDisplay walletAddress={address} />
                    </div>
                </div>
            </div>

            {/* === New Data Banner === */}
            {hasNewData && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-4 animate-in slide-in-from-top">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                            <Bell className="w-4 h-4 text-blue-600" />
                        </div>
                        <p className="text-sm text-blue-800 font-medium">
                            {newDataMessage || 'Có dữ liệu mới. Bấm cập nhật để xem.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            size="sm"
                            onClick={handleBannerRefresh}
                            className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Cập nhật
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setHasNewData(false)}
                            className="text-blue-600 hover:bg-blue-100"
                        >
                            Bỏ qua
                        </Button>
                    </div>
                </div>
            )}

            {/* Pending Doctor Updates */}
            <div className="mb-6">
                <PendingUpdatesSection walletAddress={address} onUpdated={fetchRecords} />
            </div>

            <Tabs defaultValue="records" className="space-y-6">
                <TabsList className="bg-white border border-slate-200 p-1 rounded-xl w-full sm:w-auto grid grid-cols-5 sm:flex h-auto">
                    <TabsTrigger value="records" className="rounded-lg px-4 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                        <FileText className="w-4 h-4 mr-2" />
                        Hồ sơ
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="rounded-lg px-4 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 relative">
                        <Bell className="w-4 h-4 mr-2" />
                        Yêu cầu
                    </TabsTrigger>
                    <TabsTrigger value="consents" className="rounded-lg px-4 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                        <Shield className="w-4 h-4 mr-2" />
                        Đã cấp quyền
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="rounded-lg px-4 py-2.5 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700">
                        <History className="w-4 h-4 mr-2" />
                        Lịch sử
                    </TabsTrigger>
                    <TabsTrigger value="delegation" className="rounded-lg px-4 py-2.5 data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
                        <Users className="w-4 h-4 mr-2" />
                        Ủy quyền
                    </TabsTrigger>
                    <TabsTrigger value="grant" className="rounded-lg px-4 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Cấp mới
                    </TabsTrigger>
                </TabsList>

                {/* Tab 1: My Records */}
                <TabsContent value="records" className="outline-none">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-semibold text-slate-900">Lịch sử Y tế</h2>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchRecords}
                                disabled={loading}
                                className="text-slate-500 hover:text-slate-700"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                        <Button
                            onClick={handleAddNewRecord}
                            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                        >
                            <Plus className="w-4 h-4" /> Thêm hồ sơ
                        </Button>
                    </div>

                    {/* Loading State */}
                    {loading && (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                            <span className="ml-3 text-slate-600">Đang tải hồ sơ...</span>
                        </div>
                    )}

                    {/* Error State */}
                    {error && !loading && (
                        <div className="text-center py-20 bg-red-50 rounded-xl border border-red-200">
                            <p className="text-red-600 mb-4">{error}</p>
                            <Button onClick={fetchRecords} variant="outline" className="border-red-300 text-red-600">
                                Thử lại
                            </Button>
                        </div>
                    )}

                    {/* Empty State */}
                    {!loading && !error && records.length === 0 && (
                        <div className="text-center py-20 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                            <FileX className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                            <p className="text-slate-500 mb-4">Chưa có hồ sơ y tế nào.</p>
                            <Button onClick={handleAddNewRecord} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <Plus className="w-4 h-4 mr-2" /> Thêm hồ sơ đầu tiên
                            </Button>
                        </div>
                    )}

                    {/* Records Grid */}
                    {!loading && !error && records.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {records.map(record => (
                                <RecordCard
                                    key={record.id}
                                    record={record}
                                    onViewDetails={handleViewDetails}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Tab 2: Access Requests */}
                <TabsContent value="requests" className="outline-none">
                    <AccessRequestList
                        walletAddress={address}
                        provider={provider}
                        onApproved={handleRequestApproved}
                    />
                </TabsContent>

                {/* Tab 3: Active Consents (Revoke) */}
                <TabsContent value="consents" className="outline-none">
                    <ConsentList walletAddress={address} />
                </TabsContent>

                {/* Tab 4: Access Logs */}
                <TabsContent value="logs" className="outline-none">
                    <AccessLogTab records={records} />
                </TabsContent>

                {/* Tab 5: Delegation Management */}
                <TabsContent value="delegation" className="outline-none">
                    <DelegationManager />
                </TabsContent>

                {/* Tab 6: Grant New Access */}
                <TabsContent value="grant" className="outline-none">
                    <div className="max-w-lg">
                        <GrantAccessForm onGrant={handleGrantAccess} />
                    </div>
                </TabsContent>
            </Tabs>

            <RecordModal
                record={selectedRecord}
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                onUpdate={handleUpdateRecord}
            />

            <UploadRecordModal
                open={isUploadModalOpen}
                onOpenChange={handleUploadModalClose}
                onSuccess={handleUploadSuccess}
                parentRecord={parentRecord}
                existingRecords={records}
            />
        </div >
    );
};

export default PatientDashboard;
