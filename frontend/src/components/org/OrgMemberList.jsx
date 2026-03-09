"use client";

import { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Trash2, Loader2, RefreshCw, Shield, ShieldOff, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { orgService } from '@/services';
import { useSocket } from '@/hooks/useSocket';
import UserName from '@/components/ui/UserName';
import { useWeb3Auth } from '@web3auth/modal/react';
import { createWalletClient, createPublicClient, custom, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { ACCESS_CONTROL_ABI } from '@/config/contractABI';

const ACCESS_CONTROL_ADDRESS = process.env.NEXT_PUBLIC_EHR_SYSTEM_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(RPC_URL),
});

/**
 * OrgMemberList — Manage organization members
 * - List members with verified badge + UserName
 * - Add member (on-chain addOrgMember + backend sync via event worker)
 * - Remove member (on-chain removeOrgMember + backend sync via event worker)
 * - Pending tx state (spinner while tx confirms)
 * - Socket.io auto-refresh on orgMemberUpdated
 */
export default function OrgMemberList({ orgId, orgOnChainId }) {
    const { toast } = useToast();
    const { provider } = useWeb3Auth();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newMemberAddress, setNewMemberAddress] = useState('');
    const [newMemberRole, setNewMemberRole] = useState('doctor');
    const [addingMember, setAddingMember] = useState(false);
    const [removingMember, setRemovingMember] = useState(null); // address being removed
    const [pendingTxMembers, setPendingTxMembers] = useState(new Set()); // addresses with pending on-chain tx
    const [confirmRemove, setConfirmRemove] = useState(null); // member to confirm remove

    // Fetch members and enrich with on-chain verification status
    const fetchMembers = useCallback(async () => {
        try {
            const response = await orgService.getOrgMembers(orgId);
            if (!response?.members) {
                setMembers([]);
                return;
            }

            // Enrich with on-chain doctor verification status (batch)
            const enriched = await Promise.all(
                response.members.map(async (member) => {
                    try {
                        const status = await publicClient.readContract({
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'getUserStatus',
                            args: [member.memberAddress],
                        });
                        return {
                            ...member,
                            isDoctor: status[1],
                            isDoctorVerified: status[2],
                            isOrg: status[3],
                        };
                    } catch (e) {
                        return { ...member, isDoctor: false, isDoctorVerified: false, isOrg: false };
                    }
                })
            );
            setMembers(enriched);
        } catch (error) {
            console.error('Error fetching members:', error);
            toast({ title: 'Lỗi', description: 'Không thể tải danh sách thành viên', variant: 'destructive' });
        }
    }, [orgId, toast]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            await fetchMembers();
            setLoading(false);
        };
        load();
    }, [fetchMembers]);

    // Socket.io auto-refresh — listen for orgMemberUpdated events from worker
    useSocket({
        'orgMemberUpdated': () => {
            fetchMembers();
            setPendingTxMembers(new Set()); // Clear pending states
        },
        'verificationUpdated': () => {
            fetchMembers();
            setPendingTxMembers(new Set()); // Clear pending states
        }
    }, false);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchMembers();
        setRefreshing(false);
    };

    // ============ ADD MEMBER (on-chain only — worker syncs DB) ============
    const handleAddMember = async () => {
        if (!newMemberAddress || !/^0x[a-fA-F0-9]{40}$/.test(newMemberAddress)) {
            toast({ title: 'Lỗi', description: 'Địa chỉ ví không hợp lệ (0x...)', variant: 'destructive' });
            return;
        }

        if (!orgOnChainId) {
            toast({ title: 'Lỗi', description: 'Không tìm thấy orgId on-chain', variant: 'destructive' });
            return;
        }

        setAddingMember(true);
        try {
            // Step 1: Check if target is registered as Doctor on-chain
            const isDoctor = await publicClient.readContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isDoctor',
                args: [newMemberAddress],
            });

            if (!isDoctor) {
                toast({
                    title: 'Không thể thêm',
                    description: 'Địa chỉ này chưa đăng ký vai trò Bác sĩ trên blockchain. Họ cần đăng ký trước.',
                    variant: 'destructive',
                });
                setAddingMember(false);
                return;
            }

            // Step 2: Check if already member
            const isMember = await publicClient.readContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isDoctorMemberOfOrg',
                args: [BigInt(orgOnChainId), newMemberAddress],
            });

            if (isMember) {
                toast({ title: 'Đã là thành viên', description: 'Bác sĩ này đã thuộc tổ chức rồi.', variant: 'destructive' });
                setAddingMember(false);
                return;
            }

            // Step 3: On-chain tx — addOrgMember
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });
            const [account] = await walletClient.getAddresses();

            // Mark as pending
            setPendingTxMembers(prev => new Set(prev).add(newMemberAddress.toLowerCase()));

            const txHash = await walletClient.writeContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'addOrgMember',
                args: [BigInt(orgOnChainId), newMemberAddress],
                account,
            });

            toast({
                title: '⏳ Đang xử lý on-chain...',
                description: `Tx: ${txHash.slice(0, 10)}...`,
            });

            // Wait for confirmation
            await publicClient.waitForTransactionReceipt({ hash: txHash });

            toast({
                title: '✅ Đã thêm thành viên',
                description: 'Event Sync sẽ tự động cập nhật danh sách.',
            });

            setShowAddDialog(false);
            setNewMemberAddress('');
            setNewMemberRole('doctor');

            // Refresh after a short delay (give worker time)
            setTimeout(fetchMembers, 2000);

        } catch (error) {
            console.error('Add member error:', error);
            const msg = error?.shortMessage || error?.message || 'Lỗi không xác định';
            toast({ title: 'Lỗi thêm thành viên', description: msg, variant: 'destructive' });
            setPendingTxMembers(prev => {
                const next = new Set(prev);
                next.delete(newMemberAddress.toLowerCase());
                return next;
            });
        } finally {
            setAddingMember(false);
        }
    };

    // ============ REMOVE MEMBER (on-chain only) ============
    const handleRemoveMember = async (member) => {
        if (!orgOnChainId) return;
        setRemovingMember(member.memberAddress);
        setConfirmRemove(null);

        try {
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });
            const [account] = await walletClient.getAddresses();

            const txHash = await walletClient.writeContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'removeOrgMember',
                args: [BigInt(orgOnChainId), member.memberAddress],
                account,
            });

            toast({ title: '⏳ Đang xóa thành viên...', description: `Tx: ${txHash.slice(0, 10)}...` });

            await publicClient.waitForTransactionReceipt({ hash: txHash });

            toast({ title: '✅ Đã xóa thành viên', description: 'Danh sách sẽ tự động cập nhật.' });

            setTimeout(fetchMembers, 2000);
        } catch (error) {
            console.error('Remove member error:', error);
            toast({
                title: 'Lỗi xóa thành viên',
                description: error?.shortMessage || error?.message || 'Lỗi',
                variant: 'destructive',
            });
        } finally {
            setRemovingMember(null);
        }
    };

    // ============ RENDER ============

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-purple-600" />
                            Thành viên tổ chức
                        </CardTitle>
                        <CardDescription>
                            {members.length} thành viên đang hoạt động
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={refreshing}
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setShowAddDialog(true)}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            <UserPlus className="w-4 h-4 mr-1" />
                            Thêm thành viên
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {members.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                        <p>Chưa có thành viên nào</p>
                        <p className="text-xs mt-1">Bấm "Thêm thành viên" để mời bác sĩ vào tổ chức</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {members.map((member) => {
                            const isPending = pendingTxMembers.has(member.memberAddress?.toLowerCase());
                            const isRemoving = removingMember === member.memberAddress;

                            return (
                                <div
                                    key={member.id || member.memberAddress}
                                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${isPending ? 'border-yellow-200 bg-yellow-50/50 animate-pulse' :
                                        isRemoving ? 'border-red-200 bg-red-50/50 opacity-60' :
                                            'border-slate-100 hover:border-purple-200 hover:bg-purple-50/30'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Avatar / icon */}
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${member.isDoctorVerified ? 'bg-green-100' : 'bg-slate-100'
                                            }`}>
                                            {member.isDoctorVerified ? (
                                                <Shield className="w-4 h-4 text-green-600" />
                                            ) : (
                                                <ShieldOff className="w-4 h-4 text-slate-400" />
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-slate-900">
                                                    <UserName address={member.memberAddress} />
                                                </span>
                                                {isPending && (
                                                    <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">
                                                        <Loader2 className="w-2.5 h-2.5 animate-spin mr-0.5" />
                                                        Pending
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] h-4 font-normal"
                                                >
                                                    {member.role === 'admin' ? '🔑 Admin' : '🩺 Bác sĩ'}
                                                </Badge>
                                                {member.isDoctorVerified ? (
                                                    <Badge className="bg-green-100 text-green-700 text-[10px] h-4">
                                                        <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                                        Đã xác thực
                                                    </Badge>
                                                ) : member.isDoctor ? (
                                                    <Badge className="bg-orange-100 text-orange-700 text-[10px] h-4">
                                                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                                        Chưa xác thực
                                                    </Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Remove button (not for admins) */}
                                    {member.role !== 'admin' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => setConfirmRemove(member)}
                                            disabled={isRemoving || isPending}
                                        >
                                            {isRemoving ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>

            {/* ============ ADD MEMBER DIALOG ============ */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Thêm thành viên mới</DialogTitle>
                        <DialogDescription>
                            Nhập địa chỉ ví của bác sĩ để thêm vào tổ chức. Bác sĩ phải đã đăng ký trên blockchain.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Địa chỉ ví (0x...)</Label>
                            <Input
                                placeholder="0x..."
                                value={newMemberAddress}
                                onChange={(e) => setNewMemberAddress(e.target.value)}
                                className="font-mono text-sm mt-1"
                            />
                        </div>
                        <div>
                            <Label>Vai trò</Label>
                            <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="doctor">🩺 Bác sĩ</SelectItem>
                                    <SelectItem value="nurse">👩‍⚕️ Điều dưỡng</SelectItem>
                                    <SelectItem value="staff">👤 Nhân viên</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                            Hủy
                        </Button>
                        <Button
                            onClick={handleAddMember}
                            disabled={addingMember || !newMemberAddress}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            {addingMember ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    Đang gửi TX...
                                </>
                            ) : (
                                <>
                                    <UserPlus className="w-4 h-4 mr-1" />
                                    Thêm (On-chain)
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ============ CONFIRM REMOVE DIALOG ============ */}
            <Dialog open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Xác nhận xóa thành viên</DialogTitle>
                        <DialogDescription>
                            Thao tác này sẽ xóa thành viên khỏi tổ chức trên blockchain. Bạn có chắc chắn?
                        </DialogDescription>
                    </DialogHeader>
                    {confirmRemove && (
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                            <p className="text-sm font-medium text-red-800">
                                <UserName address={confirmRemove.memberAddress} />
                            </p>
                            <p className="text-xs text-red-600 font-mono mt-1">
                                {confirmRemove.memberAddress}
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmRemove(null)}>
                            Hủy
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => handleRemoveMember(confirmRemove)}
                        >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Xóa (On-chain)
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
