"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Users, Loader2, UserPlus, Trash2,
    CheckCircle, Shield, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { delegationService } from '@/services';

const DELEGATION_TYPES = [
    { value: 'full', label: 'Toàn quyền', desc: 'Xem và quản lý tất cả hồ sơ' },
    { value: 'limited', label: 'Giới hạn', desc: 'Chỉ xem một số hồ sơ được chỉ định' },
    { value: 'emergency_only', label: 'Khẩn cấp', desc: 'Chỉ có quyền trong trường hợp khẩn cấp' },
];

export default function DelegationManager() {
    const [delegations, setDelegations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);

    // Add form state
    const [newDelegateAddress, setNewDelegateAddress] = useState('');
    const [newDelegationType, setNewDelegationType] = useState('full');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchDelegations();
    }, []);

    const fetchDelegations = async () => {
        try {
            setLoading(true);
            const result = await delegationService.getMyDelegates();
            setDelegations(result.delegations || []);
        } catch (err) {
            console.error('Fetch delegations error:', err);
            toast({
                title: "Lỗi",
                description: "Không thể tải danh sách ủy quyền",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const isValidAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr);

    const handleAddDelegate = async (e) => {
        e.preventDefault();

        if (!isValidAddress(newDelegateAddress)) {
            toast({ title: "Lỗi", description: "Địa chỉ ví không hợp lệ", variant: "destructive" });
            return;
        }

        setSubmitting(true);

        try {
            await delegationService.createDelegation(newDelegateAddress, newDelegationType);

            toast({
                title: "Thành công!",
                description: "Đã thêm người được ủy quyền",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            setNewDelegateAddress('');
            setNewDelegationType('full');
            setShowAddForm(false);
            fetchDelegations();
        } catch (err) {
            console.error('Add delegate error:', err);
            toast({
                title: "Lỗi",
                description: err.message || "Không thể thêm ủy quyền",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevoke = async (id) => {
        if (!confirm('Bạn có chắc muốn thu hồi ủy quyền này?')) return;

        try {
            await delegationService.revokeDelegation(id);

            toast({
                title: "Đã thu hồi",
                description: "Ủy quyền đã được thu hồi",
            });

            fetchDelegations();
        } catch (err) {
            console.error('Revoke error:', err);
            toast({
                title: "Lỗi",
                description: "Không thể thu hồi ủy quyền",
                variant: "destructive",
            });
        }
    };

    return (
        <Card className="bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-teal-600" />
                    Ủy quyền người thân
                </CardTitle>
                <Button
                    size="sm"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="bg-teal-600 hover:bg-teal-700"
                >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Thêm
                </Button>
            </CardHeader>
            <CardContent>
                {/* Add form */}
                {showAddForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-6 p-4 bg-slate-50 rounded-xl"
                    >
                        <form onSubmit={handleAddDelegate} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Địa chỉ ví người được ủy quyền</Label>
                                <Input
                                    placeholder="0x..."
                                    value={newDelegateAddress}
                                    onChange={(e) => setNewDelegateAddress(e.target.value)}
                                    className={!newDelegateAddress || isValidAddress(newDelegateAddress) ? '' : 'border-red-500'}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Loại ủy quyền</Label>
                                <div className="space-y-2">
                                    {DELEGATION_TYPES.map((type) => (
                                        <button
                                            key={type.value}
                                            type="button"
                                            onClick={() => setNewDelegationType(type.value)}
                                            className={`w-full p-3 rounded-lg border-2 text-left transition-all ${newDelegationType === type.value
                                                    ? 'border-teal-500 bg-teal-50'
                                                    : 'border-slate-200 hover:border-teal-300'
                                                }`}
                                        >
                                            <div className="font-medium text-slate-900">{type.label}</div>
                                            <div className="text-sm text-slate-500">{type.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    type="submit"
                                    disabled={submitting || !isValidAddress(newDelegateAddress)}
                                    className="bg-teal-600 hover:bg-teal-700"
                                >
                                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Thêm ủy quyền'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowAddForm(false)}
                                >
                                    Hủy
                                </Button>
                            </div>
                        </form>
                    </motion.div>
                )}

                {/* Info box */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                    <p className="text-sm text-blue-800 flex items-start gap-2">
                        <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                        Ủy quyền cho phép người thân xem hoặc quản lý hồ sơ y tế thay bạn.
                    </p>
                </div>

                {/* List */}
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                    </div>
                ) : delegations.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-xl">
                        <Users className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500">Chưa có ủy quyền nào</p>
                        <p className="text-sm text-slate-400">Thêm người thân để họ có thể giúp quản lý hồ sơ của bạn</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {delegations.map((d) => (
                            <div key={d.id} className="p-4 border rounded-xl flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-slate-900">
                                        {d.delegateAddress?.slice(0, 10)}...{d.delegateAddress?.slice(-8)}
                                    </p>
                                    <p className="text-sm text-slate-500">
                                        {DELEGATION_TYPES.find(t => t.value === d.delegationType)?.label || d.delegationType}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        Thêm: {new Date(d.createdAt).toLocaleDateString('vi-VN')}
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRevoke(d.id)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
