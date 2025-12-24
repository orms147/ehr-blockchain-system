"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Users, ShieldX, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { recordService } from '@/services';

/**
 * AccessManagementTab - Shows who has access to a record and allows owner to revoke
 * Only visible to record owner (Patient)
 */
const AccessManagementTab = ({ record, currentUserAddress, onAccessRevoked }) => {
    const [accessList, setAccessList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [revoking, setRevoking] = useState(null); // address being revoked

    const isOwner = record?.ownerAddress?.toLowerCase() === currentUserAddress?.toLowerCase();

    // Debug ownership check
    console.log('AccessManagement - Owner check:', {
        recordOwner: record?.ownerAddress?.toLowerCase(),
        currentUser: currentUserAddress?.toLowerCase(),
        isOwner
    });

    const loadAccessList = async () => {
        if (!record?.cidHash || !isOwner) return;

        setLoading(true);
        setError(null);
        try {
            const response = await recordService.getAccessList(record.cidHash);
            setAccessList(response.accessList || []);
        } catch (err) {
            console.error('Failed to load access list:', err);
            if (err.message?.includes('403')) {
                setError('Chỉ chủ sở hữu mới có thể xem danh sách quyền truy cập');
            } else {
                setError('Không thể tải danh sách quyền truy cập');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAccessList();
    }, [record?.cidHash, isOwner]);

    const handleRevoke = async (targetAddress) => {
        if (!confirm(`Bạn có chắc muốn thu hồi quyền truy cập của ${targetAddress.slice(0, 8)}...?`)) {
            return;
        }

        setRevoking(targetAddress);
        try {
            await recordService.revokeAccess(record.cidHash, targetAddress);

            toast({
                title: "Thu hồi thành công!",
                description: `Đã thu hồi quyền truy cập của ${targetAddress.slice(0, 10)}...`,
                className: "bg-green-50 border-green-200 text-green-800",
            });

            // Refresh list
            loadAccessList();

            if (onAccessRevoked) {
                onAccessRevoked(targetAddress);
            }
        } catch (err) {
            console.error('Revoke failed:', err);
            toast({
                title: "Lỗi thu hồi",
                description: err.message || "Không thể thu hồi quyền truy cập",
                variant: "destructive",
            });
        } finally {
            setRevoking(null);
        }
    };

    if (!isOwner) {
        return (
            <div className="text-center py-8 text-gray-500">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>Chỉ chủ sở hữu hồ sơ mới có thể quản lý quyền truy cập</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2">Đang tải...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8 text-red-500">
                <AlertCircle className="h-10 w-10 mx-auto mb-3" />
                <p>{error}</p>
                <Button variant="outline" size="sm" onClick={loadAccessList} className="mt-3">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Thử lại
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header with warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <strong>⚠️ Lưu ý:</strong> Thu hồi quyền sẽ ngăn truy cập trong tương lai.
                Dữ liệu đã được xem trước đó không thể thu hồi.
            </div>

            {/* Access list */}
            {accessList.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Chưa có ai được cấp quyền truy cập</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm text-gray-500 px-1">
                        <span>Địa chỉ</span>
                        <span>Hành động</span>
                    </div>

                    {accessList.map((access, idx) => {
                        const isCurrentUser = access.address?.toLowerCase() === currentUserAddress?.toLowerCase();
                        return (
                            <div
                                key={idx}
                                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border"
                            >
                                <div className="flex-1">
                                    <div className="font-mono text-sm">
                                        {access.address?.slice(0, 10)}...{access.address?.slice(-8)}
                                        {isCurrentUser && (
                                            <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                                Bạn
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Cấp ngày: {new Date(access.grantedAt).toLocaleDateString('vi-VN')}
                                    </div>
                                </div>

                                {!isCurrentUser && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleRevoke(access.address)}
                                        disabled={revoking === access.address}
                                    >
                                        {revoking === access.address ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <>
                                                <ShieldX className="h-4 w-4 mr-1" />
                                                Thu hồi
                                            </>
                                        )}
                                    </Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Refresh button */}
            <div className="text-center">
                <Button variant="ghost" size="sm" onClick={loadAccessList}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Làm mới
                </Button>
            </div>
        </div>
    );
};

export default AccessManagementTab;
