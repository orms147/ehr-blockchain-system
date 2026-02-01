"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Users, ShieldX, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { recordService } from '@/services';
import { useWalletAddress } from '@/hooks/useWalletAddress';

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

    const { provider, address: walletAddress } = useWalletAddress();
    // Ensure we have correct chain config
    const [isRevokingOnChain, setIsRevokingOnChain] = useState(false);

    const handleRevoke = async (targetAddress) => {
        if (!confirm(`Bạn có chắc muốn thu hồi quyền truy cập của ${targetAddress.slice(0, 8)}...?`)) {
            return;
        }

        setRevoking(targetAddress);

        // RESOLVE ROOT CID: Access is typically granted on the Root.
        let effectiveRootCidHash = record.cidHash;

        try {
            const chainData = await recordService.getChainCids(record.cidHash);
            if (chainData && chainData.rootCidHash && chainData.rootCidHash !== '0x') {
                effectiveRootCidHash = chainData.rootCidHash;
                console.log(`[Revoke] Resolved Root CID: ${effectiveRootCidHash} (from ${record.cidHash})`);
            }
        } catch (chainErr) {
            console.warn('[Revoke] Failed to resolve chain, defaulting to current CID:', chainErr);
        }

        try {
            // 1. Try Backend API first (Sponsored Revocation)
            await recordService.revokeAccess(effectiveRootCidHash, targetAddress);

            toast({
                title: "Thu hồi thành công!",
                description: `Đã thu hồi quyền truy cập (Được tài trợ phí gas).`,
                className: "bg-green-50 border-green-200 text-green-800",
            });

            loadAccessList();
            if (onAccessRevoked) onAccessRevoked(targetAddress);

        } catch (err) {
            console.warn("Sponsored revoke failed, checking quota...", err);

            // 2. Check for Quota Exhaustion (402)
            const isQuotaError = err.response?.status === 402 ||
                err.message?.includes('Quota') ||
                err.message?.includes('402');

            if (isQuotaError) {
                if (confirm("Bạn đã hết lượt thu hồi miễn phí. Bạn có muốn tự trả phí gas (ETH Arbitrum Sepolia) để tiếp tục?")) {
                    setIsRevokingOnChain(true);
                    try {
                        // Fallback: Revoke directly on Blockchain
                        if (provider) {
                            const { createWalletClient, createPublicClient, custom, http } = await import('viem');
                            const { arbitrumSepolia } = await import('viem/chains');
                            const { ensureCorrectChain } = await import('@/utils/chainSwitch');
                            const CONSENT_LEDGER_ADDRESS = process.env.NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS;
                            const { CONSENT_LEDGER_ABI } = await import('@/config/contractABI');

                            await ensureCorrectChain(provider);

                            const walletClient = createWalletClient({
                                chain: arbitrumSepolia,
                                transport: custom(provider),
                            });

                            const publicClient = createPublicClient({
                                chain: arbitrumSepolia,
                                transport: http()
                            });

                            const hash = await walletClient.writeContract({
                                address: CONSENT_LEDGER_ADDRESS,
                                abi: CONSENT_LEDGER_ABI,
                                functionName: 'revoke',
                                args: [targetAddress, effectiveRootCidHash],
                                account: walletAddress,
                            });

                            toast({ title: "Đang xử lý trên blockchain...", description: "Vui lòng đợi xác nhận..." });
                            await publicClient.waitForTransactionReceipt({ hash });

                            // 3. Call Backend again to cleanup DB
                            await recordService.revokeAccess(effectiveRootCidHash, targetAddress);

                            toast({
                                title: "Thu hồi thành công!",
                                description: "Đã tự trả phí gas để thu hồi.",
                                className: "bg-green-50 border-green-200 text-green-800"
                            });

                            loadAccessList();
                            if (onAccessRevoked) onAccessRevoked(targetAddress);
                        } else {
                            throw new Error("Không tìm thấy ví để thanh toán phí gas.");
                        }
                    } catch (manualErr) {
                        console.error("Manual revoke failed:", manualErr);
                        let msg = manualErr.message || "Lỗi giao dịch";
                        if (msg.includes('insufficient funds')) msg = "Ví không đủ ETH để trả phí gas.";
                        toast({ title: "Lỗi thu hồi thủ công", description: msg, variant: "destructive" });
                    } finally {
                        setIsRevokingOnChain(false);
                    }
                }
            } else {
                // Other errors
                toast({
                    title: "Lỗi thu hồi",
                    description: err.message || "Không thể thu hồi quyền truy cập",
                    variant: "destructive",
                });
            }
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
                    <div className="flex justify-between items-center text-sm text-gray-900 px-1 font-medium">
                        <span>Địa chỉ</span>
                        <span>Hành động</span>
                    </div>

                    {accessList.map((access, idx) => {
                        const isCurrentUser = access.address?.toLowerCase() === currentUserAddress?.toLowerCase();
                        // Check expiry
                        const isExpired = access.expiresAt && new Date(access.expiresAt).getTime() < Date.now();

                        return (
                            <div
                                key={idx}
                                className={`flex items-center justify-between p-3 rounded-lg border ${isExpired ? 'bg-slate-100 opacity-75' : 'bg-white border-slate-200'
                                    }`}
                            >
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-mono text-sm font-medium ${isExpired ? 'text-slate-500' : 'text-slate-900'}`}>
                                            {access.address?.slice(0, 10)}...{access.address?.slice(-8)}
                                        </span>
                                        {isCurrentUser && (
                                            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                                BẠN
                                            </span>
                                        )}
                                        {isExpired && (
                                            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" /> HẾT HẠN
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                        Cấp: {new Date(access.grantedAt).toLocaleDateString('vi-VN')}
                                        {access.expiresAt && (
                                            <span className={isExpired ? 'text-red-500 font-medium ml-2' : 'text-orange-600 ml-2'}>
                                                • Hết hạn: {new Date(access.expiresAt).toLocaleString('vi-VN')}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {!isCurrentUser && (
                                    <Button
                                        variant={isExpired ? "secondary" : "destructive"} // Change style if expired
                                        size="sm"
                                        onClick={() => handleRevoke(access.address)}
                                        disabled={revoking === access.address || isExpired || (isRevokingOnChain && revoking === access.address)} // Disable if expired or revoking
                                        className={isExpired ? "opacity-50 cursor-not-allowed" : ""}
                                    >
                                        {revoking === access.address ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : isExpired ? (
                                            <>
                                                <ShieldX className="h-4 w-4 mr-1" />
                                                Đã hết hạn
                                            </>
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
