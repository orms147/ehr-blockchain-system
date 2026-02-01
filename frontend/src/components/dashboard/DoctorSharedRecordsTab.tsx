import React from 'react';
import { motion } from 'framer-motion';
import {
    FileText, Clock, Loader2, RefreshCw, Eye, EyeOff,
    Unlock, Lock, Edit, CheckCircle, XCircle, History as HistoryIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    // We trust that 'records' prop is already grouped/deduplicated by the parent (page.tsx)
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
                            {activeRecords.map((record: any) => {
                                const isExpired = record.expiresAt && new Date(record.expiresAt).getTime() <= new Date().getTime();

                                // Expiry logic display
                                let timeText = '';
                                if (record.expiresAt) {
                                    const now = new Date();
                                    const expiry = new Date(record.expiresAt);
                                    const diffMs = expiry.getTime() - now.getTime();

                                    const totalMinutes = Math.floor(diffMs / (1000 * 60));
                                    const diffDays = Math.floor((totalMinutes / (60 * 24)));
                                    const diffHours = Math.floor((totalMinutes % (60 * 24)) / 60);
                                    const diffMinutes = totalMinutes % 60;

                                    if (diffMs < 0) {
                                        timeText = 'Đã hết hạn';
                                    } else if (diffDays > 0) {
                                        timeText = `Còn ${diffDays} ngày ${diffHours} giờ`;
                                    } else if (diffHours > 0) {
                                        timeText = `Còn ${diffHours} giờ ${diffMinutes} phút`;
                                    } else if (diffMinutes > 0) {
                                        timeText = `Còn ${diffMinutes} phút`;
                                    } else {
                                        timeText = 'Sắp hết hạn';
                                    }
                                }

                                return (
                                    <div
                                        key={record.id}
                                        className={`p-4 border border-slate-200 rounded-xl transition-all bg-white relative group ${isExpired ? 'opacity-60 bg-slate-100' : 'hover:border-teal-300'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isExpired ? 'bg-slate-200' : 'bg-teal-100'}`}>
                                                    {isExpired ? (
                                                        <Clock className="w-6 h-6 text-slate-500" />
                                                    ) : record.status === 'claimed' ? (
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
                                                            <p className="text-xs text-teal-600 font-medium bg-teal-50 px-2 py-0.5 rounded-full w-fit mt-1">
                                                                🩺 Do bạn tạo
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <p className="font-medium text-slate-900">
                                                                Hồ sơ từ: {record.senderAddress?.slice(0, 8)}...{record.senderAddress?.slice(-6)}
                                                            </p>
                                                            <p className="text-xs text-blue-600 font-medium mt-1">
                                                                👤 Bệnh nhân chia sẻ
                                                            </p>
                                                        </>
                                                    )}

                                                    <p className="text-sm text-slate-500 mt-1">
                                                        CID: {record.cidHash?.slice(0, 16)}...
                                                    </p>
                                                    {/* Expiry Text */}
                                                    {record.expiresAt && (
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <p className={`text-xs font-medium ${timeText.includes('Còn 0') || timeText.includes('Sắp') ? 'text-orange-500' : 'text-green-600'}`}>
                                                                ⏱️ {timeText}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    className="bg-teal-600 hover:bg-teal-700"
                                                    size="sm"
                                                    onClick={() => onViewRecord(record)}
                                                    disabled={decrypting && selectedRecordId === record.id}
                                                >
                                                    {decrypting && selectedRecordId === record.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Eye className="w-4 h-4 mr-2" /> Xem
                                                        </>
                                                    )}
                                                </Button>

                                                {/* Calculate Reject Logic First to use in Update condition */}
                                                {(() => {
                                                    // FIX: Check if Root Record is Pending (Re-share Scenario)
                                                    const rootRecord = allRecords?.find(r => r.cidHash === record.rootCidHash);
                                                    const isRootPending = rootRecord && rootRecord.status !== 'claimed' && rootRecord.status !== 'revoked' && rootRecord.status !== 'rejected';
                                                    const isSelfPending = record.status !== 'claimed';
                                                    const hasPriorAccess = !isRootPending && allRecords?.some(hist =>
                                                        hist.status === 'claimed' && (
                                                            (hist.rootCidHash && hist.rootCidHash === record.rootCidHash) ||
                                                            (record.rootCidHash && hist.cidHash === record.rootCidHash)
                                                        )
                                                    );
                                                    const shouldShowReject = (isSelfPending || isRootPending) &&
                                                        record.senderAddress?.toLowerCase() !== walletAddress?.toLowerCase() &&
                                                        !hasPriorAccess;

                                                    return (
                                                        <>
                                                            {/* Update Button: HIDE if Reject is showing */}
                                                            {record.status === 'claimed' && !shouldShowReject && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                                                    onClick={() => onUpdateRecord(record)}
                                                                >
                                                                    <Edit className="w-4 h-4 mr-1" />
                                                                    Cập nhật
                                                                </Button>
                                                            )}

                                                            {/* Reject Button */}
                                                            {shouldShowReject && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => onRejectRecord(isRootPending ? rootRecord.id : record.id)}
                                                                    disabled={rejectingId === (isRootPending ? rootRecord.id : record.id)}
                                                                    className="border-red-300 text-red-600 hover:bg-red-50"
                                                                >
                                                                    {rejectingId === (isRootPending ? rootRecord.id : record.id) ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                                    ) : (
                                                                        <>
                                                                            <XCircle className="w-4 h-4 mr-1" />
                                                                            Từ chối
                                                                        </>
                                                                    )}
                                                                </Button>
                                                            )}
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 mt-3">
                                            {record.versionCount > 1 && (
                                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                    <HistoryIcon className="w-3 h-3 mr-1" />
                                                    {record.versionCount} phiên bản
                                                </Badge>
                                            )}
                                            <Badge
                                                variant={record.status === 'claimed' ? 'default' : 'secondary'}
                                                className={record.status === 'claimed' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : ''}
                                            >
                                                {record.status === 'claimed' ? 'Đã xem' : 'Chưa xem'}
                                            </Badge>
                                        </div>

                                        {/* Show decrypted content */}
                                        {selectedRecordId === record.id && decryptedContent && (
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
                                                        onClick={onHideRecord}
                                                        className="text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                                    >
                                                        {/* We need EyeOff icon here, check imports */}
                                                        <Eye className="w-4 h-4 mr-1" />
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

                                                {/* History Section */}
                                                {(record.versionCount > 1 || recordHistory.length > 0) && (
                                                    <div className="mt-4 pt-4 border-t border-slate-100">
                                                        <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                                            <HistoryIcon className="w-4 h-4 text-slate-500" />
                                                            Lịch sử phiên bản ({recordHistory.length || record.versionCount})
                                                        </h4>
                                                        {historyLoading ? (
                                                            <div className="flex justify-center p-4">
                                                                <Loader2 className="w-4 h-4 animate-spin text-teal-600" />
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-2 pr-2">
                                                                {Array.isArray(recordHistory) && recordHistory.map((histRecord: any, idx: number) => {
                                                                    // Safety check
                                                                    if (!histRecord || !histRecord.cidHash) return null;

                                                                    // Find KeyShare for this specific version from the FULL list
                                                                    const sourceList = Array.isArray(allRecords) ? allRecords : (Array.isArray(records) ? records : []);

                                                                    const matchingShare = sourceList.find(r =>
                                                                        r && r.cidHash && r.cidHash.toLowerCase() === histRecord.cidHash.toLowerCase()
                                                                    );

                                                                    const isCurrentView = selectedRecordId === matchingShare?.id;
                                                                    const isClickable = !!matchingShare;
                                                                    const reason = !matchingShare ? "Bạn chưa được chia sẻ phiên bản này" : "";

                                                                    return (
                                                                        <div
                                                                            key={histRecord.cidHash || idx}
                                                                            title={reason}
                                                                            className={`relative pl-8 pb-8 last:pb-0 ${isClickable ? 'cursor-pointer group' : 'opacity-60 cursor-not-allowed'
                                                                                }`}
                                                                            onClick={() => {
                                                                                if (isClickable && !isCurrentView) {
                                                                                    onViewRecord(matchingShare);
                                                                                }
                                                                            }}
                                                                        >
                                                                            {/* Timeline Connector */}
                                                                            <div className="absolute left-[11px] top-8 bottom-0 w-px bg-slate-200 group-last:hidden" />

                                                                            {/* Timeline Dot */}
                                                                            <div className={`absolute left-0 top-1 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center bg-white z-10 transition-colors ${isCurrentView
                                                                                ? 'border-blue-500 text-blue-500'
                                                                                : isClickable
                                                                                    ? 'border-slate-300 text-slate-400 group-hover:border-teal-500 group-hover:text-teal-500'
                                                                                    : 'border-slate-200 text-slate-300'
                                                                                }`}>
                                                                                <div className={`w-2 h-2 rounded-full ${isCurrentView ? 'bg-blue-500' : isClickable ? 'bg-slate-300 group-hover:bg-teal-500' : 'bg-slate-200'}`} />
                                                                            </div>

                                                                            {/* Content Card */}
                                                                            <div className={`p-3 rounded-lg border transition-all ${isCurrentView
                                                                                ? 'bg-blue-50 border-blue-200 shadow-sm'
                                                                                : isClickable
                                                                                    ? 'bg-white border-slate-100 hover:border-teal-200 hover:shadow-md'
                                                                                    : 'bg-slate-50 border-slate-100'
                                                                                }`}>
                                                                                <div className="flex justify-between items-start mb-1">
                                                                                    <div className="font-medium text-slate-900 text-sm truncate flex-1">
                                                                                        {histRecord.title || 'Không có tiêu đề'}
                                                                                    </div>

                                                                                    {/* Action Buttons */}
                                                                                    <div className="flex items-center gap-1">
                                                                                        {isClickable && !isCurrentView && (
                                                                                            <Button
                                                                                                size="sm"
                                                                                                variant="ghost"
                                                                                                className="h-6 px-2 text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                                                                                                onClick={(e) => {
                                                                                                    e.stopPropagation();
                                                                                                    onViewRecord(matchingShare);
                                                                                                }}
                                                                                            >
                                                                                                <Eye className="w-3 h-3 mr-1" /> Xem
                                                                                            </Button>
                                                                                        )}

                                                                                        {!isClickable && (
                                                                                            <Badge variant="outline" className="text-[10px] h-5 bg-slate-100 text-slate-500 border-slate-200">
                                                                                                <Lock className="w-3 h-3 mr-1" /> Không có quyền
                                                                                            </Badge>
                                                                                        )}

                                                                                        {isCurrentView && (
                                                                                            <Badge variant="outline" className="text-[10px] h-5 bg-blue-50 text-blue-700 border-blue-200">
                                                                                                Hiện tại
                                                                                            </Badge>
                                                                                        )}
                                                                                    </div>
                                                                                </div>

                                                                                <div className="text-xs text-slate-500 flex items-center gap-2">
                                                                                    <span>{new Date(histRecord.createdAt).toLocaleDateString('vi-VN')}</span>
                                                                                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                                                                        Ver {idx + 1}
                                                                                    </Badge>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default DoctorSharedRecordsTab;
