import React from 'react';
import { Send, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DoctorOutgoingRequestsTabProps {
    requests: any[];
    onRefresh: () => void;
}

const DoctorOutgoingRequestsTab: React.FC<DoctorOutgoingRequestsTabProps> = ({
    requests,
    onRefresh
}) => {
    return (
        <Card className="bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-slate-900">Yêu cầu đã gửi</CardTitle>
                <Button variant="ghost" size="sm" onClick={onRefresh}>
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </CardHeader>
            <CardContent>
                {requests.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-xl">
                        <Send className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500">Chưa có yêu cầu nào.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {requests.map((req) => (
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
    );
};

export default DoctorOutgoingRequestsTab;
