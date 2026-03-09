import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Clock, Loader2, RefreshCw, Lock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserName from '@/components/ui/UserName';

interface DoctorExpiredRecordsTabProps {
    records: any[];
    loading: boolean;
    onRefresh: () => void;
    walletAddress?: string;
}

const DoctorExpiredRecordsTab: React.FC<DoctorExpiredRecordsTabProps> = ({
    records,
    loading,
    onRefresh,
    walletAddress
}) => {
    // Filter expired records
    // Assume parent passes either all or pre-filtered. 
    // Consistent with SharedTab, let's filter here to be safe if parent passes all, or just assume input is correct.
    // Parent logic: expiredShared = sharedRecords.filter((r: any) => r.active === false);
    // Let's assume we filter here to be robust.
    const expiredRecords = records.filter(r => r.active === false);

    const springConfig = { type: "spring" as const, stiffness: 100, damping: 20 };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: 0.4 }}
        >
            <Card className="bg-white">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-slate-900">Hồ sơ đã hết hạn</CardTitle>
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
                    ) : expiredRecords.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-xl">
                            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                            <p className="text-slate-500">Không có hồ sơ nào hết hạn.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {expiredRecords.map((record: any) => (
                                <div
                                    key={record.id}
                                    className="p-4 border border-slate-200 rounded-xl bg-slate-50 opacity-75"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center">
                                                <Lock className="w-6 h-6 text-slate-500" />
                                            </div>
                                            <div>
                                                {record.senderAddress?.toLowerCase() === walletAddress?.toLowerCase() ? (
                                                    <p className="font-medium text-slate-900">
                                                        Hồ sơ bạn tạo (Đã hết hạn)
                                                    </p>
                                                ) : (
                                                    <p className="font-medium text-slate-900">
                                                        Từ: <UserName address={record.senderAddress} />
                                                    </p>
                                                )}

                                                <p className="text-sm text-slate-500 mt-1">
                                                    CID: {record.cidHash?.slice(0, 16)}...
                                                </p>

                                                <div className="flex items-center gap-1 mt-1">
                                                    <p className="text-xs font-bold text-red-500 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        Đã hết hạn truy cập
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <Button
                                            disabled
                                            size="sm"
                                            className="bg-slate-300 text-slate-500 cursor-not-allowed"
                                        >
                                            <Lock className="w-4 h-4 mr-2" /> Đã khóa
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
};

export default DoctorExpiredRecordsTab;
