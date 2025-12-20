"use client";

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Plus, Loader2, RefreshCw, FileX } from 'lucide-react';

import RecordCard from '@/components/dashboard/RecordCard';
import AccessListItem from '@/components/dashboard/AccessListItem';
import RequestItem from '@/components/dashboard/RequestItem';
import GrantAccessForm from '@/components/dashboard/GrantAccessForm';
import RecordModal from '@/components/dashboard/RecordModal';
import UploadRecordModal from '@/components/dashboard/UploadRecordModal';
import { recordService } from '@/services';

const PatientDashboard = () => {
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

    // Real data from backend
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Mock data for demonstration (access control - will be connected later)
    const [accessList, setAccessList] = useState([
        { id: 1, doctorName: 'Dr. Sarah Wilson', accessScope: 'Full Access', expiryDate: 'Dec 31, 2024' },
        { id: 2, doctorName: 'Dr. James Chen', accessScope: 'Read Only', expiryDate: 'Nov 15, 2024' },
    ]);

    const [requests, setRequests] = useState([
        { id: 1, requesterName: 'Dr. Michael Ross', requesterRole: 'Cardiologist', reason: 'Upcoming consultation regarding arrhythmia.' },
        { id: 2, requesterName: 'City General Hospital', requesterRole: 'Emergency Dept', reason: 'Emergency admission access required.' },
    ]);

    // Fetch records from backend
    const fetchRecords = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await recordService.getMyRecords();

            // Transform backend data to frontend format
            const transformedRecords = data.map((record, index) => ({
                id: record.id || index + 1,
                cidHash: record.cidHash,
                type: getRecordType(record.recordTypeHash),
                title: `Hồ sơ #${record.id || index + 1}`,
                date: new Date(record.createdAt).toLocaleDateString('vi-VN'),
                doctor: record.createdBy ? `${record.createdBy.substring(0, 6)}...${record.createdBy.substring(38)}` : 'Unknown',
                verified: true,
                details: `CID Hash: ${record.cidHash?.substring(0, 20)}...`,
                ownerAddress: record.ownerAddress,
            }));

            setRecords(transformedRecords);
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
        // In real app, map hashes to types
        const types = ['Diagnosis', 'Prescription', 'Lab', 'X-Ray', 'Checkup'];
        const index = parseInt(typeHash.substring(2, 4), 16) % types.length;
        return types[index];
    };

    // Load records on mount
    useEffect(() => {
        fetchRecords();
    }, []);

    // Handlers
    const handleViewDetails = (record) => {
        setSelectedRecord(record);
        setIsModalOpen(true);
    };

    const handleRevoke = (id) => {
        setAccessList(prev => prev.filter(item => item.id !== id));
        toast({
            title: "Đã thu hồi quyền truy cập",
            description: "Quyền truy cập của bác sĩ đã bị thu hồi.",
            variant: "destructive",
        });
    };

    const handleGrantAccess = (data) => {
        toast({
            title: "Đã cấp quyền truy cập",
            description: `Đã cấp quyền cho ${data.address.substring(0, 6)}... trong ${data.duration.replace('_', ' ')}.`,
            className: "bg-green-50 border-green-200 text-green-800",
        });
    };

    const handleApproveRequest = (id) => {
        setRequests(prev => prev.filter(req => req.id !== id));
        toast({
            title: "Đã duyệt yêu cầu",
            description: "Quyền truy cập đã được cấp cho người yêu cầu.",
            className: "bg-green-50 border-green-200 text-green-800",
        });
    };

    const handleRejectRequest = (id) => {
        setRequests(prev => prev.filter(req => req.id !== id));
        toast({
            title: "Đã từ chối yêu cầu",
            description: "Yêu cầu truy cập đã bị từ chối.",
            variant: "destructive",
        });
    };

    const handleUploadSuccess = () => {
        setIsUploadModalOpen(false);
        fetchRecords(); // Refresh list
        toast({
            title: "Tải lên thành công",
            description: "Hồ sơ y tế đã được lưu an toàn.",
            className: "bg-green-50 border-green-200 text-green-800",
        });
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Cổng thông tin Sức khỏe</h1>
                <p className="text-slate-500 mt-2">Quản lý hồ sơ y tế và quyền truy cập một cách an toàn.</p>
            </div>

            <Tabs defaultValue="records" className="space-y-6">
                <TabsList className="bg-white border border-slate-200 p-1 rounded-xl w-full sm:w-auto grid grid-cols-3 sm:flex h-auto">
                    <TabsTrigger value="records" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                        Hồ sơ của tôi
                    </TabsTrigger>
                    <TabsTrigger value="access" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                        Quản lý truy cập
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 relative">
                        Yêu cầu
                        {requests.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full">
                                {requests.length}
                            </span>
                        )}
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
                            onClick={() => setIsUploadModalOpen(true)}
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
                            <Button onClick={() => setIsUploadModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
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

                {/* Tab 2: Access Control */}
                <TabsContent value="access" className="outline-none">
                    <div className="grid lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="mb-4">
                                <h2 className="text-xl font-semibold text-slate-900">Quyền truy cập đang hoạt động</h2>
                                <p className="text-slate-500 text-sm">Bác sĩ và tổ chức có thể xem hồ sơ của bạn.</p>
                            </div>
                            <div className="space-y-4">
                                {accessList.map(access => (
                                    <AccessListItem
                                        key={access.id}
                                        access={access}
                                        onRevoke={handleRevoke}
                                    />
                                ))}
                                {accessList.length === 0 && (
                                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                        <p className="text-slate-500">Chưa cấp quyền truy cập cho ai.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <GrantAccessForm onGrant={handleGrantAccess} />
                        </div>
                    </div>
                </TabsContent>

                {/* Tab 3: Requests */}
                <TabsContent value="requests" className="outline-none">
                    <div className="max-w-2xl">
                        <div className="mb-6">
                            <h2 className="text-xl font-semibold text-slate-900">Yêu cầu đang chờ</h2>
                            <p className="text-slate-500 text-sm">Xem xét yêu cầu từ nhà cung cấp dịch vụ y tế.</p>
                        </div>
                        <div className="space-y-4">
                            {requests.map(req => (
                                <RequestItem
                                    key={req.id}
                                    request={req}
                                    onApprove={handleApproveRequest}
                                    onReject={handleRejectRequest}
                                />
                            ))}
                            {requests.length === 0 && (
                                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                    <p className="text-slate-500">Không có yêu cầu truy cập nào đang chờ.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            <RecordModal
                record={selectedRecord}
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
            />

            <UploadRecordModal
                open={isUploadModalOpen}
                onOpenChange={setIsUploadModalOpen}
                onSuccess={handleUploadSuccess}
            />
        </div>
    );
};

export default PatientDashboard;
