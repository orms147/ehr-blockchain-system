"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    History,
    Eye,
    Share2,
    Key,
    XCircle,
    Upload,
    RefreshCw,
    Clock,
    User,
    FileText,
    AlertCircle
} from 'lucide-react';
import { accessLogService } from '@/services';

// Map action to Vietnamese and icon
const getActionInfo = (action) => {
    const actionMap = {
        'UPLOAD_RECORD': { label: 'Tải lên hồ sơ', icon: Upload, color: 'bg-blue-100 text-blue-700' },
        'VIEW_RECORD': { label: 'Xem hồ sơ', icon: Eye, color: 'bg-green-100 text-green-700' },
        'SHARE_KEY': { label: 'Chia sẻ key', icon: Share2, color: 'bg-purple-100 text-purple-700' },
        'CLAIM_KEY': { label: 'Nhận key', icon: Key, color: 'bg-teal-100 text-teal-700' },
        'REVOKE_ACCESS': { label: 'Thu hồi quyền', icon: XCircle, color: 'bg-red-100 text-red-700' },
        'ACCESS_FULL': { label: 'Truy cập toàn bộ', icon: Eye, color: 'bg-orange-100 text-orange-700' },
        'VIEW_METADATA': { label: 'Xem thông tin', icon: FileText, color: 'bg-slate-100 text-slate-700' },
    };
    return actionMap[action] || { label: action, icon: History, color: 'bg-slate-100 text-slate-700' };
};

const formatAddress = (address) => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
};

const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const AccessLogTab = ({ records = [] }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedRecord, setSelectedRecord] = useState(null);

    // Fetch logs for all records owned by patient
    const fetchAllLogs = async () => {
        console.log('[AccessLogTab] fetchAllLogs called, records:', records.length);
        if (!records.length) {
            console.log('[AccessLogTab] No records to fetch logs for');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Fetch logs for each record
            const allLogs = [];
            for (const record of records) {
                console.log('[AccessLogTab] Fetching logs for cidHash:', record.cidHash);
                try {
                    const recordLogs = await accessLogService.getRecordLogs(record.cidHash);
                    console.log('[AccessLogTab] Got', recordLogs.length, 'logs for', record.cidHash);
                    // Add record title to each log
                    recordLogs.forEach(log => {
                        log.recordTitle = record.title || 'Hồ sơ không tên';
                    });
                    allLogs.push(...recordLogs);
                } catch (err) {
                    // Skip records that fail (might not be owned)
                    console.warn(`[AccessLogTab] Failed to fetch logs for ${record.cidHash}:`, err.message, err.response?.status);
                }
            }

            // Sort by time descending
            allLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setLogs(allLogs);
        } catch (err) {
            setError('Không thể tải lịch sử truy cập');
            console.error('Fetch logs error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllLogs();
    }, [records]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mr-2" />
                <span className="text-slate-600">Đang tải lịch sử truy cập...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-slate-600">{error}</p>
                <Button variant="outline" onClick={fetchAllLogs} className="mt-4">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Thử lại
                </Button>
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="text-center py-12">
                <History className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 font-medium">Chưa có lịch sử truy cập</p>
                <p className="text-sm text-slate-400 mt-1">
                    Lịch sử sẽ hiển thị khi có người truy cập hồ sơ của bạn
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-slate-900">Lịch sử truy cập</h3>
                    <p className="text-sm text-slate-500">{logs.length} hoạt động được ghi nhận</p>
                </div>
                <Button variant="outline" size="sm" onClick={fetchAllLogs} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Làm mới
                </Button>
            </div>

            {/* Log list */}
            <div className="h-[500px] overflow-y-auto">
                <div className="space-y-3">
                    {logs.map((log, index) => {
                        const actionInfo = getActionInfo(log.action);
                        const ActionIcon = actionInfo.icon;

                        return (
                            <Card key={log.id || index} className="border-slate-200">
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-4">
                                        {/* Icon */}
                                        <div className={`p-2 rounded-lg ${actionInfo.color}`}>
                                            <ActionIcon className="w-5 h-5" />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="secondary" className={actionInfo.color}>
                                                    {actionInfo.label}
                                                </Badge>
                                                {log.consentVerified && (
                                                    <Badge variant="outline" className="text-green-600 border-green-300">
                                                        ✓ On-chain verified
                                                    </Badge>
                                                )}
                                            </div>

                                            <p className="text-sm text-slate-900 font-medium truncate" title={log.recordTitle}>
                                                📄 {log.recordTitle}
                                            </p>

                                            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <User className="w-3 h-3" />
                                                    {formatAddress(log.accessorAddress)}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatTime(log.createdAt)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AccessLogTab;
