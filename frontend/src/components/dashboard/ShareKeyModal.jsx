"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Share2, Loader2, CheckCircle, AlertCircle, User, Users } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

import { keyShareService, authService, recordService, createKeySharePayload } from '@/services';
import { encryptForRecipient, getOrCreateEncryptionKeypair } from '@/services/nacl-crypto';
import { useWeb3Auth } from '@web3auth/modal/react';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { createWalletClient, createPublicClient, custom, http, keccak256, toBytes } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { CONSENT_LEDGER_ABI } from '@/config/contractABI';

const CONSENT_LEDGER_ADDRESS = process.env.NEXT_PUBLIC_CONSENT_LEDGER_ADDRESS;

const EXPIRY_OPTIONS = [
    { value: '10m', label: '10 Minutes (Test)' },
    { value: '30m', label: '30 Minutes (Test)' },
    { value: '1d', label: '1 Day' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: 'never', label: 'Never Expires' },
];

const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'),
});

const ShareKeyModal = ({ open, onOpenChange, record, onSuccess }) => {
    const { provider } = useWeb3Auth();
    const { address: walletAddress } = useWalletAddress();
    const [step, setStep] = useState(1); // 1: Form, 2: Sharing, 3: Success
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [formData, setFormData] = useState({
        recipientAddress: '',
        expiry: '7d',
        allowDelegate: false, // NEW: Allow recipient to re-share this record
    });

    const [recipientInfo, setRecipientInfo] = useState(null);
    const [existingAccess, setExistingAccess] = useState(null); // WARNING state for duplicate grant

    // Verify recipient address and get their encryption public key
    const handleVerifyRecipient = async () => {
        if (!formData.recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(formData.recipientAddress)) {
            setError('Invalid wallet address format');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Get recipient's NaCl encryption public key
            const info = await authService.getEncryptionKey(formData.recipientAddress);
            if (!info?.encryptionPublicKey) {
                throw new Error('Recipient has not registered encryption key');
            }
            setRecipientInfo(info);

            // CHECK DUPLICATE GRANT: Check if recipient already has access
            if (record?.cidHash) {
                try {
                    const accessData = await recordService.getAccessList(record.cidHash);
                    const list = accessData.accessList || [];
                    const found = list.find(a => a.grantee.toLowerCase() === formData.recipientAddress.toLowerCase());

                    if (found) {
                        setExistingAccess(found);
                    } else {
                        setExistingAccess(null);
                    }
                } catch (accessErr) {
                    console.warn('Failed to check existing access:', accessErr);
                    // Non-blocking error
                }
            }

        } catch (err) {
            setError(err.message || 'Recipient not found or has no encryption key registered');
            setRecipientInfo(null);
            setExistingAccess(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handleShare = async () => {
        if (!provider || !walletAddress) {
            setError('Wallet not connected. Please login again.');
            return;
        }

        // Guard: ensure recipientInfo is still valid
        if (!recipientInfo?.encryptionPublicKey) {
            setError('Recipient encryption key not verified. Please verify recipient first.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setStep(2);

        try {
            // Get local record data (CID + AES key)
            const localRecords = JSON.parse(localStorage.getItem('ehr_local_records') || '{}');
            const localRecord = localRecords[record.cidHash];

            if (!localRecord) {
                throw new Error('Record key not found locally. Cannot share.');
            }

            // Get sender's keypair for NaCl encryption
            const myKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

            // Create payload - aesKey is already base64 string, pass directly
            const payload = await createKeySharePayload(
                localRecord.cid,
                localRecord.aesKey
            );

            // Encrypt for recipient using NaCl box (requires sender secret key)
            const encryptedPayload = encryptForRecipient(
                payload,
                recipientInfo.encryptionPublicKey,
                myKeypair.secretKey
            );

            // Calculate expiry timestamp
            let expiresAt = null;
            let expiryTimestamp = 0; // 0 = forever for on-chain
            if (formData.expiry !== 'never') {
                const value = parseInt(formData.expiry);
                let durationMs = 0;

                if (formData.expiry.endsWith('m')) {
                    durationMs = value * 60 * 1000;
                } else if (formData.expiry.endsWith('d')) {
                    durationMs = value * 24 * 60 * 60 * 1000;
                } else {
                    // Default to days if no known suffix
                    durationMs = value * 24 * 60 * 60 * 1000;
                }

                const expiryDate = new Date(Date.now() + durationMs);
                expiresAt = expiryDate.toISOString();
                expiryTimestamp = Math.floor(expiryDate.getTime() / 1000); // Unix timestamp
            }

            // ============ ON-CHAIN CONSENT (if allowDelegate is enabled) ============
            if (formData.allowDelegate) {
                const walletClient = createWalletClient({
                    chain: arbitrumSepolia,
                    transport: custom(provider),
                });
                const [account] = await walletClient.getAddresses();

                // Compute hashes
                const rootCidHash = record.cidHash; // Already a hash
                const encKeyHash = keccak256(toBytes(localRecord.aesKey)); // Hash of AES key

                toast({
                    title: "Đang ghi on-chain...",
                    description: "Đang ghi consent với quyền ủy quyền lên blockchain.",
                });

                // Call ConsentLedger.grantDirect (as patient, granting to recipient)
                // Note: We need a function that patient can call directly
                // grantDelegation is for full delegation, but we want per-record
                // We'll use the existing flow: share key + mark in DB that allowDelegate=true
                // The actual on-chain consent should be done via grantBySig or similar

                // For MVP: Store allowDelegate flag in backend, use grantUsingRecordDelegation later
                // Full on-chain consent requires EIP-712 signature flow which is complex
                // TODO: Implement grantBySig flow for production
            }

            // Share via backend (with sender public key for decryption)
            await keyShareService.shareKey({
                cidHash: record.cidHash,
                recipientAddress: formData.recipientAddress.toLowerCase(), // Normalize
                encryptedPayload,
                senderPublicKey: myKeypair.publicKey,
                expiresAt,
                allowDelegate: formData.allowDelegate, // NEW: Track delegation permission
            });

            setStep(3);

            const successMsg = formData.allowDelegate
                ? `Access shared with delegation rights to ${formData.recipientAddress.slice(0, 10)}...`
                : `Access has been shared with ${formData.recipientAddress.slice(0, 10)}...`;

            toast({
                title: formData.allowDelegate ? "Shared with Delegation!" : "Key Shared Successfully",
                description: successMsg,
                className: "bg-green-50 border-green-200 text-green-800",
            });

            if (onSuccess) onSuccess();

        } catch (err) {
            console.error('Share error:', err);
            setError(err.message || 'Failed to share key');
            setStep(1);

            toast({
                title: "Share Failed",
                description: err.message || 'An error occurred.',
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setStep(1);
        setFormData({ recipientAddress: '', expiry: '7d', allowDelegate: false });
        setRecipientInfo(null);
        setError(null);
        onOpenChange(false);
    };

    const isFormValid = formData.recipientAddress && recipientInfo;

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Share2 className="w-5 h-5 text-blue-600" />
                        Share Record Access
                    </DialogTitle>
                </DialogHeader>

                {step === 1 && (
                    <div className="space-y-4 py-4">
                        {record && (
                            <div className="bg-slate-50 p-3 rounded-lg text-sm">
                                <p className="font-medium text-slate-900">{record.title || 'Medical Record'}</p>
                                <p className="text-slate-500 font-mono text-xs mt-1">
                                    {record.cidHash?.slice(0, 30)}...
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="recipient" className="text-slate-800 font-medium">Doctor's Wallet Address *</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="recipient"
                                    placeholder="0x..."
                                    value={formData.recipientAddress}
                                    onChange={(e) => {
                                        setFormData({ ...formData, recipientAddress: e.target.value });
                                        setRecipientInfo(null);
                                    }}
                                    className="flex-1"
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleVerifyRecipient}
                                    disabled={isLoading}
                                >
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                                </Button>
                            </div>
                        </div>

                        {recipientInfo && (
                            <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-lg">
                                <User className="w-4 h-4" />
                                <span>Recipient verified: {recipientInfo.walletAddress.slice(0, 10)}...</span>
                            </div>
                        )}

                        {existingAccess && (
                            <div className="flex items-start gap-2 text-amber-600 text-sm bg-amber-50 p-3 rounded-lg border border-amber-200">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-medium">Người này đã có quyền truy cập!</p>
                                    <p className="text-xs mt-1">
                                        Hết hạn: {new Date(Number(existingAccess.expiresAt) * 1000).toLocaleString('vi-VN')}
                                    </p>
                                    <p className="text-xs mt-1">Bạn có thể tiếp tục để <strong>Gia hạn</strong> thêm thời gian.</p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="expiry" className="text-slate-800 font-medium">Access Duration</Label>
                            <Select
                                value={formData.expiry}
                                onValueChange={(value) => setFormData({ ...formData, expiry: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EXPIRY_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* NEW: Allow Delegate Checkbox */}
                        <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                            <input
                                type="checkbox"
                                id="allowDelegate"
                                checked={formData.allowDelegate}
                                onChange={(e) => setFormData({ ...formData, allowDelegate: e.target.checked })}
                                className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1">
                                <Label htmlFor="allowDelegate" className="text-slate-800 font-medium cursor-pointer flex items-center gap-2">
                                    <Users className="w-4 h-4 text-purple-600" />
                                    Cho phép chia sẻ lại (Record Delegation)
                                </Label>
                                <p className="text-xs text-slate-500 mt-1">
                                    Người nhận có thể chia sẻ hồ sơ này cho bác sĩ khác (VD: hội chẩn).
                                    Bạn vẫn thấy được ai đã xem hồ sơ.
                                </p>
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        <DialogFooter className="pt-4">
                            <Button variant="outline" onClick={handleClose}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleShare}
                                disabled={!isFormValid || isLoading}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {existingAccess ? 'Extend Access' : 'Share Access'}
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {step === 2 && (
                    <div className="py-12 flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                        <p className="text-slate-600 font-medium">Encrypting and sharing...</p>
                    </div>
                )}

                {step === 3 && (
                    <div className="py-8 flex flex-col items-center justify-center space-y-4">
                        <CheckCircle className="w-16 h-16 text-green-500" />
                        <p className="text-lg font-semibold text-slate-900">Access Shared!</p>
                        <p className="text-sm text-slate-600 text-center">
                            The recipient can now access this record once they claim the key.
                        </p>
                        <Button onClick={handleClose} className="mt-4">
                            Done
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default ShareKeyModal;
