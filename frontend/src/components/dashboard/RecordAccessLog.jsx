"use client";

import React, { useState, useEffect } from 'react';
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
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { accessLogService } from '@/services';

// Compact access log display for RecordModal
const getActionInfo = (action) => {
    const actionMap = {
        'UPLOAD_RECORD': { label: 'Tải lên', icon: Upload, color: 'text-blue-600' },
        'VIEW_RECORD': { label: 'Xem', icon: Eye, color: 'text-green-600' },
        'SHARE_KEY': { label: 'Chia sẻ', icon: Share2, color: 'text-purple-600' },
        'CLAIM_KEY': { label: 'Nhận key', icon: Key, color: 'text-teal-600' },
        'REVOKE_ACCESS': { label: 'Thu hồi', icon: XCircle, color: 'text-red-600' },
        'ACCESS_FULL': { label: 'Truy cập', icon: Eye, color: 'text-orange-600' },
    };
    return actionMap[action] || { label: action, icon: History, color: 'text-slate-600' };
};

const formatAddress = (address) => {
    if (!address) return 'Unknown';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const RecordAccessLog = ({ cidHash }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [error, setError] = useState(null);

    const fetchLogs = async () => {
        if (!cidHash) return;

        setLoading(true);
        setError(null);

        try {
            const data = await accessLogService.getRecordLogs(cidHash);
            setLogs(data);
        } catch (err) {
            // User might not be owner - that's OK
            if (err.response?.status === 403) {
                setError('Chỉ chủ sở hữu mới có thể xem lịch sử');
            } else {
                setError('Không thể tải lịch sử');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (expanded && logs.length === 0) {
            fetchLogs();
        }
    }, [expanded, cidHash]);

    return (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Header - clickable to expand */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-purple-500" />
                    <span className="font-medium text-slate-700 text-sm">Lịch sử truy cập</span>
                    {logs.length > 0 && (
                        <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">
                            {logs.length}
                        </Badge>
                    )}
                </div>
                {expanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
            </button>

            {/* Content */}
            {expanded && (
                <div className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-4">
                            <RefreshCw className="w-4 h-4 animate-spin text-slate-400 mr-2" />
                            <span className="text-sm text-slate-500">Đang tải...</span>
                        </div>
                    ) : error ? (
                        <p className="text-sm text-slate-500 text-center py-2">{error}</p>
                    ) : logs.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-2">Chưa có lịch sử truy cập</p>
                    ) : (
                        logs.slice(0, 10).map((log, index) => {
                            const actionInfo = getActionInfo(log.action);
                            const ActionIcon = actionInfo.icon;

                            return (
                                <div
                                    key={log.id || index}
                                    className="flex items-center gap-3 text-sm py-1.5 border-b border-slate-100 last:border-0"
                                >
                                    <ActionIcon className={`w-4 h-4 ${actionInfo.color} flex-shrink-0`} />
                                    <span className={`font-medium ${actionInfo.color}`}>
                                        {actionInfo.label}
                                    </span>
                                    <span className="text-slate-500 flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {formatAddress(log.accessorAddress)}
                                    </span>
                                    <span className="text-slate-400 flex items-center gap-1 ml-auto">
                                        <Clock className="w-3 h-3" />
                                        {formatTime(log.createdAt)}
                                    </span>
                                </div>
                            );
                        })
                    )}

                    {logs.length > 10 && (
                        <p className="text-xs text-slate-400 text-center pt-1">
                            ... và {logs.length - 10} mục khác
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default RecordAccessLog;
