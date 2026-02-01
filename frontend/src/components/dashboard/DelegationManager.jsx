"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Users, Loader2, UserPlus, Trash2,
    CheckCircle, Shield, AlertCircle, RefreshCw, Link2,
    UserCircle, Stethoscope, Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { delegationService, api } from '@/services';
import { useWeb3Auth } from '@web3auth/modal/react';
import { createWalletClient, createPublicClient, custom, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

// Contract Config
const CONSENT_LEDGER_ADDRESS = process.env.NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS;
const ACCESS_CONTROL_ADDRESS = process.env.NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS;

import { CONSENT_LEDGER_ABI, ACCESS_CONTROL_ABI } from '@/config/contractABI';


const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'),
});

const DELEGATION_TYPES = [
    { value: 'full', label: 'Người giám hộ (Toàn quyền)', desc: 'Người thân có thể quản lý, xem tất cả hồ sơ và đi khám thay bạn.', icon: Shield },
    { value: 'limited', label: 'Giới hạn (Chỉ xem)', desc: 'Chỉ được phép xem hồ sơ, không được thay mặt quyết định.', icon: Users },
];

export default function DelegationManager() {
    const [myDelegates, setMyDelegates] = useState([]); // People I trust (Guardians)
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);

    // Add form state
    const [newDelegateAddress, setNewDelegateAddress] = useState('');
    const [delegateRole, setDelegateRole] = useState(null); // 'doctor', 'org', 'user', 'unknown'
    const [newDelegationType, setNewDelegationType] = useState('full');
    const [submitting, setSubmitting] = useState(false);
    const [checkingRole, setCheckingRole] = useState(false);

    const { provider } = useWeb3Auth();

    useEffect(() => {
        fetchData();
    }, []);

    // Check role when address changes
    useEffect(() => {
        if (isValidAddress(newDelegateAddress)) {
            checkAddressRole(newDelegateAddress);
        } else {
            setDelegateRole(null);
        }
    }, [newDelegateAddress]);

    const checkAddressRole = async (address) => {
        setCheckingRole(true);
        try {
            const status = await publicClient.readContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'getUserStatus',
                args: [address]
            });
            // status: [isPatient, isDoctor, isDoctorVerified, isOrg, isOrgVerified, isMinistry]
            if (status[4]) setDelegateRole('Tổ chức Y tế (Đã xác minh)');
            else if (status[3]) setDelegateRole('Tổ chức Y tế (Chưa xác minh)');
            else if (status[2]) setDelegateRole('Bác sĩ (Đã xác minh)');
            else if (status[1]) setDelegateRole('Bác sĩ');
            else setDelegateRole('Người dùng cá nhân');
        } catch (e) {
            console.error('Check role failed', e);
            setDelegateRole('Không xác định (Chưa đăng ký)');
        } finally {
            setCheckingRole(false);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const result = await delegationService.getMyDelegates();
            const enriched = await enrichDelegationData(result.delegations, 'delegateAddress');
            setMyDelegates(enriched);
        } catch (err) {
            console.error('Fetch error:', err);
            toast({ title: "Lỗi", description: "Không thể tải dữ liệu", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const enrichDelegationData = async (list, addressField) => {
        if (!list || list.length === 0) return [];
        return await Promise.all(list.map(async (d) => {
            const targetAddress = d[addressField];
            try {
                const [onChainData, roleStatus] = await Promise.all([
                    publicClient.readContract({
                        address: CONSENT_LEDGER_ADDRESS,
                        abi: CONSENT_LEDGER_ABI,
                        functionName: 'getDelegation',
                        args: [d.patientAddress, d.delegateAddress]
                    }).catch(() => ({ active: false })),
                    publicClient.readContract({
                        address: ACCESS_CONTROL_ADDRESS,
                        abi: ACCESS_CONTROL_ABI,
                        functionName: 'getUserStatus',
                        args: [targetAddress]
                    }).catch(() => null)
                ]);

                let roleLabel = 'Cá nhân';
                if (roleStatus) {
                    if (roleStatus[4] || roleStatus[3]) roleLabel = 'Tổ chức';
                    else if (roleStatus[2] || roleStatus[1]) roleLabel = 'Bác sĩ';
                }

                return {
                    ...d,
                    onChainActive: onChainData.active,
                    roleLabel: roleLabel,
                    displayAddress: targetAddress
                };
            } catch (e) {
                return { ...d, onChainActive: false, roleLabel: '?', displayAddress: targetAddress };
            }
        }));
    };

    const isValidAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr);

    const handleAddDelegate = async (e) => {
        e.preventDefault();

        if (!isValidAddress(newDelegateAddress)) {
            toast({ title: "Lỗi", description: "Địa chỉ ví không hợp lệ", variant: "destructive" });
            return;
        }

        if (!provider) {
            toast({ title: "Lỗi", description: "Vui lòng kết nối ví.", variant: "destructive" });
            return;
        }

        setSubmitting(true);

        try {
            // 1. On-chain Transaction
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });
            const [account] = await walletClient.getAddresses();

            // Full Delegation = 1 year, Limited = 30 days
            const duration = newDelegationType === 'full'
                ? BigInt(365 * 24 * 60 * 60)
                : BigInt(30 * 24 * 60 * 60);

            // Full Delegation allows sub-delegation (grantUsingDelegation)
            const allowSubDelegate = newDelegationType === 'full';

            const hash = await walletClient.writeContract({
                account,
                address: CONSENT_LEDGER_ADDRESS,
                abi: CONSENT_LEDGER_ABI,
                functionName: 'grantDelegation',
                args: [
                    newDelegateAddress,
                    Number(duration),
                    allowSubDelegate
                ]
            });

            toast({
                title: "Giao dịch đã gửi",
                description: "Đang chờ xác nhận trên Blockchain...",
            });

            await publicClient.waitForTransactionReceipt({ hash });

            // 2. Sync to Backend
            await api.post('/api/delegation/confirm-onchain', {
                delegateAddress: newDelegateAddress,
                txHash: hash,
                onChainStatus: true
            });

            toast({
                title: "Thành công!",
                description: "Đã thêm người được ủy quyền.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            setNewDelegateAddress('');
            setShowAddForm(false);
            fetchData();

        } catch (err) {
            console.error('Add delegate error:', err);
            toast({
                title: "Lỗi",
                description: err.message?.includes('User rejected') ? "Bạn đã hủy giao dịch" : "Không thể ủy quyền",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevoke = async (delegation) => { // Updated to support both directions if needed, but usually only Patient revokes
        if (!confirm('Bạn có chắc muốn thu hồi ủy quyền này?')) return;

        try {
            if (delegation.onChainActive && provider) {
                const walletClient = createWalletClient({
                    chain: arbitrumSepolia,
                    transport: custom(provider),
                });
                const [account] = await walletClient.getAddresses();

                const hash = await walletClient.writeContract({
                    account,
                    address: CONSENT_LEDGER_ADDRESS,
                    abi: CONSENT_LEDGER_ABI,
                    functionName: 'revokeDelegation',
                    args: [delegation.delegateAddress]
                });

                toast({ title: "Đang xử lý...", description: "Vui lòng đợi xác nhận trên blockchain." });
                await publicClient.waitForTransactionReceipt({ hash });
            }

            // Sync revoke to backend
            await delegationService.revokeDelegation(delegation.id);
            toast({ title: "Đã thu hồi", description: "Quyền quản lý đã bị hủy bỏ." });
            fetchData();
        } catch (err) {
            console.error(err);
            toast({ title: "Lỗi", description: "Không thể thu hồi", variant: "destructive" });
        }
    };

    const DelegateCard = ({ item }) => (
        <div className="p-4 border rounded-xl bg-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                    {item.roleLabel === 'Bác sĩ' ? <Stethoscope className="w-4 h-4 text-blue-500" /> :
                        item.roleLabel === 'Tổ chức' ? <Building2 className="w-4 h-4 text-purple-500" /> :
                            <UserCircle className="w-4 h-4 text-slate-500" />}

                    <p className="font-semibold text-slate-900 font-mono text-sm">
                        {item.displayAddress?.slice(0, 8)}...{item.displayAddress?.slice(-6)}
                    </p>

                    <span className={`text-xs px-2 py-0.5 rounded border ${item.roleLabel === 'Bác sĩ' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        item.roleLabel === 'Tổ chức' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                        {item.roleLabel}
                    </span>

                    {item.onChainActive ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 flex items-center gap-1">
                            <Link2 className="w-3 h-3" /> On-chain
                        </span>
                    ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                            Chưa đồng bộ
                        </span>
                    )}
                </div>
                <p className="text-sm text-slate-500">
                    {new Date(item.createdAt).toLocaleDateString('vi-VN')}
                </p>
            </div>

            <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRevoke(item)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
                <Trash2 className="w-4 h-4 mr-2" />
                Thu hồi
            </Button>
        </div>
    );

    return (
        <Card className="bg-white">
            <CardHeader>
                <CardTitle className="text-slate-900 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-teal-600" />
                    Quản lý Ủy quyền
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <div>
                            <h3 className="text-sm font-medium text-slate-700">Người tôi ủy quyền</h3>
                            <p className="text-xs text-slate-500">Những người này có thể xem và quản lý hồ sơ thay bạn.</p>
                        </div>
                        <Button onClick={() => setShowAddForm(!showAddForm)} size="sm" className="bg-teal-600 hover:bg-teal-700">
                            <UserPlus className="w-4 h-4 mr-2" /> Thêm mới
                        </Button>
                    </div>

                    {showAddForm && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <form onSubmit={handleAddDelegate} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Địa chỉ ví người được ủy quyền</Label>
                                    <div className="relative">
                                        <Input
                                            placeholder="0x..."
                                            value={newDelegateAddress}
                                            onChange={(e) => setNewDelegateAddress(e.target.value)}
                                            className="bg-white"
                                        />
                                        {checkingRole && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-slate-400" />}
                                    </div>
                                    {delegateRole && (
                                        <p className="text-xs text-blue-600 flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" />
                                            {delegateRole}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label>Loại ủy quyền</Label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {DELEGATION_TYPES.map((type) => (
                                            <div
                                                key={type.value}
                                                onClick={() => setNewDelegationType(type.value)}
                                                className={`cursor-pointer p-3 rounded-lg border-2 transition-all ${newDelegationType === type.value ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-teal-200 bg-white'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 font-medium text-slate-900 mb-1">
                                                    <type.icon className={`w-4 h-4 ${newDelegationType === type.value ? 'text-teal-600' : 'text-slate-500'}`} />
                                                    {type.label}
                                                </div>
                                                <p className="text-xs text-slate-500">{type.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2">
                                    <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)}>Hủy</Button>
                                    <Button type="submit" disabled={submitting || !newDelegateAddress} className="bg-teal-600 hover:bg-teal-700">
                                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Xác nhận'}
                                    </Button>
                                </div>
                            </form>
                        </motion.div>
                    )}

                    {loading ? (
                        <div className="text-center py-8"><Loader2 className="w-8 h-8 animate-spin mx-auto text-teal-600" /></div>
                    ) : myDelegates.length > 0 ? (
                        <div className="space-y-3">
                            {myDelegates.map(d => <DelegateCard key={d.id} item={d} />)}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                            <Shield className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                            Chưa có người được ủy quyền nào.
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
