"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Building2, Plus, RefreshCw, CheckCircle, XCircle,
    Edit, Power, PowerOff, Search, Trash2, Upload, FileText
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { toast } from '@/components/ui/use-toast';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { api } from '@/services/api';
import { useWeb3Auth } from '@web3auth/modal/react';
import { createWalletClient, createPublicClient, custom, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { ensureArbitrumSepolia } from '@/utils/chainSwitch';
import { ACCESS_CONTROL_ABI } from '@/config/contractABI';

const ACCESS_CONTROL_ADDRESS = process.env.NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS;


const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'),
});

// ============ CREATE ORGANIZATION DIALOG ============

function CreateOrgDialog({ onSuccess }) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState(''); // 'uploading' | 'blockchain' | 'syncing'

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        primaryAdmin: '',
        backupAdmin: '',
    });
    const [file, setFile] = useState(null);
    const fileInputRef = useRef(null);

    const { provider } = useWeb3Auth();

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleCreate = async () => {
        if (!formData.name || !formData.primaryAdmin || !file) {
            toast({
                title: "Lỗi",
                description: "Vui lòng nhập tên, admin chính và upload giấy phép.",
                variant: "destructive"
            });
            return;
        }

        if (formData.backupAdmin && formData.backupAdmin.toLowerCase() === formData.primaryAdmin.toLowerCase()) {
            toast({
                title: "Lỗi",
                description: "Admin dự phòng không được trùng với Admin chính.",
                variant: "destructive"
            });
            return;
        }

        if (!provider) {
            toast({ title: "Lỗi", description: "Vui lòng kết nối ví.", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            // Step 1: Upload License
            setStep('uploading');
            const licenseFormData = new FormData();
            licenseFormData.append('licenseFile', file);

            const uploadRes = await api.postFormData('/api/admin/upload-license', licenseFormData);
            const { licenseCid, licenseUrl } = uploadRes;

            // Step 2: Create On-Chain (Ministry User signs this)
            setStep('blockchain');
            // Ensure correct chain
            await ensureArbitrumSepolia(provider);

            // Verify Ministry Role
            // Verify Ministry Role
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });
            const [account] = await walletClient.getAddresses();

            const isMinistry = await publicClient.readContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'isMinistry',
                args: [account]
            });

            if (!isMinistry) {
                toast({
                    title: "Lỗi quyền hạn",
                    description: "Ví của bạn không phải là Bộ Y Tế (Deployer). Vui lòng chuyển sang ví Deployer.",
                    variant: "destructive"
                });
                setLoading(false);
                setStep('form');
                return;
            }

            // Pre-check: Verify primaryAdmin is not already an admin of another org
            const existingOrgId = await publicClient.readContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'getAdminOrgId',
                args: [formData.primaryAdmin]
            });

            if (Number(existingOrgId) !== 0) {
                toast({
                    title: "Admin đã tồn tại",
                    description: `Địa chỉ ${formData.primaryAdmin.slice(0, 6)}...${formData.primaryAdmin.slice(-4)} đã là Admin của Tổ chức #${existingOrgId}. Vui lòng dùng ví khác.`,
                    variant: "destructive"
                });
                setLoading(false);
                setStep('form');
                return;
            }

            const backupAdminAddr = formData.backupAdmin || '0x0000000000000000000000000000000000000000';

            // Pre-check backup admin too
            if (formData.backupAdmin) {
                const backupOrgId = await publicClient.readContract({
                    address: ACCESS_CONTROL_ADDRESS,
                    abi: ACCESS_CONTROL_ABI,
                    functionName: 'getAdminOrgId',
                    args: [formData.backupAdmin]
                });
                if (Number(backupOrgId) !== 0) {
                    toast({
                        title: "Admin dự phòng đã tồn tại",
                        description: `Địa chỉ backup đã là Admin của Tổ chức #${backupOrgId}. Vui lòng dùng ví khác.`,
                        variant: "destructive"
                    });
                    setLoading(false);
                    setStep('form');
                    return;
                }
            }

            const { request } = await publicClient.simulateContract({
                account,
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'createOrganization',
                args: [formData.name, formData.primaryAdmin, backupAdminAddr]
            });

            const hash = await walletClient.writeContract(request);

            toast({ title: "Đang xử lý", description: "Giao dịch đã gửi lên blockchain..." });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            // Parse OrgId from logs
            let orgId = null;
            // Topic0 for OrganizationCreated(uint256,string,address,address)
            // But simplify: verify via getAdminOrgId if easier, or iterate logs
            // Ideally we parse receipt logs
            // For now, let's use the fallback check after request or assume Backend can find it via txHash if we send txHash.
            // Actually, we need orgId to send to Backend if Backend requires it explicitly.
            // Let's try to fetch it via `getAdminOrgId` immediately after.

            const fetchedOrgId = await publicClient.readContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'getAdminOrgId',
                args: [formData.primaryAdmin]
            });
            orgId = Number(fetchedOrgId);

            // Step 3: Sync to DB
            setStep('syncing');
            await api.post('/api/admin/confirm-org-creation', {
                orgId: orgId,
                name: formData.name,
                primaryAdmin: formData.primaryAdmin,
                backupAdmin: formData.backupAdmin || null,
                txHash: hash,
                licenseCid,
                licenseUrl
            });

            toast({
                title: "Thành công!",
                description: `Tổ chức "${formData.name}" đã được tạo.`,
                className: "bg-green-50 border-green-200 text-green-800",
            });

            setOpen(false);
            setFormData({ name: '', primaryAdmin: '', backupAdmin: '' });
            setFile(null);
            onSuccess?.();

        } catch (error) {
            console.error('Create org error:', error);

            // Decode contract-specific errors for better UX
            let msg = "Không thể tạo tổ chức";
            const errorStr = error.message || error.toString();

            if (errorStr.includes('User rejected')) {
                msg = "Bạn đã từ chối giao dịch";
            } else if (errorStr.includes('AlreadyRegistered')) {
                msg = "Địa chỉ Admin này đã là Admin của một tổ chức khác. Vui lòng dùng ví khác.";
            } else if (errorStr.includes('InvalidAddress')) {
                msg = "Địa chỉ không hợp lệ. Kiểm tra lại địa chỉ Admin chính và Admin dự phòng (không được trùng nhau).";
            } else if (errorStr.includes('NotAuthorized')) {
                msg = "Ví của bạn không có quyền tạo tổ chức. Chỉ Bộ Y Tế mới được thực hiện thao tác này.";
            } else if (errorStr.includes('Internal JSON-RPC error')) {
                msg = "Lỗi RPC blockchain. Có thể đã hết gas hoặc địa chỉ Admin đã tồn tại. Vui lòng thử lại với địa chỉ Admin mới.";
            } else if (error.response?.data?.error) {
                msg = error.response.data.error;
            }

            toast({
                title: "Lỗi",
                description: msg,
                variant: "destructive"
            });
        } finally {
            setLoading(false);
            setStep('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                    <Plus size={16} />
                    Tạo tổ chức mới
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Building2 className="text-blue-500" />
                        Tạo tổ chức y tế mới
                    </DialogTitle>
                    <DialogDescription>
                        Quy trình: Upload giấy phép → Tạo Smart Contract (Ký ví) → Đồng bộ hệ thống.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name" className="text-slate-800 font-medium">Tên tổ chức *</Label>
                        <Input
                            id="name"
                            placeholder="Ví dụ: Bệnh viện Bạch Mai"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="primaryAdmin" className="text-slate-800 font-medium">Địa chỉ Admin chính *</Label>
                        <Input
                            id="primaryAdmin"
                            placeholder="0x..."
                            value={formData.primaryAdmin}
                            onChange={(e) => setFormData(prev => ({ ...prev, primaryAdmin: e.target.value }))}
                        />
                        <p className="text-xs text-slate-500">
                            Ví này sẽ là Admin của tổ chức trên Blockchain.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="backupAdmin" className="text-slate-800 font-medium">Địa chỉ Admin dự phòng (tùy chọn)</Label>
                        <Input
                            id="backupAdmin"
                            placeholder="0x..."
                            value={formData.backupAdmin}
                            onChange={(e) => setFormData(prev => ({ ...prev, backupAdmin: e.target.value }))}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-slate-800 font-medium">Giấy phép hoạt động (File ảnh/PDF) *</Label>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-start text-slate-600"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                {file ? file.name : "Chọn file..."}
                            </Button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*,application/pdf"
                                onChange={handleFileChange}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                        Hủy
                    </Button>
                    <Button onClick={handleCreate} disabled={loading} className="bg-blue-600 hover:bg-blue-700 min-w-[140px]">
                        {loading ? (
                            <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                {step === 'uploading' && 'Uploading...'}
                                {step === 'blockchain' && 'Ký ví...'}
                                {step === 'syncing' && 'Đồng bộ...'}
                            </>
                        ) : (
                            'Tạo & Ký ví'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ============ ORGANIZATION CARD ============

function OrgCard({ org, onRefresh }) {
    const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'N/A';
    const isBackupSet = org.backupAdmin && org.backupAdmin !== '0x0000000000000000000000000000000000000000';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow"
        >
            <div className="flex justify-between items-start mb-3">
                <div>
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-blue-500" />
                        {org.name}
                    </h3>
                    <p className="text-sm text-slate-500">ID: {org.id}</p>
                </div>
                <Badge variant={org.active ? "default" : "secondary"} className={org.active ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}>
                    {org.active ? 'Hoạt động' : 'Vô hiệu'}
                </Badge>
            </div>

            <div className="space-y-3 text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-lg">
                <div className="flex justify-between items-center">
                    <span className="text-slate-500">Admin chính:</span>
                    <code className="text-xs bg-white border px-2 py-0.5 rounded font-mono text-slate-800">{shortAddr(org.primaryAdmin)}</code>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-slate-500">Admin dự phòng:</span>
                    <code className="text-xs bg-white border px-2 py-0.5 rounded font-mono text-slate-800">
                        {isBackupSet ? shortAddr(org.backupAdmin) : 'Chưa thiết lập'}
                    </code>
                </div>
                {org.licenseUrl && (
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500">Giấy phép:</span>
                        <a href={org.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Xem
                        </a>
                    </div>
                )}
                <div className="flex justify-between items-center">
                    <span className="text-slate-500">Ngày tạo:</span>
                    <span>{new Date(org.createdAt).toLocaleDateString('vi-VN')}</span>
                </div>
            </div>

            <div className="flex gap-2 pt-2 border-t mt-2">
                <Button variant="outline" size="sm" className="w-full text-xs h-8">
                    <Edit className="w-3 h-3 mr-1" />
                    Đổi Admin
                </Button>
                {/* Future: Add disable/enable button here */}
            </div>
        </motion.div>
    );
}

// ============ MAIN COMPONENT ============

export default function MinistryOrgManagement() {
    const [organizations, setOrganizations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchOrganizations = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.get('/api/admin/organizations');
            setOrganizations(data.organizations || []);
        } catch (error) {
            console.error('Error fetching organizations:', error);
            toast({
                title: "Lỗi",
                description: "Không thể tải danh sách tổ chức",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOrganizations();
    }, [fetchOrganizations]);

    const filteredOrgs = organizations.filter(org =>
        org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        org.primaryAdmin.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeCount = organizations.filter(o => o.active).length;

    return (
        <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-blue-100 rounded-xl">
                                <Building2 className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{organizations.length}</p>
                                <p className="text-sm text-slate-500">Tổng tổ chức</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-green-100 rounded-xl">
                                <CheckCircle className="h-6 w-6 text-green-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
                                <p className="text-sm text-slate-500">Đang hoạt động</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-red-100 rounded-xl">
                                <XCircle className="h-6 w-6 text-red-600" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-900">{organizations.length - activeCount}</p>
                                <p className="text-sm text-slate-500">Đã vô hiệu</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border shadow-sm">
                <div className="relative flex-1 w-full max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Tìm theo tên hoặc địa chỉ ví..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 border-slate-200 focus:border-blue-500 focus:ring-blue-500"
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" onClick={fetchOrganizations} disabled={loading} className="gap-2">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Làm mới
                    </Button>
                    <CreateOrgDialog onSuccess={fetchOrganizations} />
                </div>
            </div>

            {/* Organizations List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-dashed">
                    <RefreshCw className="h-10 w-10 animate-spin text-blue-500 mb-4" />
                    <p className="text-slate-500">Đang tải dữ liệu từ blockchain...</p>
                </div>
            ) : filteredOrgs.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="py-16 text-center">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Building2 className="h-8 w-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">
                            {searchTerm ? 'Không tìm thấy kết quả' : 'Chưa có tổ chức nào'}
                        </h3>
                        <p className="text-slate-500 max-w-sm mx-auto">
                            {searchTerm ? `Không có tổ chức nào khớp với từ khóa "${searchTerm}"` : 'Tạo tổ chức y tế đầu tiên để bắt đầu quản lý hệ thống.'}
                        </p>
                        {!searchTerm && (
                            <div className="mt-6">
                                <CreateOrgDialog onSuccess={fetchOrganizations} />
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                        {filteredOrgs.map((org) => (
                            <OrgCard key={org.id} org={org} onRefresh={fetchOrganizations} />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
