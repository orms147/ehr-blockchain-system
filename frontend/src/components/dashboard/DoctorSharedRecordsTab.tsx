import React, { useState, useEffect, useCallback, useMemo } from 'react';
import UserName from '@/components/ui/UserName';
import { motion } from 'framer-motion';
import {
    FileText, Clock, Loader2, RefreshCw, Eye, EyeOff,
    Unlock, Lock, Edit, CheckCircle, XCircle, History as HistoryIcon, MoreVertical, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface DoctorSharedRecordsTabProps {
    records: any[];
    allRecords?: any[];
    loading: boolean;
    onRefresh: () => void;
    walletAddress?: string;
    onViewRecord: (record: any) => void;
    decrypting: boolean;
    selectedRecordId?: string | null;
    onUpdateRecord: (record: any) => void;
    onRejectRecord: (id: string) => void;
    rejectingId?: string | null;
    decryptedContent: any;
    recordHistory: any[];
    historyLoading: boolean;
    onHideRecord: () => void;
}

const DoctorSharedRecordsTab: React.FC<DoctorSharedRecordsTabProps> = ({
    records,
    allRecords,
    loading,
    onRefresh,
    walletAddress,
    onViewRecord,
    decrypting,
    selectedRecordId,
    onUpdateRecord,
    onRejectRecord,
    rejectingId,
    decryptedContent,
    recordHistory,
    historyLoading,
    onHideRecord
}) => {
    // Filter active records (not expired)
    const activeRecords = React.useMemo(() => {
        return records.filter(r => r.active !== false);
    }, [records]);

    const springConfig = { type: "spring" as const, stiffness: 100, damping: 20 };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.4 }}
        >
            <Card className="bg-white">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-slate-900">Hồ sơ đang hiệu lực</CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRefresh}
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
                    ) : activeRecords.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-xl">
                            <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                            <p className="text-slate-500">Chưa có hồ sơ nào được chia sẻ với bạn.</p>
                            <p className="text-sm text-slate-400 mt-2">
                                Bệnh nhân cần cấp quyền truy cập trước khi bạn có thể xem hồ sơ.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {activeRecords.map((record: any) => (
                                <RecordCard
                                    key={record.id}
                                    record={record}
                                    onViewRecord={onViewRecord}
                                    decrypting={decrypting}
                                    selectedRecordId={selectedRecordId}
                                    onUpdateRecord={onUpdateRecord}
                                    onRejectRecord={onRejectRecord}
                                    rejectingId={rejectingId}
                                    decryptedContent={decryptedContent}
                                    recordHistory={recordHistory}
                                    historyLoading={historyLoading}
                                    onHideRecord={onHideRecord}
                                    allRecords={allRecords}
                                    walletAddress={walletAddress}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
};

// Extracted RecordCard Component
const RecordCard = ({
    record, onViewRecord, decrypting, selectedRecordId,
    onUpdateRecord, onRejectRecord, rejectingId, decryptedContent,
    recordHistory, historyLoading, onHideRecord, allRecords, walletAddress
}: any) => {
    const isSelected = selectedRecordId === record.id;
    const isDecryptingThis = decrypting && isSelected;
    const isRejectingThis = rejectingId === record.id;
    const isExpired = record.expiresAt && new Date(record.expiresAt).getTime() <= new Date().getTime();

    // Timer Logic
    const [timeText, setTimeText] = React.useState('');

    React.useEffect(() => {
        const updateTimer = () => {
            if (!record.expiresAt) return;
            const now = new Date();
            const expiry = new Date(record.expiresAt);
            const diffMs = expiry.getTime() - now.getTime();

            if (diffMs <= 0) {
                setTimeText('0 phút');
                return;
            }

            const totalMinutes = Math.floor(diffMs / (1000 * 60));
            const days = Math.floor(totalMinutes / (60 * 24));
            const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
            const minutes = totalMinutes % 60;

            if (days > 0) setTimeText(`${days} ngày ${hours} giờ`);
            else if (hours > 0) setTimeText(`${hours} giờ ${minutes} phút`);
            else setTimeText(`${minutes} phút`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, [record.expiresAt]);

    // Calculate Reject Logic First to use in Update condition
    const rootRecord = allRecords?.find((r: any) => r.cidHash === record.rootCidHash);
    const isRootPending = rootRecord && rootRecord.status !== 'claimed' && rootRecord.status !== 'revoked' && rootRecord.status !== 'rejected';
    const isSelfPending = record.status !== 'claimed';
    const hasPriorAccess = !isRootPending && allRecords?.some((hist: any) =>
        hist.status === 'claimed' && (
            (hist.rootCidHash && hist.rootCidHash === record.rootCidHash) ||
            (record.rootCidHash && hist.cidHash === record.rootCidHash)
        )
    );
    const shouldShowReject = (isSelfPending || isRootPending) &&
        record.senderAddress?.toLowerCase() !== walletAddress?.toLowerCase() &&
        !hasPriorAccess;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`group relative bg-white rounded-xl border transition-all duration-200 ${isSelected ? 'border-teal-500 ring-1 ring-teal-500 shadow-md' : 'border-slate-200 hover:border-teal-300 hover:shadow-sm'}`}
        >
            <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4">
                    {/* Icon & Title */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className={`mt-1 w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-500'}`}>
                            <FileText className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-slate-900 truncate">
                                    {record.record?.title || 'Hồ sơ y tế'}
                                </h3>
                                {record.versionCount > 1 && (
                                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] h-5 px-1.5 gap-1">
                                        v{record.versionCount}
                                    </Badge>
                                )}
                                {record.status === 'pending' && (
                                    <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">Mới</Badge>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                                <span className="flex items-center gap-1.5" title="Bệnh nhân">
                                    <Users className="w-3.5 h-3.5" />
                                    <UserName address={record.senderAddress} />
                                </span>
                                {record.expiresAt && (
                                    <span className={`flex items-center gap-1.5 ${isExpired ? 'text-red-500' : 'text-orange-600'}`}>
                                        <Clock className="w-3.5 h-3.5" />
                                        {isExpired ? 'Đã hết hạn' : `Còn lại: ${timeText}`}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-start">
                        {/* Primary Action: View */}
                        {!isSelected ? (
                            <Button
                                size="sm"
                                onClick={() => onViewRecord(record)}
                                disabled={decrypting || isExpired}
                                className={`h-8 px-3 gap-1.5 transition-all ${record.status === 'pending'
                                    ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm shadow-orange-200'
                                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300'}`}
                            >
                                {record.status === 'pending' ? <Unlock className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                <span className="hidden sm:inline">{record.status === 'pending' ? 'Mở khóa' : 'Xem'}</span>
                            </Button>
                        ) : (
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100 rounded-full" onClick={onHideRecord}>
                                <XCircle className="w-5 h-5" />
                            </Button>
                        )}

                        {/* More Actions Menu */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600">
                                    <MoreVertical className="w-4 h-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => onViewRecord(record)} disabled={isSelected}>
                                    <Eye className="w-4 h-4 mr-2" /> Xem chi tiết
                                </DropdownMenuItem>
                                {record.status === 'claimed' && !shouldShowReject && (
                                    <DropdownMenuItem onClick={() => onUpdateRecord(record)}>
                                        <Edit className="w-4 h-4 mr-2" /> Cập nhật hồ sơ
                                    </DropdownMenuItem>
                                )}
                                {shouldShowReject && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-red-600 focus:text-red-700 focus:bg-red-50"
                                            onClick={() => onRejectRecord(isRootPending ? rootRecord.id : record.id)}
                                            disabled={isRejectingThis}
                                        >
                                            <XCircle className="w-4 h-4 mr-2" />
                                            {isRejectingThis ? 'Đang từ chối...' : 'Từ chối quyền'}
                                        </DropdownMenuItem>
                                    </>
                                )}
                                {isSelected && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={onHideRecord}>
                                            <EyeOff className="w-4 h-4 mr-2" /> Ẩn chi tiết
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* Expanded Content */}
                {isSelected && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 pt-4 border-t border-slate-100"
                    >
                        {isDecryptingThis ? (
                            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                                <Loader2 className="w-8 h-8 animate-spin text-teal-500 mb-2" />
                                <p>Đang giải mã dữ liệu an toàn...</p>
                            </div>
                        ) : decryptedContent ? (
                            <div className="space-y-4">
                                {/* Metadata grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg">
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase font-medium mb-1">Loại hồ sơ</span>
                                        <span className="font-medium text-slate-900">{decryptedContent.meta?.type || 'Chưa xác định'}</span>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 block text-xs uppercase font-medium mb-1">Ngày tạo</span>
                                        <span className="font-medium text-slate-900">{new Date(record.createdAt).toLocaleDateString('vi-VN')}</span>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <span className="text-slate-500 block text-xs uppercase font-medium mb-1">Ghi chú bác sĩ</span>
                                        <p className="text-slate-900 whitespace-pre-wrap">{decryptedContent.notes || 'Không có ghi chú'}</p>
                                    </div>
                                </div>

                                {/* Attachment Preview */}
                                {decryptedContent.attachment && (
                                    <div className="border rounded-lg overflow-hidden bg-slate-900">
                                        <div className="bg-slate-800 px-3 py-2 text-xs text-slate-400 flex justify-between items-center">
                                            <span>Đính kèm hình ảnh</span>
                                            <Button variant="ghost" size="sm" className="h-6 text-xs hover:text-white" onClick={() => window.open(decryptedContent.attachment.data, '_blank')}>
                                                Mở thẻ mới
                                            </Button>
                                        </div>
                                        <div className="relative min-h-[200px] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
                                            {decryptedContent.attachment.contentType?.startsWith('image/') ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={`data:${decryptedContent.attachment.contentType};base64,${decryptedContent.attachment.data}`}
                                                    alt="Medical Record"
                                                    className="max-w-full max-h-[500px] object-contain mx-auto rounded shadow-lg"
                                                />
                                            ) : (
                                                <div className="p-8 text-center text-slate-400">
                                                    <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                                    <p>Định dạng tệp tin: {decryptedContent.attachment.contentType}</p>
                                                    <Button variant="secondary" className="mt-2" onClick={() => {
                                                        const link = document.createElement('a');
                                                        link.href = `data:${decryptedContent.attachment.contentType};base64,${decryptedContent.attachment.data}`;
                                                        link.download = `medical-record-${record.id}`;
                                                        link.click();
                                                    }}>
                                                        Tải xuống
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* FHIR JSON Toggle */}
                                {decryptedContent.entry && (
                                    <details className="mt-3 group">
                                        <summary className="cursor-pointer text-sm font-medium text-teal-700 hover:text-teal-800 flex items-center gap-2 select-none">
                                            <div className="w-4 h-4 border border-teal-600 rounded flex items-center justify-center text-[10px] group-open:bg-teal-600 group-open:text-white transition-colors">
                                                JSON
                                            </div>
                                            Xem dữ liệu chuẩn FHIR
                                        </summary>
                                        <pre className="mt-3 text-xs bg-slate-900 text-slate-50 p-4 rounded-lg overflow-x-auto font-mono custom-scrollbar border border-slate-700">
                                            {JSON.stringify(decryptedContent.entry, null, 2)}
                                        </pre>
                                    </details>
                                )}

                                {/* Version History */}
                                {(record.versionCount > 1 || recordHistory.length > 0) && (
                                    <div className="mt-6 pt-6 border-t border-slate-200">
                                        <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                            <HistoryIcon className="w-4 h-4 text-slate-500" />
                                            Lịch sử phiên bản
                                        </h4>
                                        {historyLoading ? (
                                            <div className="flex justify-center p-4">
                                                <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
                                            </div>
                                        ) : (
                                            <div className="space-y-1 relative pl-2">
                                                <div className="absolute left-[21px] top-2 bottom-4 w-px bg-slate-200" />
                                                {Array.isArray(recordHistory) && recordHistory.map((histRecord: any, idx: number) => {
                                                    const sourceList = Array.isArray(allRecords) ? allRecords : [];
                                                    const matchingShare = sourceList.find(r =>
                                                        r && r.cidHash && r.cidHash.toLowerCase() === histRecord.cidHash.toLowerCase()
                                                    );
                                                    const isCurrentView = selectedRecordId === matchingShare?.id;
                                                    const isClickable = !!matchingShare;

                                                    return (
                                                        <div key={histRecord.cidHash || idx} className="relative pl-8 py-2 group">
                                                            {/* Dot */}
                                                            <div className={`absolute left-[14px] top-4 w-3.5 h-3.5 rounded-full border-2 z-10 transition-colors ${isCurrentView ? 'bg-blue-500 border-white ring-2 ring-blue-100' : isClickable ? 'bg-white border-slate-300 group-hover:border-teal-400' : 'bg-slate-100 border-slate-200'}`} />

                                                            <div
                                                                className={`p-3 rounded-lg border transition-all text-sm ${isCurrentView ? 'bg-blue-50 border-blue-200' : isClickable ? 'bg-white border-slate-200 hover:border-teal-300 hover:shadow-sm cursor-pointer' : 'bg-slate-50 border-slate-100 opacity-60'}`}
                                                                onClick={() => isClickable && !isCurrentView && onViewRecord(matchingShare)}
                                                            >
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <span className="font-medium text-slate-900">{histRecord.title || 'Bản cập nhật'}</span>
                                                                    <span className="text-xs text-slate-500">{new Date(histRecord.createdAt).toLocaleDateString('vi-VN')}</span>
                                                                </div>
                                                                {isCurrentView && <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">Đang xem</Badge>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-500">
                                <p>Không thể hiển thị nội dung.</p>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
};

export default DoctorSharedRecordsTab;
