"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, ChevronUp, GitBranch, File, ArrowRight } from 'lucide-react';
import { recordService } from '@/services';

/**
 * RecordChainView - Display parent-child record hierarchy
 * Shows the version chain of a record
 */
const RecordChainView = ({ cidHash, onNavigate }) => {
    const [chainData, setChainData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(true);

    useEffect(() => {
        if (!cidHash) return;

        const fetchChain = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await recordService.getRecordChain(cidHash);
                setChainData(data);
            } catch (err) {
                console.error('Error fetching record chain:', err);
                setError('Không thể tải chuỗi hồ sơ');
            } finally {
                setLoading(false);
            }
        };

        fetchChain();
    }, [cidHash]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                <span className="ml-2 text-sm text-slate-500">Đang tải...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center text-red-500 py-4 text-sm">
                {error}
            </div>
        );
    }

    if (!chainData) return null;

    const { current, parent, children, version, hasParent, hasChildren } = chainData;

    // If no chain relationships, show minimal info
    if (!hasParent && !hasChildren) {
        return (
            <div className="p-4 bg-slate-50 rounded-xl text-center text-sm text-slate-500">
                <GitBranch className="w-5 h-5 mx-auto mb-2 text-slate-400" />
                Đây là hồ sơ gốc, chưa có bản cập nhật.
            </div>
        );
    }

    return (
        <div className="p-4 bg-gradient-to-b from-blue-50 to-slate-50 rounded-xl border border-blue-100">
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-between w-full text-left"
            >
                <div className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-slate-800">Chuỗi hồ sơ</span>
                    <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                        Phiên bản {version}
                    </Badge>
                </div>
                {expanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
            </button>

            {expanded && (
                <div className="mt-4 space-y-3">
                    {/* Parent Record */}
                    {parent && (
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center text-xs font-medium text-slate-600">
                                {version - 1}
                            </div>
                            <div
                                className="flex-1 p-3 bg-white rounded-lg border border-slate-200 hover:border-blue-300 cursor-pointer transition-colors"
                                onClick={() => onNavigate?.(parent.cidHash)}
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-slate-700 text-sm">
                                            {parent.title || 'Hồ sơ gốc'}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {new Date(parent.createdAt).toLocaleDateString('vi-VN')}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="text-xs">Cha</Badge>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Chain connector */}
                    {parent && (
                        <div className="flex items-center pl-3">
                            <div className="w-0.5 h-4 bg-blue-300 ml-2.5" />
                            <ArrowRight className="w-3 h-3 text-blue-400 ml-4" />
                        </div>
                    )}

                    {/* Current Record */}
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                            {version}
                        </div>
                        <div className="flex-1 p-3 bg-blue-100 rounded-lg border-2 border-blue-400">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold text-blue-800 text-sm">
                                        {current.title || 'Hồ sơ hiện tại'}
                                    </p>
                                    <p className="text-xs text-blue-600">
                                        {new Date(current.createdAt).toLocaleDateString('vi-VN')}
                                    </p>
                                </div>
                                <Badge className="bg-blue-500 text-white text-xs">Đang xem</Badge>
                            </div>
                        </div>
                    </div>

                    {/* Chain connector for children */}
                    {hasChildren && (
                        <div className="flex items-center pl-3">
                            <div className="w-0.5 h-4 bg-green-300 ml-2.5" />
                            <ArrowRight className="w-3 h-3 text-green-400 ml-4" />
                        </div>
                    )}

                    {/* Children Records */}
                    {children.map((child, index) => (
                        <div key={child.cidHash} className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-xs font-medium text-green-700 border border-green-300">
                                {version + 1 + index}
                            </div>
                            <div
                                className="flex-1 p-3 bg-white rounded-lg border border-green-200 hover:border-green-400 cursor-pointer transition-colors"
                                onClick={() => onNavigate?.(child.cidHash)}
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium text-slate-700 text-sm">
                                            {child.title || `Cập nhật #${index + 1}`}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {new Date(child.createdAt).toLocaleDateString('vi-VN')}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                                        Con
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default RecordChainView;
