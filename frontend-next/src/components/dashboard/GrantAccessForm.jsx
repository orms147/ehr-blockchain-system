"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Share2, Loader2, CheckCircle, AlertCircle, FileText, Wallet } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { keyShareService, authService, relayerService } from '@/services';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from '@/services/nacl-crypto';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { signGrantConsent, computeCidHash, computeEncKeyHash, getDeadline } from '@/utils/eip712';
import { getNonce, userGrantConsent, createUserWalletClient } from '@/utils/contracts';
import { ensureCorrectChain, TARGET_CHAIN } from '@/utils/chainSwitch';

const GrantAccessForm = ({ onGrant }) => {
    const [address, setAddress] = useState('');
    const [duration, setDuration] = useState('1_week');
    const [selectedRecord, setSelectedRecord] = useState('');
    const [loading, setLoading] = useState(false);
    const [localRecords, setLocalRecords] = useState([]);
    const [quotaInfo, setQuotaInfo] = useState(null);
    const { address: walletAddress, provider } = useWalletAddress();

    // Load local records and quota on mount
    useEffect(() => {
        try {
            const records = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
            const recordList = Object.entries(records).map(([cidHash, data]) => ({
                cidHash,
                ...data
            }));
            setLocalRecords(recordList);
        } catch (e) {
            console.error('Error loading local records:', e);
        }

        // Load quota status
        relayerService.getQuotaStatus().then(setQuotaInfo).catch(console.error);
    }, []);

    // Calculate expiry timestamp based on duration
    const getExpiryTimestamp = () => {
        const now = Math.floor(Date.now() / 1000);
        switch (duration) {
            case '1_day':
                return now + 24 * 60 * 60;
            case '1_week':
                return now + 7 * 24 * 60 * 60;
            case '1_month':
                return now + 30 * 24 * 60 * 60;
            case 'forever':
                return 0; // 0 = forever in contract
            default:
                return now + 7 * 24 * 60 * 60;
        }
    };

    // Calculate expiry date for KeyShare (ISO string)
    const getExpiryDate = () => {
        const now = new Date();
        switch (duration) {
            case '1_day':
                return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
            case '1_week':
                return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
            case '1_month':
                return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
            case 'forever':
                return null;
            default:
                return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
            toast({
                title: "Địa chỉ không hợp lệ",
                description: "Vui lòng nhập địa chỉ ví Ethereum hợp lệ (0x...)",
                variant: "destructive",
            });
            return;
        }

        if (!selectedRecord) {
            toast({
                title: "Chưa chọn hồ sơ",
                description: "Vui lòng chọn hồ sơ để chia sẻ",
                variant: "destructive",
            });
            return;
        }

        if (!provider || !walletAddress) {
            toast({
                title: "Lỗi kết nối",
                description: "Vui lòng đăng nhập lại",
                variant: "destructive",
            });
            return;
        }

        setLoading(true);

        try {
            // 0. Ensure wallet is on correct chain
            toast({
                title: "Kiểm tra mạng",
                description: `Đang chuyển sang mạng ${TARGET_CHAIN.chainName}...`,
            });
            await ensureCorrectChain(provider);

            // Get the record data
            const recordData = localRecords.find(r => r.cidHash === selectedRecord);

            if (!recordData || !recordData.cid || !recordData.aesKey) {
                throw new Error('Không tìm thấy key mã hóa của hồ sơ này');
            }

            // 1. Fetch doctor's encryption public key
            const doctorKeyResponse = await authService.getEncryptionKey(address);
            if (!doctorKeyResponse?.encryptionPublicKey) {
                throw new Error('Bác sĩ chưa đăng ký khóa mã hóa. Họ cần đăng nhập trước.');
            }

            // 2. Get nonce from contract (MUST from contract, not backend)
            const nonce = await getNonce(walletAddress);
            console.log('📋 Current nonce from contract:', nonce);

            // 3. Prepare on-chain consent parameters
            const expireAt = getExpiryTimestamp();
            const deadline = getDeadline(1); // 1 hour validity
            const rootCidHash = selectedRecord; // Already a cidHash
            const encKeyHash = computeEncKeyHash(recordData.aesKey);

            // 4. Create wallet client and sign EIP-712 message
            const walletClient = createUserWalletClient(provider);

            toast({
                title: "Ký xác nhận",
                description: "Vui lòng ký xác nhận trên ví để cấp quyền on-chain...",
            });

            const signature = await signGrantConsent(walletClient, {
                patient: walletAddress,
                grantee: address,
                rootCidHash,
                encKeyHash,
                expireAt,
                includeUpdates: false,
                allowDelegate: false,
                deadline,
                nonce,
            });

            console.log('✍️ EIP-712 signature obtained');

            // 5. Try sponsored grant (if quota available), else self-pay
            let txHash;
            const quota = quotaInfo || await relayerService.getQuotaStatus();

            if (quota.uploadsRemaining > 0) {
                // Sponsored by relayer
                console.log('💸 Using sponsored grant (quota available)');
                const result = await relayerService.grantConsent({
                    granteeAddress: address,
                    cidHash: rootCidHash,
                    encKeyHash,
                    expireAt,
                    includeUpdates: false,
                    allowDelegate: false,
                    deadline,
                    signature,
                });
                txHash = result.txHash;
            } else {
                // Self-pay
                console.log('💳 Quota exhausted, user paying gas');
                toast({
                    title: "Hết quota miễn phí",
                    description: "Bạn sẽ trả gas cho giao dịch này",
                });
                txHash = await userGrantConsent(provider, {
                    patient: walletAddress,
                    grantee: address,
                    rootCidHash,
                    encKeyHash,
                    expireAt,
                    includeUpdates: false,
                    allowDelegate: false,
                    deadline,
                    signature,
                });
            }

            console.log('✅ On-chain consent granted:', txHash);

            // 6. Get patient's keypair and encrypt for doctor
            const patientKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

            const payload = JSON.stringify({
                cid: recordData.cid,
                aesKey: recordData.aesKey,
            });

            const encryptedPayload = encryptForRecipient(
                payload,
                doctorKeyResponse.encryptionPublicKey,
                patientKeypair.secretKey
            );

            // 7. Share encrypted key via backend (for key exchange, consent is on-chain)
            await keyShareService.shareKey({
                cidHash: selectedRecord,
                recipientAddress: address.toLowerCase(),
                encryptedPayload: encryptedPayload,
                senderPublicKey: patientKeypair.publicKey,
                expiresAt: getExpiryDate(),
            });

            console.log('✅ Key shared with Doctor');

            toast({
                title: "Chia sẻ thành công! (On-chain)",
                description: `Đã cấp quyền on-chain + chia sẻ key cho ${address.slice(0, 8)}...`,
                className: "bg-green-50 border-green-200 text-green-800",
            });

            // Callback
            if (onGrant) {
                onGrant({
                    address,
                    duration,
                    recordTitle: recordData.title,
                    cidHash: selectedRecord,
                    txHash,
                });
            }

            // Reset form
            setAddress('');
            setDuration('1_week');
            setSelectedRecord('');

            // Refresh quota
            relayerService.getQuotaStatus().then(setQuotaInfo).catch(console.error);

        } catch (err) {
            console.error('Share error:', err);
            toast({
                title: "Lỗi chia sẻ",
                description: err.message || 'Không thể chia sẻ hồ sơ. Vui lòng thử lại.',
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="border-slate-200 bg-white">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2 text-slate-900">
                    <Share2 className="w-5 h-5 text-blue-600" />
                    Cấp quyền truy cập
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Select Record */}
                    <div className="space-y-2">
                        <Label className="text-slate-700">Chọn hồ sơ *</Label>
                        {localRecords.length === 0 ? (
                            <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-500 text-sm">
                                <FileText className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                                Chưa có hồ sơ nào để chia sẻ
                            </div>
                        ) : (
                            <Select value={selectedRecord} onValueChange={setSelectedRecord}>
                                <SelectTrigger className="bg-white">
                                    <SelectValue placeholder="Chọn hồ sơ..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {localRecords.map((record) => (
                                        <SelectItem key={record.cidHash} value={record.cidHash}>
                                            <span className="flex items-center gap-2">
                                                <FileText className="w-4 h-4" />
                                                {record.title || 'Hồ sơ không tên'}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Doctor Address */}
                    <div className="space-y-2">
                        <Label htmlFor="address" className="text-slate-700">Địa chỉ ví bác sĩ *</Label>
                        <Input
                            id="address"
                            placeholder="0x..."
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            required
                            className="bg-white font-mono text-sm"
                        />
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                        <Label className="text-slate-700">Thời hạn</Label>
                        <Select value={duration} onValueChange={setDuration}>
                            <SelectTrigger className="bg-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1_day">1 Ngày</SelectItem>
                                <SelectItem value="1_week">1 Tuần</SelectItem>
                                <SelectItem value="1_month">1 Tháng</SelectItem>
                                <SelectItem value="forever">Vĩnh viễn</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={loading || localRecords.length === 0}
                    >
                        {loading ? (
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
                </form>
            </CardContent>
        </Card>
    );
};

export default GrantAccessForm;
