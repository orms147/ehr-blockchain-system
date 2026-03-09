"use client";

import { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldCheck, ShieldOff, Loader2, RefreshCw, FileText, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { orgService } from '@/services';
import { useSocket } from '@/hooks/useSocket';
import UserName from '@/components/ui/UserName';
import { useWeb3Auth } from '@web3auth/modal/react';
import { createWalletClient, createPublicClient, custom, http, keccak256, toBytes } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { ACCESS_CONTROL_ABI } from '@/config/contractABI';

const ACCESS_CONTROL_ADDRESS = process.env.NEXT_PUBLIC_EHR_SYSTEM_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(RPC_URL),
});

/**
 * OrgVerifyDoctor — Verify/Revoke doctor credentials on-chain
 * - Lists unverified and verified members
 * - Verify: credential input → keccak256 hash on-chain, plaintext saved off-chain
 * - Revoke: revokeDoctorVerification on-chain
 * - Ministry mode: uses verifyDoctorByMinistry instead of verifyDoctor
 * - Socket.io auto-refresh on verificationUpdated
 */
export default function OrgVerifyDoctor({ orgId, orgOnChainId, isMinistry = false }) {
    const { toast } = useToast();
    const { provider } = useWeb3Auth();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Verify dialog state
    const [verifyTarget, setVerifyTarget] = useState(null); // member to verify
    const [credential, setCredential] = useState('');       // Plaintext credential (GPHH)
    const [verifying, setVerifying] = useState(false);

    // Revoke dialog state
    const [revokeTarget, setRevokeTarget] = useState(null);
    const [revoking, setRevoking] = useState(false);

    // Fetch members with verification status
    const fetchMembers = useCallback(async () => {
        try {
            // For Ministry mode without orgId, we'd need a different approach
            if (!orgId && !isMinistry) {
                setMembers([]);
                return;
            }

            let memberList = [];

            if (orgId) {
                const response = await orgService.getOrgMembers(orgId);
                memberList = response?.members || [];
            }

            // Enrich with on-chain verification status
            const enriched = await Promise.all(
                memberList.map(async (member) => {
                    try {
                        const verif = await publicClient.readContract({
                            address: ACCESS_CONTROL_ADDRESS,
                            abi: ACCESS_CONTROL_ABI,
                            functionName: 'getDoctorVerification',
                            args: [member.memberAddress],
                        });
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
                            verifier: verif[0],
                            credentialHash: verif[1],
                            verifiedAt: verif[2] ? Number(verif[2]) : null,
                            verificationActive: verif[3],
                        };
                    } catch (e) {
                        return {
                            ...member,
                            isDoctor: false,
                            isDoctorVerified: false,
                            verificationActive: false,
                        };
                    }
                })
            );

            setMembers(enriched);
        } catch (error) {
            console.error('Error fetching members for verification:', error);
        }
    }, [orgId, isMinistry]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            await fetchMembers();
            setLoading(false);
        };
        load();
    }, [fetchMembers]);

    // Socket.io auto-refresh
    useSocket({
        'verificationUpdated': () => fetchMembers(),
        'orgMemberUpdated': () => fetchMembers()
    }, false);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchMembers();
        setRefreshing(false);
    };

    // Split into verified / unverified
    const unverified = members.filter(m => m.isDoctor && !m.isDoctorVerified && m.role !== 'admin');
    const verified = members.filter(m => m.isDoctorVerified);

    // ============ VERIFY DOCTOR (on-chain) ============
    const handleVerify = async () => {
        if (!verifyTarget || !credential.trim()) {
            toast({ title: 'Lỗi', description: 'Vui lòng nhập thông tin GPHH / credential', variant: 'destructive' });
            return;
        }

        setVerifying(true);
        try {
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });
            const [account] = await walletClient.getAddresses();

            // Hash credential for on-chain privacy
            const credentialHash = keccak256(toBytes(credential.trim()));

            // Choose function based on role
            const functionName = isMinistry ? 'verifyDoctorByMinistry' : 'verifyDoctor';

            const txHash = await walletClient.writeContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName,
                args: [verifyTarget.memberAddress, credentialHash],
                account,
            });

            toast({
                title: '⏳ Đang xác thực on-chain...',
                description: `Tx: ${txHash.slice(0, 10)}...`,
            });

            await publicClient.waitForTransactionReceipt({ hash: txHash });

            // Save plaintext credential to backend (encrypted at rest)
            try {
                await orgService.saveDoctorCredential?.(
                    verifyTarget.memberAddress,
                    credential.trim(),
                    credentialHash
                );
            } catch (e) {
                console.warn('Could not save credential to backend:', e.message);
            }

            toast({
                title: '✅ Đã xác thực bác sĩ',
                description: `${verifyTarget.memberAddress.slice(0, 8)}... đã được gán VERIFIED_DOCTOR on-chain`,
            });

            setVerifyTarget(null);
            setCredential('');
            setTimeout(fetchMembers, 2000);

        } catch (error) {
            console.error('Verify doctor error:', error);
            toast({
                title: 'Lỗi xác thực',
                description: error?.shortMessage || error?.message || 'Lỗi',
                variant: 'destructive',
            });
        } finally {
            setVerifying(false);
        }
    };

    // ============ REVOKE VERIFICATION (on-chain) ============
    const handleRevoke = async () => {
        if (!revokeTarget) return;
        setRevoking(true);

        try {
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });
            const [account] = await walletClient.getAddresses();

            const txHash = await walletClient.writeContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'revokeDoctorVerification',
                args: [revokeTarget.memberAddress],
                account,
            });

            toast({
                title: '⏳ Đang thu hồi xác thực...',
                description: `Tx: ${txHash.slice(0, 10)}...`,
            });

            await publicClient.waitForTransactionReceipt({ hash: txHash });

            toast({
                title: '✅ Đã thu hồi xác thực',
                description: `VERIFIED_DOCTOR flag đã bị xóa on-chain`,
            });

            setRevokeTarget(null);
            setTimeout(fetchMembers, 2000);

        } catch (error) {
            console.error('Revoke error:', error);
            toast({
                title: 'Lỗi thu hồi',
                description: error?.shortMessage || error?.message || 'Lỗi',
                variant: 'destructive',
            });
        } finally {
            setRevoking(false);
        }
    };

    // ============ RENDER ============

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* UNVERIFIED SECTION */}
            <Card className="border-orange-200">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-orange-700">
                                <AlertTriangle className="w-5 h-5" />
                                Chờ xác thực ({unverified.length})
                            </CardTitle>
                            <CardDescription>
                                Các bác sĩ chưa được xác thực — cần gán VERIFIED_DOCTOR on-chain
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {unverified.length === 0 ? (
                        <div className="text-center py-6 text-slate-400">
                            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-300" />
                            <p className="text-sm">Tất cả bác sĩ đã được xác thực ✓</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {unverified.map((member) => (
                                <div
                                    key={member.id || member.memberAddress}
                                    className="flex items-center justify-between p-3 rounded-lg border border-orange-100 bg-orange-50/30 hover:bg-orange-50/60 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                                            <ShieldOff className="w-4 h-4 text-orange-500" />
                                        </div>
                                        <div>
                                            <span className="text-sm font-medium text-slate-900">
                                                <UserName address={member.memberAddress} />
                                            </span>
                                            <p className="text-xs text-slate-500 font-mono">
                                                {member.memberAddress?.slice(0, 10)}...{member.memberAddress?.slice(-6)}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700"
                                        onClick={() => setVerifyTarget(member)}
                                    >
                                        <ShieldCheck className="w-4 h-4 mr-1" />
                                        Xác thực
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* VERIFIED SECTION */}
            <Card className="border-green-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-700">
                        <Shield className="w-5 h-5" />
                        Đã xác thực ({verified.length})
                    </CardTitle>
                    <CardDescription>
                        Bác sĩ có VERIFIED_DOCTOR flag on-chain. Credential hash lưu trên blockchain.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {verified.length === 0 ? (
                        <div className="text-center py-6 text-slate-400">
                            <p className="text-sm">Chưa có bác sĩ nào được xác thực</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {verified.map((member) => (
                                <div
                                    key={member.id || member.memberAddress}
                                    className="flex items-center justify-between p-3 rounded-lg border border-green-100 bg-green-50/30 hover:bg-green-50/60 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                            <ShieldCheck className="w-4 h-4 text-green-600" />
                                        </div>
                                        <div>
                                            <span className="text-sm font-medium text-slate-900">
                                                <UserName address={member.memberAddress} />
                                            </span>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {member.verifiedAt && (
                                                    <span className="text-[10px] text-slate-400">
                                                        Xác thực: {new Date(member.verifiedAt * 1000).toLocaleDateString('vi-VN')}
                                                    </span>
                                                )}
                                                {member.credentialHash && (
                                                    <Badge variant="outline" className="text-[10px] h-4 font-mono">
                                                        Hash: {member.credentialHash.slice(0, 10)}...
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => setRevokeTarget(member)}
                                    >
                                        <XCircle className="w-4 h-4 mr-1" />
                                        Thu hồi
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ============ VERIFY DIALOG ============ */}
            <Dialog open={!!verifyTarget} onOpenChange={() => { setVerifyTarget(null); setCredential(''); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-blue-600" />
                            Xác thực Bác sĩ
                        </DialogTitle>
                        <DialogDescription>
                            Nhập số Giấy phép Hành nghề (GPHH). Credential sẽ được hash (keccak256) trước khi lưu on-chain.
                            Bản rõ được mã hóa AES và lưu off-chain.
                        </DialogDescription>
                    </DialogHeader>
                    {verifyTarget && (
                        <div className="space-y-4">
                            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                                <p className="text-sm text-slate-600">Bác sĩ:</p>
                                <p className="text-sm font-medium text-blue-800">
                                    <UserName address={verifyTarget.memberAddress} />
                                </p>
                                <p className="text-xs text-slate-500 font-mono mt-0.5">
                                    {verifyTarget.memberAddress}
                                </p>
                            </div>
                            <div>
                                <Label htmlFor="credential">Số GPHH / Credential</Label>
                                <Input
                                    id="credential"
                                    placeholder="VD: GP-12345, BS-2024-001..."
                                    value={credential}
                                    onChange={(e) => setCredential(e.target.value)}
                                    className="mt-1"
                                />
                                <p className="text-xs text-slate-400 mt-1">
                                    🔒 On-chain: keccak256("{credential}") → {credential ? keccak256(toBytes(credential)).slice(0, 18) + '...' : '...'}
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setVerifyTarget(null); setCredential(''); }}>
                            Hủy
                        </Button>
                        <Button
                            onClick={handleVerify}
                            disabled={verifying || !credential.trim()}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {verifying ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    Đang gửi TX...
                                </>
                            ) : (
                                <>
                                    <ShieldCheck className="w-4 h-4 mr-1" />
                                    Xác thực (On-chain)
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ============ REVOKE DIALOG ============ */}
            <Dialog open={!!revokeTarget} onOpenChange={() => setRevokeTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-700">Thu hồi xác thực</DialogTitle>
                        <DialogDescription>
                            Thao tác này sẽ xóa flag VERIFIED_DOCTOR on-chain. Bác sĩ sẽ không còn trạng thái "Đã xác thực".
                        </DialogDescription>
                    </DialogHeader>
                    {revokeTarget && (
                        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                            <p className="text-sm font-medium text-red-800">
                                <UserName address={revokeTarget.memberAddress} />
                            </p>
                            <p className="text-xs text-red-600 font-mono mt-1">
                                {revokeTarget.memberAddress}
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRevokeTarget(null)}>
                            Hủy
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleRevoke}
                            disabled={revoking}
                        >
                            {revoking ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    Đang thu hồi...
                                </>
                            ) : (
                                <>
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Thu hồi (On-chain)
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
