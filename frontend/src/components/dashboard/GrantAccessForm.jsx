"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Share2, Loader2, CheckCircle, AlertCircle, FileText, Wallet } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { keyShareService, authService, relayerService, recordService } from '@/services';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from '@/services/nacl-crypto';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { signGrantConsent, computeCidHash, computeEncKeyHash, getDeadline } from '@/utils/eip712';
import { decryptFromSender } from '@/services/nacl-crypto';
import { getNonce, userGrantConsent, createUserWalletClient } from '@/utils/contracts';
import { ensureCorrectChain, TARGET_CHAIN } from '@/utils/chainSwitch';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const GrantAccessForm = ({ onGrant }) => {
    const [address, setAddress] = useState('');
    const [duration, setDuration] = useState('1_week');
    const [allowDelegate, setAllowDelegate] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState('');
    const [loading, setLoading] = useState(false);
    const [showWarning, setShowWarning] = useState(false);
    const [localRecords, setLocalRecords] = useState([]);
    const [quotaInfo, setQuotaInfo] = useState(null);
    const { address: walletAddress, provider } = useWalletAddress();

    // Load local records and quota on mount
    // Only show LATEST records (ones without children)
    // Load records from backend and merge with local keys
    useEffect(() => {
        const loadRecords = async () => {
            try {
                // 1. Get backend records (Source of Truth)
                const backendRecords = await recordService.getMyRecords();

                // 2. Identify parents to hide
                // A record is "latest" if no other record points to it as parent
                // Note: We must ensure we don't hide records that might be "orphan" updates if data is weird, 
                // but generally: Set of all parentCidHashes.
                const parentCidHashes = new Set(backendRecords.map(r => r.parentCidHash?.toLowerCase()).filter(Boolean));

                // 3. Filter to get only latest records
                const latestBackendRecords = backendRecords.filter(r => !parentCidHashes.has(r.cidHash?.toLowerCase()));

                // 4. Merge with local storage to check for keys/titles
                const rawLocalMap = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
                const localDataMap = {};
                // Normalize keys to lowercase for robust lookup
                Object.keys(rawLocalMap).forEach(key => {
                    localDataMap[key.toLowerCase()] = rawLocalMap[key];
                });

                const displayRecords = latestBackendRecords.map(r => {
                    // Use lowercase lookup
                    const local = localDataMap[r.cidHash?.toLowerCase()] || {};
                    return {
                        cidHash: r.cidHash,
                        title: local.title || r.title || 'Hồ sơ chưa xem', // Prefer local title (decrypted), then backend
                        createdAt: r.createdAt,
                        hasKey: !!local.aesKey, // Flag to know if we need to fetch key
                        aesKey: local.aesKey, // CRITICAL: Include the key itself!
                        ...r // Include all backend props
                    };
                });

                // Sort by new to old
                displayRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                setLocalRecords(displayRecords);
            } catch (e) {
                console.error('Error loading records:', e);
                toast({
                    title: "Lỗi tải danh sách",
                    description: "Không thể làm mới danh sách hồ sơ từ server.",
                    variant: "destructive"
                });
                // Fallback to local storage if backend fails completely
                const records = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
                const list = Object.values(records);
                setLocalRecords(list);
            }
        };
        loadRecords();

        // Load quota status
        relayerService.getQuotaStatus().then(setQuotaInfo).catch(console.error);
    }, []);

    // Calculate expiry timestamp based on duration
    const getExpiryTimestamp = () => {
        const now = Math.floor(Date.now() / 1000);
        switch (duration) {
            case '10_minutes':
                return now + 10 * 60;
            case '30_minutes':
                return now + 30 * 60;
            case '1_day':
                return now + 24 * 60 * 60;
            case '2_days':
                return now + 2 * 24 * 60 * 60;
            case '3_days':
                return now + 3 * 24 * 60 * 60;
            case '1_week':
                return now + 7 * 24 * 60 * 60;
            case '2_weeks':
                return now + 14 * 24 * 60 * 60;
            case '1_month':
                return now + 30 * 24 * 60 * 60;
            case '3_months':
                return now + 90 * 24 * 60 * 60;
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
            case '10_minutes':
                return new Date(now.getTime() + 10 * 60 * 1000).toISOString();
            case '30_minutes':
                return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
            case '1_day':
                return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
            case '2_days':
                return new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();
            case '3_days':
                return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
            case '1_week':
                return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
            case '2_weeks':
                return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
            case '1_month':
                return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
            case '3_months':
                return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
            case 'forever':
                return null;
            default:
                return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        }
    };

    const validateForm = () => {
        if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
            toast({
                title: "Địa chỉ không hợp lệ",
                description: "Vui lòng nhập địa chỉ ví Ethereum hợp lệ (0x...)",
                variant: "destructive",
            });
            return false;
        }
        if (!selectedRecord) {
            toast({
                title: "Chưa chọn hồ sơ",
                description: "Vui lòng chọn hồ sơ để chia sẻ",
                variant: "destructive",
            });
            return false;
        }
        if (!provider || !walletAddress) {
            toast({
                title: "Lỗi kết nối",
                description: "Vui lòng đăng nhập lại",
                variant: "destructive",
            });
            return false;
        }
        return true;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        if (allowDelegate) {
            setShowWarning(true);
        } else {
            handleProcessGrant();
        }
    };

    const handleProcessGrant = async () => {
        if (!validateForm()) return; // Re-validate just in case
        setLoading(true);

        try {
            // 0. Check for existing active access (Duplicate Grant Prevention)
            try {
                const accessList = await recordService.getAccessList(selectedRecord);
                const existingAccess = (accessList || []).find(
                    a => a.granteeAddress?.toLowerCase() === address.toLowerCase() && a.active
                );
                if (existingAccess) {
                    const expiresAt = existingAccess.expiresAt ? new Date(existingAccess.expiresAt).toLocaleDateString('vi-VN') : 'Vĩnh viễn';
                    toast({
                        title: "⚠️ Đã có quyền truy cập!",
                        description: `Bác sĩ ${address.slice(0, 8)}... đã có quyền truy cập hồ sơ này (hết hạn: ${expiresAt}). Tiếp tục sẽ gia hạn quyền.`,
                        className: "bg-amber-50 border-amber-200 text-amber-800",
                    });
                    // Don't block, just warn and continue (user chose to proceed)
                }
            } catch (checkErr) {
                console.warn('Could not check existing access:', checkErr);
            }

            // 0.5 Ensure wallet is on correct chain
            toast({
                title: "Đang xử lý",
                description: `Đang chuyển sang mạng ${TARGET_CHAIN.chainName} và chuẩn bị giao dịch...`,
            });
            await ensureCorrectChain(provider);

            // Get the record data
            let recordData = localRecords.find(r => r.cidHash === selectedRecord);
            let cid = recordData?.cid;
            let aesKey = recordData?.aesKey;

            // If we don't have the key locally (e.g. backend record that hasn't been viewed), fetch it
            if (!aesKey) {
                toast({
                    title: "Đang lấy key...",
                    description: "Hồ sơ chưa được lưu ở máy. Đang tải key từ server...",
                });

                try {
                    const sharedKey = await keyShareService.getKeyForRecord(selectedRecord);
                    if (!sharedKey) throw new Error("Không tìm thấy key của hồ sơ này.");

                    // Decrypt
                    const myKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

                    // Try Decrypt (supports NaCl or Base64 fallback like RecordModal)
                    let keyData;
                    try {
                        const decryptedPayload = decryptFromSender(
                            sharedKey.encryptedPayload,
                            sharedKey.senderPublicKey,
                            myKeypair.secretKey
                        );
                        keyData = JSON.parse(decryptedPayload);
                    } catch (naclError) {
                        // Fallback
                        try {
                            const decoded = atob(sharedKey.encryptedPayload);
                            keyData = JSON.parse(decoded);
                        } catch {
                            keyData = JSON.parse(sharedKey.encryptedPayload);
                        }
                    }

                    // Extract
                    if (keyData.encryptedData && keyData.aesKey) {
                        cid = keyData.metadata?.cid;
                        aesKey = keyData.aesKey;
                        // If CID missing in metadata, fetch record hash (edge case)
                        if (!cid && recordData.cidHash) {
                            const r = await recordService.getByHash(recordData.cidHash);
                            cid = r?.cid;
                        }
                    } else if (keyData.cid && keyData.aesKey) {
                        cid = keyData.cid;
                        aesKey = keyData.aesKey;
                    }

                    if (!cid || !aesKey) {
                        console.error("Critical: Failed to resolve Key/CID", { cid, hasKey: !!aesKey });
                        throw new Error("Không thể khôi phục key giải mã. Vui lòng mở xem hồ sơ này trước để tải key về máy.");
                    }

                } catch (e) {
                    console.error("Key recovery failed:", e);
                    throw e;
                }
            }

            // 7. Validate that we have proper key material to share
            if (!recordData.cid || !recordData.aesKey) {
                // Last ditch attempt: Check if we just resolved it in the block above
                if (cid && aesKey) {
                    recordData.cid = cid;
                    recordData.aesKey = aesKey;
                } else {
                    // Try one last desperate lookup from localStorage
                    const rawLocal = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
                    const directLocal = rawLocal[recordData.cidHash] || rawLocal[recordData.cidHash?.toLowerCase()];

                    if (directLocal && directLocal.aesKey) {
                        recordData.aesKey = directLocal.aesKey;
                        recordData.cid = directLocal.cid || recordData.cid;
                    }

                    // Final check
                    if (!recordData.aesKey || !recordData.cid) {
                        throw new Error('Không tìm thấy dữ liệu khóa bảo mật. Hãy thử "Xem" hồ sơ trước khi cấp quyền.');
                    }
                }
            }

            // Update recordData with resolved values for use below
            recordData = { ...recordData, cid, aesKey };

            // 1. Fetch doctor's encryption public key
            const doctorKeyResponse = await authService.getEncryptionKey(address);
            if (!doctorKeyResponse?.encryptionPublicKey) {
                throw new Error('Bác sĩ chưa đăng ký khóa mã hóa. Họ cần đăng nhập trước.');
            }

            // 2. Resolve Root CID & Chain (For consistency with Revoke logic)
            // effectiveRootCid is used for On-Chain Consent.
            let effectiveRootCid = selectedRecord;
            let chainCids = [selectedRecord];

            try {
                const chainData = await recordService.getChainCids(selectedRecord);
                if (chainData?.rootCidHash) {
                    effectiveRootCid = chainData.rootCidHash;
                }
                if (chainData?.chainCids) {
                    chainCids = chainData.chainCids;
                }
            } catch (e) {
                console.warn('Could not fetch chain CIDs, defaulting to single record:', e);
            }

            // 3. Get nonce from contract check
            const nonce = await getNonce(walletAddress);

            // 4. Prepare parameters
            const expireAt = getExpiryTimestamp();
            const deadline = getDeadline(1);
            const encKeyHash = computeEncKeyHash(recordData.aesKey);

            // 5. Create wallet client and sign EIP-712 message
            const walletClient = createUserWalletClient(provider);

            toast({
                title: allowDelegate ? "Ký ủy quyền (Có chia sẻ lại)" : "Ký cấp quyền truy cập",
                description: "Vui lòng ký xác nhận trên ví...",
            });

            const signature = await signGrantConsent(walletClient, {
                patient: walletAddress,
                grantee: address,
                rootCidHash: effectiveRootCid, // Use Root!
                encKeyHash,
                expireAt,
                includeUpdates: false,
                allowDelegate: allowDelegate,
                deadline,
                nonce,
            });

            // 6. Try sponsored grant (if quota available), else self-pay
            let txHash;
            const quota = quotaInfo || await relayerService.getQuotaStatus();

            if (quota.uploadsRemaining > 0) {
                // Sponsored by relayer
                const result = await relayerService.grantConsent({
                    granteeAddress: address,
                    cidHash: effectiveRootCid, // Use Root!
                    encKeyHash,
                    expireAt,
                    includeUpdates: false,
                    allowDelegate: allowDelegate,
                    deadline,
                    signature,
                });
                txHash = result.txHash;
            } else {
                // Self-pay
                toast({
                    title: "Hết quota miễn phí",
                    description: "Bạn sẽ trả gas cho giao dịch này",
                });
                txHash = await userGrantConsent(provider, {
                    patient: walletAddress,
                    grantee: address,
                    rootCidHash: effectiveRootCid, // Use Root!
                    encKeyHash,
                    expireAt,
                    includeUpdates: false,
                    allowDelegate: allowDelegate,
                    deadline,
                    signature,
                });
            }

            // 7. Get patient's keypair
            const patientKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

            // 8. Share keys for ALL records in the chain
            const allLocalRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');

            // CRITICAL FIX: Ensure the currently selected (and decrypted) record is in the list of keys to share.
            // Even if it wasn't in localStorage initially, we resolved 'recordData.aesKey' above.
            if (recordData.cid && recordData.aesKey) {
                allLocalRecords[selectedRecord] = {
                    cid: recordData.cid,
                    aesKey: recordData.aesKey
                };
            }

            for (const chainCidHash of chainCids) {
                const chainRecordData = allLocalRecords[chainCidHash];
                if (!chainRecordData?.cid || !chainRecordData?.aesKey) {
                    console.warn(`Missing local key for ${chainCidHash.slice(0, 16)}...`);
                    continue;
                }

                const payload = JSON.stringify({
                    cid: chainRecordData.cid,
                    aesKey: chainRecordData.aesKey,
                });

                const encryptedPayload = encryptForRecipient(
                    payload,
                    doctorKeyResponse.encryptionPublicKey,
                    patientKeypair.secretKey
                );

                // RETRY LOGIC: Wait for blockchain propagation
                let retries = 5;
                while (retries > 0) {
                    try {
                        await keyShareService.shareKey({
                            cidHash: chainCidHash,
                            recipientAddress: address.toLowerCase(),
                            encryptedPayload: encryptedPayload,
                            senderPublicKey: patientKeypair.publicKey,
                            expiresAt: getExpiryDate(),
                            allowDelegate: allowDelegate,
                        });
                        break; // Success
                    } catch (err) {
                        // If 403 (On-chain consent missing), wait and retry
                        if (err.message && err.message.includes('consent') && retries > 1) {
                            console.log(`Waiting for consent propagation... (${retries} left)`);
                            await new Promise(r => setTimeout(r, 2000)); // Wait 2s
                            retries--;
                            continue;
                        }
                        throw err; // Other error
                    }
                }
            }
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
        <>
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
                                <div className="border rounded-xl overflow-hidden">
                                    <div className="max-h-60 overflow-y-auto bg-slate-50/50 p-2 space-y-2">
                                        {localRecords.map((record) => (
                                            <div
                                                key={record.cidHash}
                                                onClick={() => setSelectedRecord(record.cidHash)}
                                                className={`
                                                    relative p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3
                                                    ${selectedRecord === record.cidHash
                                                        ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500'
                                                        : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                                                    }
                                                `}
                                            >
                                                <div className={`
                                                    w-4 h-4 rounded-full border flex items-center justify-center shrink-0
                                                    ${selectedRecord === record.cidHash ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}
                                                `}>
                                                    {selectedRecord === record.cidHash && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                                </div>

                                                <div className="flex-1 overflow-hidden">
                                                    <p className="font-medium text-slate-900 truncate">
                                                        {record.title || 'Hồ sơ không tên'}
                                                    </p>
                                                    <p className="text-xs text-slate-500 truncate">
                                                        {new Date(record.createdAt).toLocaleDateString('vi-VN')} • {record.cidHash.slice(0, 8)}...
                                                    </p>
                                                </div>

                                                <FileText className={`w-5 h-5 ${selectedRecord === record.cidHash ? 'text-blue-600' : 'text-slate-400'}`} />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-slate-100 px-3 py-2 text-xs text-slate-500 border-t border-slate-200 text-center">
                                        Đã tìm thấy {localRecords.length} hồ sơ khả dụng
                                    </div>
                                </div>
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
                                    <SelectItem value="10_minutes">10 Phút (Test)</SelectItem>
                                    <SelectItem value="30_minutes">30 Phút (Test)</SelectItem>
                                    <SelectItem value="1_day">1 Ngày</SelectItem>
                                    <SelectItem value="2_days">2 Ngày</SelectItem>
                                    <SelectItem value="3_days">3 Ngày</SelectItem>
                                    <SelectItem value="1_week">1 Tuần</SelectItem>
                                    <SelectItem value="2_weeks">2 Tuần</SelectItem>
                                    <SelectItem value="1_month">1 Tháng</SelectItem>
                                    <SelectItem value="3_months">3 Tháng</SelectItem>
                                    <SelectItem value="forever">Vĩnh viễn</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Delegate Option */}
                        <div className="flex items-start space-x-3 pt-2 rounded-lg border border-slate-100 p-3 bg-slate-50">
                            <input
                                type="checkbox"
                                id="allowDelegate"
                                checked={allowDelegate}
                                onChange={(e) => setAllowDelegate(e.target.checked)}
                                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                            />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="allowDelegate" className="cursor-pointer font-medium text-slate-700">
                                    Cho phép chia sẻ lại (Hội chẩn)
                                </Label>
                                <p className="text-xs text-slate-500">
                                    Nếu chọn, bác sĩ có thể chia sẻ hồ sơ này cho các bác sĩ khác để hội chẩn.
                                </p>
                            </div>
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
            </Card >
            <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-600 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            Cảnh báo quyền riêng tư
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3 pt-2 text-slate-700">
                            <span className="block font-medium">
                                Bạn đang cấp quyền <strong>CHO PHÉP CHIA SẺ LẠI (Delegation)</strong> cho bác sĩ này.
                            </span>
                            <span className="block">
                                Điều này có nghĩa là bác sĩ nhận được hồ sơ <strong>sẽ có quyền chia sẻ tiếp</strong> hồ sơ của bạn cho người khác (ví dụ: bác sĩ chuyên khoa khác để hội chẩn) mà không cần hỏi lại ý kiến bạn.
                            </span>
                            <span className="block bg-red-50 p-3 rounded-md border border-red-100 text-sm text-red-800">
                                Hãy chắc chắn rằng bạn tin tưởng bác sĩ này hoàn toàn trước khi cấp quyền ủy quyền.
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setLoading(false)}>Hủy bỏ</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleProcessGrant}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            Tôi hiểu và Đồng ý
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

export default GrantAccessForm;
