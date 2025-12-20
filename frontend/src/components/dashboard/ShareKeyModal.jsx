import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Share2, Loader2, CheckCircle, AlertCircle, User } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

import { keyShareService, authService, createKeySharePayload, encryptForRecipient } from '@/services';

const EXPIRY_OPTIONS = [
    { value: '1d', label: '1 Day' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: 'never', label: 'Never Expires' },
];

const ShareKeyModal = ({ open, onOpenChange, record, onSuccess }) => {
    const [step, setStep] = useState(1); // 1: Form, 2: Sharing, 3: Success
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const [formData, setFormData] = useState({
        recipientAddress: '',
        expiry: '7d',
    });

    const [recipientInfo, setRecipientInfo] = useState(null);

    // Verify recipient address and get their public key
    const handleVerifyRecipient = async () => {
        if (!formData.recipientAddress || !/^0x[a-fA-F0-9]{40}$/.test(formData.recipientAddress)) {
            setError('Invalid wallet address format');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const info = await authService.getPublicKey(formData.recipientAddress);
            setRecipientInfo(info);
        } catch (err) {
            setError('Recipient not found or has no public key registered');
            setRecipientInfo(null);
        } finally {
            setIsLoading(false);
        }
    };

    const handleShare = async () => {
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

            // Create payload
            const payload = await createKeySharePayload(localRecord.cid, {
                exportKey: async () => localRecord.aesKey
            });

            // Encrypt for recipient
            const encryptedPayload = await encryptForRecipient(
                payload,
                recipientInfo.publicKey
            );

            // Calculate expiry
            let expiresAt = null;
            if (formData.expiry !== 'never') {
                const days = parseInt(formData.expiry);
                expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
            }

            // Share via backend
            await keyShareService.shareKey(
                record.cidHash,
                formData.recipientAddress,
                encryptedPayload,
                expiresAt
            );

            setStep(3);

            toast({
                title: "Key Shared Successfully",
                description: `Access has been shared with ${formData.recipientAddress.slice(0, 10)}...`,
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
        setFormData({ recipientAddress: '', expiry: '7d' });
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
                            <Label htmlFor="recipient">Doctor's Wallet Address *</Label>
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

                        <div className="space-y-2">
                            <Label htmlFor="expiry">Access Duration</Label>
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
                                Share Access
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
