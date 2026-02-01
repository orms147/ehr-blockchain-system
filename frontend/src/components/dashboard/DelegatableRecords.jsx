"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Users, Share2, Loader2, FileText, AlertCircle, CheckCircle,
    RefreshCw, User
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { keyShareService, authService, createKeySharePayload } from '@/services';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from '@/services/nacl-crypto';
import { useWeb3Auth } from '@web3auth/modal/react';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { ensureCorrectChain } from '@/utils/chainSwitch';
import { CONSENT_LEDGER_ABI, ACCESS_CONTROL_ABI } from '@/config/contractABI';

const CONSENT_LEDGER_ADDRESS = process.env.NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS;
const ACCESS_CONTROL_ADDRESS = process.env.NEXT_PUBLIC_ACCESS_CONTROL_ADDRESS;

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'),
});

const EXPIRY_OPTIONS = [
    { value: '1d', label: '1 Ngày' },
    { value: '7d', label: '7 Ngày' },
    { value: '30d', label: '30 Ngày' },
];

/**
 * DelegatableRecords - Shows records that the doctor can re-share to other doctors
 * (RecordDelegation feature)
 */
export default function DelegatableRecords() {
    const { provider } = useWeb3Auth();
    const { address: walletAddress } = useWalletAddress();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Re-share modal state
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [recipientAddress, setRecipientAddress] = useState('');
    const [recipientInfo, setRecipientInfo] = useState(null);
    const [expiry, setExpiry] = useState('7d');
    const [isSharing, setIsSharing] = useState(false);
    const [checkingRecipient, setCheckingRecipient] = useState(false);



    // Filter expiry options based on sender's expiration
    const validExpiryOptions = React.useMemo(() => {
        if (!selectedRecord?.expiresAt) return EXPIRY_OPTIONS;

        const expiresAtDate = new Date(selectedRecord.expiresAt);
        const now = new Date();
        const diffMs = expiresAtDate - now;
        const remainingDays = diffMs / (1000 * 60 * 60 * 24);

        if (remainingDays <= 0) return [];

        const options = EXPIRY_OPTIONS.filter(opt => {
            const days = parseInt(opt.value);
            return days <= remainingDays;
        });

        // Always add "Remaining Time" option
        const remainingHours = Math.floor(diffMs / (1000 * 60 * 60));
        options.push({
            value: 'remaining',
            label: `Toàn bộ thời gian còn lại (${remainingHours} giờ)`
        });

        return options;
    }, [selectedRecord]);

    // Reset expiry if current selection is invalid
    useEffect(() => {
        if (selectedRecord && validExpiryOptions.length > 0) {
            const currentDays = parseInt(expiry);
            const isValid = validExpiryOptions.some(opt => opt.value === expiry);
            if (!isValid) {
                setExpiry(validExpiryOptions[0].value);
            }
        }
    }, [selectedRecord, validExpiryOptions]);

    useEffect(() => {
        fetchDelegatableRecords();
    }, []);

    const fetchDelegatableRecords = async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await keyShareService.getDelegatableRecords();
            // Only show records that I have explicitly accepted ("claimed")
            const acceptedRecords = (result || []).filter(r => r.status === 'claimed');
            setRecords(acceptedRecords);
        } catch (err) {
            console.error('Fetch delegatable records error:', err);
            setError('Không thể tải danh sách hồ sơ có thể chia sẻ');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenShareModal = (record) => {
        setSelectedRecord(record);
        setRecipientAddress('');
        setRecipientInfo(null);
        setExpiry('7d');
        setShowShareModal(true);
    };

    const handleVerifyRecipient = async () => {
        if (!recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
            toast({ title: "Lỗi", description: "Địa chỉ ví không hợp lệ", variant: "destructive" });
            return;
        }

        setCheckingRecipient(true);
        try {
            // Check if recipient is a valid doctor
            const status = await publicClient.readContract({
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'getUserStatus',
                args: [recipientAddress]
            });

            // status: [isPatient, isDoctor, isDoctorVerified, isOrg, isOrgVerified, isMinistry]
            let roleLabel = 'Người dùng';
            if (status[2]) roleLabel = 'Bác sĩ (Đã xác minh)';
            else if (status[1]) roleLabel = 'Bác sĩ';
            else if (status[4]) roleLabel = 'Tổ chức Y tế (Đã xác minh)';
            else if (status[3]) roleLabel = 'Tổ chức Y tế';

            // Get encryption key
            const info = await authService.getEncryptionKey(recipientAddress);
            if (!info?.encryptionPublicKey) {
                throw new Error('Người nhận chưa đăng ký khóa mã hóa');
            }

            setRecipientInfo({
                ...info,
                roleLabel,
            });
        } catch (err) {
            console.error('Verify recipient error:', err);
            toast({
                title: "Lỗi",
                description: err.message || "Không thể xác thực người nhận",
                variant: "destructive"
            });
            setRecipientInfo(null);
        } finally {
            setCheckingRecipient(false);
        }
    };

    const handleReShare = async () => {
        if (!selectedRecord || !recipientInfo || !provider) {
            toast({ title: "Lỗi", description: "Thiếu thông tin", variant: "destructive" });
            return;
        }

        setIsSharing(true);
        try {
            // Get my keypair
            const myKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

            // Get the original key from localStorage
            const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
            let localRecord = localRecords[selectedRecord.cidHash];

            // SMART SHARING: Find if there's a newer version (Doctor Update) that stems from this root
            // We want to share the LATEST version so the recipient sees the update.
            let currentHash = selectedRecord.cidHash;
            let latestHash = currentHash;
            let hops = 0;

            // Build dependency map for fast traversal
            const parentToChild = {};
            Object.values(localRecords).forEach(rec => {
                if (rec.parentCidHash) {
                    parentToChild[rec.parentCidHash] = rec;
                }
            });

            // Traverse down
            while (parentToChild[latestHash]) {
                const child = parentToChild[latestHash];
                // Check if we actually have the key for the child (we should, if we are the one who updated or viewed it)
                const childHash = Object.keys(localRecords).find(k => localRecords[k].cid === child.cid); // Reverse lookup hash if needed, or just use child's key if map stored it.
                // Actually my map stored the value 'rec', but I need the KEY (cidHash) to continue traversal if 'rec' object doesn't have it standard.
                // Wait, record object structure in localStorage doesn't always have 'cidHash' field explicitly inside it?
                // It's the Key of the localStorage map.
                // Let's refine the map builder.
                latestHash = null; // Reset and break if logic complex, or:
                break;
            }

            // Re-implement robust traversal
            // 1. Convert to array with IDs
            const allLocal = Object.entries(localRecords).map(([k, v]) => ({ ...v, id: k }));
            let currentNode = allLocal.find(r => r.id === selectedRecord.cidHash);

            if (currentNode) {
                let foundNext = true;
                while (foundNext && hops < 50) { // Safety break
                    const nextNode = allLocal.find(r => r.parentCidHash === currentNode.id);
                    if (nextNode) {
                        currentNode = nextNode;
                        hops++;
                        console.log(`[SmartShare] Found newer version: ${currentNode.id} (Hops: ${hops})`);
                    } else {
                        foundNext = false;
                    }
                }

                if (hops > 0) {
                    localRecord = currentNode;
                    console.log(`[SmartShare] Switching to latest version: ${currentNode.id}`);
                }
            }

            if (!localRecord) {
                throw new Error('Không tìm thấy khóa giải mã trong bộ nhớ. Bạn cần xem hồ sơ trước.');
            }

            // Create payload and encrypt for new recipient
            const payload = await createKeySharePayload(localRecord.cid, localRecord.aesKey);
            const encryptedPayload = encryptForRecipient(
                payload,
                recipientInfo.encryptionPublicKey,
                myKeypair.secretKey
            );

            // Calculate expiry
            let expiresAt = null;
            if (expiry === 'remaining') {
                // Use exact expiration of delegation source
                expiresAt = selectedRecord.expiresAt;
            } else if (expiry !== 'never') {
                const days = parseInt(expiry);
                expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
            }

            // Call on-chain grantUsingRecordDelegation
            // CRITICAL: Ensure correct chain before creating client
            await ensureCorrectChain(provider);

            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });
            const [account] = await walletClient.getAddresses();

            // Fix Gas Issue: Estimate fees manually and add buffer
            const publicClient = createPublicClient({
                chain: arbitrumSepolia,
                transport: http()
            });

            // Get current gas info
            const gasPrice = await publicClient.estimateFeesPerGas();
            // Add 10% buffer to handle fluctuations
            const maxFeePerGas = (gasPrice.maxFeePerGas * 120n) / 100n;
            const maxPriorityFeePerGas = (gasPrice.maxPriorityFeePerGas * 120n) / 100n;

            toast({
                title: "Đang ghi blockchain...",
                description: "Đang cấp quyền truy cập cho bác sĩ khác...",
            });

            // Get encKeyHash
            const { keccak256, toBytes } = await import('viem');
            const encKeyHash = keccak256(toBytes(localRecord.aesKey));
            const expiryTimestamp = expiresAt
                ? Math.floor(new Date(expiresAt).getTime() / 1000)
                : 0;

            // Call contract
            const hash = await walletClient.writeContract({
                account,
                address: CONSENT_LEDGER_ADDRESS,
                abi: CONSENT_LEDGER_ABI,
                functionName: 'grantUsingRecordDelegation',
                args: [
                    selectedRecord.record.ownerAddress, // patient
                    recipientAddress,                   // newGrantee
                    selectedRecord.rootCidHash || selectedRecord.cidHash,             // rootCidHash (Use Root for delegation check!)
                    encKeyHash,                         // encKeyHash
                    expiryTimestamp,                    // expireAt
                ],
                maxFeePerGas,
                maxPriorityFeePerGas
            });

            toast({
                title: "Đang chờ xác nhận...",
                description: "Giao dịch đang được xử lý trên blockchain...",
            });

            await publicClient.waitForTransactionReceipt({ hash });

            // Share key via backend
            // CRITICAL FIX: Share the key for the ACTUAL record version we are sharing (localRecord.id),
            // NOT just the root (selectedRecord.cidHash). This ensures the recipient gets the V3 Key for V3 CID.
            // But we must also ensure we obtained on-chain consent for the ROOT (which covers the child).
            // Backend "checkConsent" must handle child-to-root validation, or we rely on 'grantUsingRecordDelegation' 
            // successfully establishing the permission just now.

            await keyShareService.shareKey({
                cidHash: localRecord.id || selectedRecord.cidHash, // Use the specific version hash
                recipientAddress: recipientAddress.toLowerCase(),
                encryptedPayload,
                senderPublicKey: myKeypair.publicKey,
                expiresAt,
                allowDelegate: false, // Re-shared records can't be delegated further (chain of 1)
            });

            toast({
                title: "Thành công!",
                description: `Đã chia sẻ hồ sơ cho ${recipientAddress.slice(0, 10)
                    }...`,
                className: "bg-green-50 border-green-200 text-green-800",
            });

            setShowShareModal(false);
            fetchDelegatableRecords();

        } catch (err) {
            console.error('Re-share error:', err);
            const errorMsg = err.message || 'Không thể chia sẻ hồ sơ';

            if (errorMsg.includes('rejected') || errorMsg.includes('denied')) {
                toast({ title: "Đã hủy", description: "Bạn đã hủy giao dịch", variant: "destructive" });
            } else if (errorMsg.includes('Unauthorized')) {
                toast({
                    title: "Không có quyền",
                    description: "Bạn không còn quyền chia sẻ hồ sơ này",
                    variant: "destructive"
                });
            } else {
                toast({ title: "Lỗi", description: errorMsg, variant: "destructive" });
            }
        } finally {
            setIsSharing(false);
        }
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="py-12 flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500 mb-4" />
                    <p className="text-slate-500">Đang tải...</p>
                </CardContent>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className="border-red-200">
                <CardContent className="py-8 flex flex-col items-center justify-center">
                    <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
                    <p className="text-red-600">{error}</p>
                    <Button variant="outline" onClick={fetchDelegatableRecords} className="mt-4">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Thử lại
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-purple-600" />
                        Hồ Sơ Có Thể Chia Sẻ Lại
                    </CardTitle>
                    <CardDescription>
                        Các hồ sơ mà bệnh nhân cho phép bạn chia sẻ cho bác sĩ khác (VD: hội chẩn)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {records.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                            <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                            <p>Chưa có hồ sơ nào có quyền chia sẻ lại</p>
                            <p className="text-sm mt-2">
                                Khi bệnh nhân chia sẻ hồ sơ với tùy chọn "Cho phép chia sẻ lại",
                                hồ sơ sẽ xuất hiện ở đây.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {records.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-purple-300 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                                            <FileText className="w-5 h-5 text-purple-600" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-900">
                                                {item.record?.title || 'Hồ sơ y tế'}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                                Bệnh nhân: {item.record?.ownerAddress?.slice(0, 10)}...
                                            </p>
                                            {item.expiresAt && (
                                                <p className="text-xs text-orange-600 mt-1">
                                                    Hết hạn: {new Date(item.expiresAt).toLocaleDateString('vi-VN')}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        className="bg-purple-600 hover:bg-purple-700"
                                        onClick={() => handleOpenShareModal(item)}
                                    >
                                        <Share2 className="w-4 h-4 mr-2" />
                                        Chia sẻ
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Re-share Modal */}
            <Dialog open={showShareModal} onOpenChange={setShowShareModal}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Share2 className="w-5 h-5 text-purple-600" />
                            Chia Sẻ Hồ Sơ (Hội Chẩn)
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {selectedRecord && (
                            <div className="bg-purple-50 p-3 rounded-lg text-sm">
                                <p className="font-medium text-purple-900">
                                    {selectedRecord.record?.title || 'Hồ sơ y tế'}
                                </p>
                                <p className="text-purple-600 text-xs mt-1">
                                    Bệnh nhân: {selectedRecord.record?.ownerAddress?.slice(0, 12)}...
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-slate-800 font-medium">
                                Địa chỉ ví Bác sĩ nhận *
                            </Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="0x..."
                                    value={recipientAddress}
                                    onChange={(e) => {
                                        setRecipientAddress(e.target.value);
                                        setRecipientInfo(null);
                                    }}
                                    className="flex-1"
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleVerifyRecipient}
                                    disabled={checkingRecipient}
                                >
                                    {checkingRecipient ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        'Xác thực'
                                    )}
                                </Button>
                            </div>
                        </div>

                        {recipientInfo && (
                            <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-lg">
                                <CheckCircle className="w-4 h-4" />
                                <div>
                                    <p>{recipientInfo.roleLabel}</p>
                                    <p className="text-xs text-green-500">
                                        {recipientInfo.walletAddress?.slice(0, 15)}...
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-slate-800 font-medium">Thời hạn</Label>
                            <Select value={expiry} onValueChange={setExpiry}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {validExpiryOptions.length > 0 ? (
                                        validExpiryOptions.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))
                                    ) : (
                                        <div className="p-2 text-sm text-red-500">Hết hạn hoặc dưới 1 ngày</div>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                            <p className="text-amber-800">
                                <strong>Lưu ý:</strong> Bệnh nhân sẽ thấy được ai đã xem hồ sơ này.
                                Việc chia sẻ sẽ được ghi nhận trên blockchain.
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowShareModal(false)}>
                            Hủy
                        </Button>
                        <Button
                            onClick={handleReShare}
                            disabled={!recipientInfo || isSharing}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            {isSharing ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Đang xử lý...
                                </>
                            ) : (
                                <>
                                    <Share2 className="w-4 h-4 mr-2" />
                                    Chia sẻ hồ sơ
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
