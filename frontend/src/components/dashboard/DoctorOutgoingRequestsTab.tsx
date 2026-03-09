import React, { useState } from 'react';
import { Send, RefreshCw, Loader2, FileText, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserName from '@/components/ui/UserName';

interface DoctorOutgoingRequestsTabProps {
    requests: any[];
    onRefresh: () => void;
}

const DoctorOutgoingRequestsTab: React.FC<DoctorOutgoingRequestsTabProps> = ({
    requests,
    onRefresh
}) => {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await onRefresh();
        } finally {
            setIsRefreshing(false);
        }
    };

    return (
        <Card className="bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-slate-900 flex items-center gap-2">
                    <Send className="w-5 h-5 text-teal-600" />
                    Yêu cầu đã gửi
                </CardTitle>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
            </CardHeader>
            <CardContent>
                {requests.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl">
                        <Send className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500">Chưa có yêu cầu truy cập nào.</p>
                        <p className="text-sm text-slate-400 mt-2">Các yêu cầu bạn gửi đến bệnh nhân sẽ xuất hiện ở đây.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {requests.map((req) => (
                            <div key={req.id} className="p-4 border border-slate-200 rounded-xl hover:border-teal-200 transition-all bg-white relative group">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-normal">
                                                <User className="w-3 h-3 mr-1" />
                                                <UserName address={req.patientAddress} />
                                            </Badge>
                                            <span className="text-slate-300">|</span>
                                            <span className="text-xs text-slate-500">
                                                {new Date(req.createdAt).toLocaleDateString('vi-VN')}
                                            </span>
                                        </div>

                                        <div className="flex items-start gap-3 mt-2">
                                            <div className="mt-1 bg-teal-50 p-2 rounded-lg text-teal-600">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-900">
                                                    {req.recordTitle || req.title || (req.cidHash ? `Hồ sơ ${req.cidHash.slice(0, 8)}...` : 'Yêu cầu truy cập chung')}
                                                </p>
                                                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                                    <span className="flex items-center gap-1" title="Thời hạn hiệu lực">
                                                        <Clock className="w-3 h-3" />
                                                        {req.deadline ? `Hết hạn: ${new Date(req.deadline).toLocaleDateString('vi-VN')}` : 'Không thời hạn'}
                                                    </span>
                                                    {req.type !== undefined && (
                                                        <span className="bg-slate-100 px-1.5 py-0.5 rounded">
                                                            {req.type === 0 ? 'Xem trực tiếp' : req.type === 2 ? 'Ủy quyền' : 'Loại khác'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-2">
                                        <Badge className={`px-2.5 py-1 ${req.status === 'claimed' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' :
                                            req.status === 'approved' ? 'bg-green-100 text-green-700 hover:bg-green-100' :
                                                req.status === 'rejected' ? 'bg-red-100 text-red-700 hover:bg-red-100' :
                                                    'bg-yellow-100 text-yellow-700 hover:bg-yellow-100 animate-pulse'
                                            }`}>
                                            {req.status === 'claimed' ? 'Đã nhận' :
                                                req.status === 'approved' ? 'Đã duyệt' :
                                                    req.status === 'rejected' ? 'Đã từ chối' : 'Đang chờ duyệt'}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default DoctorOutgoingRequestsTab;
