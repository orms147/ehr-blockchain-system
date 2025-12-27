"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Send, Loader2, User, FileText, Clock, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { requestService } from '@/services';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { useEnsureArbitrumSepolia } from '@/hooks/useEnsureArbitrumSepolia';
import { createWalletClient, createPublicClient, custom, http, parseGwei, decodeEventLog } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { EHR_SYSTEM_ABI } from '@/abi/EHRSystemSecure';

const EHR_SYSTEM_ADDRESS = process.env.NEXT_PUBLIC_EHR_SYSTEM_ADDRESS;

// Request types matching contract enum
const REQUEST_TYPES = [
    { value: 0, label: 'Truy cập trực tiếp', description: 'Xem hồ sơ được chỉ định', enabled: true },
    { value: 1, label: 'Ủy quyền đầy đủ', description: 'Được ủy quyền toàn bộ hồ sơ', enabled: false, comingSoon: true },
    { value: 2, label: 'Ủy quyền theo hồ sơ', description: 'Được chia sẻ lại quyền truy cập', enabled: false, comingSoon: true },
];

export default function RequestAccessForm({ onSuccess }) {
    const { provider, address: walletAddress } = useWalletAddress();
    const { ensureChain } = useEnsureArbitrumSepolia();
    const [patientAddress, setPatientAddress] = useState('');
    const [cidHash, setCidHash] = useState('');
    const [requestType, setRequestType] = useState(0);
    const [durationDays, setDurationDays] = useState(7);
    const [submitting, setSubmitting] = useState(false);
    const [step, setStep] = useState(1); // 1: form, 2: confirm tx


    const isValidAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr);
    const isValidCidHash = (hash) => /^0x[a-fA-F0-9]{64}$/.test(hash);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isValidAddress(patientAddress)) {
            toast({ title: "Lỗi", description: "Địa chỉ Patient không hợp lệ", variant: "destructive" });
            return;
        }

        if (!isValidCidHash(cidHash)) {
            toast({ title: "Lỗi", description: "CID Hash không hợp lệ (phải là 0x + 64 ký tự hex)", variant: "destructive" });
            return;
        }

        if (!provider) {
            toast({ title: "Lỗi", description: "Không có provider", variant: "destructive" });
            return;
        }

        setSubmitting(true);
        try {
            // 1. Ensure correct chain first
            try {
                await ensureChain();
            } catch (chainError) {
                toast({
                    title: "Lỗi chuyển mạng",
                    description: "Không thể chuyển sang mạng Arbitrum Sepolia. Vui lòng thử lại.",
                    variant: "destructive",
                });
                setSubmitting(false);
                return;
            }

            // 2. Calculate validity period (hours)
            const validForHours = BigInt(durationDays * 24); // Convert days to hours
            const consentDurationHours = BigInt(durationDays * 24); // Same as validity for now
            const encKeyHash = '0x0000000000000000000000000000000000000000000000000000000000000000'; // Placeholder

            // 3. Submit transaction on-chain FIRST
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });

            let txHash;
            try {
                txHash = await walletClient.writeContract({
                    address: EHR_SYSTEM_ADDRESS,
                    abi: EHR_SYSTEM_ABI,
                    functionName: 'requestAccess',
                    // Contract signature: (patient, rootCidHash, reqType, encKeyHash, consentDurationHours, validForHours)
                    args: [patientAddress, cidHash, requestType, encKeyHash, consentDurationHours, validForHours],
                    account: walletAddress,
                    // Override gas to fix Web3Auth's broken gas estimation
                    gas: BigInt(500000), // Fixed gas limit - typical contract call uses ~100k-200k
                    maxFeePerGas: parseGwei('1.0'), // 500 Mwei
                    maxPriorityFeePerGas: parseGwei('0.1'), // 100 Mwei tip
                });
            } catch (txError) {
                console.error('Transaction error:', txError);

                // Parse error message - handle nested errors from viem/Web3Auth
                const errorMsg = String(txError.message || txError.shortMessage || JSON.stringify(txError) || '');

                if (errorMsg.toLowerCase().includes('insufficient funds') || errorMsg.includes('have 0 want')) {
                    toast({
                        title: "Không đủ số dư",
                        description: "Ví của bạn không có đủ ETH để trả phí giao dịch. Vui lòng nạp thêm ETH vào ví.",
                        variant: "destructive",
                    });
                } else if (errorMsg.includes('max fee per gas') || errorMsg.includes('baseFee')) {
                    toast({
                        title: "Lỗi phí gas",
                        description: "Phí gas tạm thời quá cao. Vui lòng thử lại sau vài giây.",
                        variant: "destructive",
                    });
                } else if (errorMsg.includes('chainId') || errorMsg.includes('chain')) {
                    toast({
                        title: "Sai mạng blockchain",
                        description: "Vui lòng chuyển sang mạng phù hợp và thử lại.",
                        variant: "destructive",
                    });
                } else if (errorMsg.includes('rejected') || errorMsg.includes('denied') || errorMsg.includes('user rejected')) {
                    toast({
                        title: "Giao dịch bị từ chối",
                        description: "Bạn đã từ chối xác nhận giao dịch trong ví.",
                        variant: "destructive",
                    });
                } else {
                    toast({
                        title: "Lỗi giao dịch",
                        description: "Không thể thực hiện giao dịch. Vui lòng thử lại sau.",
                        variant: "destructive",
                    });
                }

                setSubmitting(false);
                return; // Don't create backend request if on-chain fails
            }

            // 4. Wait for receipt and parse reqId from AccessRequested event
            let onChainReqId = null;
            try {
                const publicClient = createPublicClient({
                    chain: arbitrumSepolia,
                    transport: http(),
                });
                const receipt = await publicClient.waitForTransactionReceipt({
                    hash: txHash,
                    confirmations: 1,
                });
                // Parse AccessRequested event from logs
                for (let i = 0; i < receipt.logs.length; i++) {
                    const log = receipt.logs[i];
                    try {
                        const decoded = decodeEventLog({
                            abi: EHR_SYSTEM_ABI,
                            data: log.data,
                            topics: log.topics,
                        });
                        if (decoded.eventName === 'AccessRequested') {
                            onChainReqId = decoded.args.reqId;
                            break;
                        }
                    } catch (e) {
                    }
                }

                if (!onChainReqId) {
                    console.error('❌ Could not find AccessRequested event in receipt!');
                }
            } catch (receiptError) {
                console.error('Could not parse receipt for reqId:', receiptError);
            }

            // 4.1. Doctor pre-approves as Requester (so request is in RequesterApproved state)
            // This ensures when Patient approves via signature, consent will be created!
            if (onChainReqId) {
                try {
                    const walletClient = createWalletClient({
                        chain: arbitrumSepolia,
                        transport: custom(provider),
                    });

                    const publicClient = createPublicClient({
                        chain: arbitrumSepolia,
                        transport: http(),
                    });

                    const preApproveTxHash = await walletClient.writeContract({
                        address: EHR_SYSTEM_ADDRESS,
                        abi: EHR_SYSTEM_ABI,
                        functionName: 'confirmAccessRequest',
                        args: [onChainReqId],
                        account: walletAddress,
                        gas: BigInt(150000),
                        maxFeePerGas: parseGwei('1.0'),
                        maxPriorityFeePerGas: parseGwei('0.1'),
                    });
                    // Wait for confirmation
                    await publicClient.waitForTransactionReceipt({
                        hash: preApproveTxHash,
                        confirmations: 1,
                    });
                } catch (preApproveError) {
                    console.error('Pre-approval failed:', preApproveError);
                    // Don't fail the whole request - backend will still be created
                    // Patient can still approve but Doctor will need to claim differently
                }
            }

            // 5. Create backend request with on-chain reqId
            try {
                await requestService.createAccessRequest(
                    patientAddress,
                    cidHash,
                    requestType,
                    durationDays,
                    txHash,
                    onChainReqId // Pass the on-chain reqId
                );
            } catch (backendError) {
                console.warn('Backend record failed but on-chain succeeded:', backendError);
                // Still show success since on-chain tx worked
            }

            toast({
                title: "Đã gửi yêu cầu thành công!",
                description: `Yêu cầu truy cập đã được ghi on-chain và gửi đến ${patientAddress.slice(0, 10)}...`,
                className: "bg-green-50 border-green-200 text-green-800",
            });

            // Reset form
            setPatientAddress('');
            setCidHash('');
            setRequestType(0);
            setDurationDays(7);

            if (onSuccess) {
                onSuccess(txHash);
            }

        } catch (err) {
            console.error('Request access error:', err);
            toast({
                title: "Lỗi",
                description: err.message || "Không thể gửi yêu cầu",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };


    return (
        <Card className="bg-white">
            <CardHeader>
                <CardTitle className="text-slate-900 flex items-center gap-2">
                    <Send className="w-5 h-5 text-teal-600" />
                    Yêu cầu truy cập hồ sơ
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Patient Address */}
                    <div className="space-y-2">
                        <Label htmlFor="patientAddress" className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            Địa chỉ ví bệnh nhân
                        </Label>
                        <Input
                            id="patientAddress"
                            placeholder="0x..."
                            value={patientAddress}
                            onChange={(e) => setPatientAddress(e.target.value)}
                            className={!patientAddress || isValidAddress(patientAddress) ? '' : 'border-red-500'}
                        />
                        {patientAddress && !isValidAddress(patientAddress) && (
                            <p className="text-xs text-red-500">Địa chỉ không hợp lệ</p>
                        )}
                    </div>

                    {/* CID Hash */}
                    <div className="space-y-2">
                        <Label htmlFor="cidHash" className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            CID Hash của hồ sơ
                        </Label>
                        <Input
                            id="cidHash"
                            placeholder="0x..."
                            value={cidHash}
                            onChange={(e) => setCidHash(e.target.value)}
                            className={!cidHash || isValidCidHash(cidHash) ? '' : 'border-red-500'}
                        />
                        {cidHash && !isValidCidHash(cidHash) && (
                            <p className="text-xs text-red-500">CID Hash không hợp lệ</p>
                        )}
                        <p className="text-xs text-slate-500">
                            Nhập keccak256 hash của CID hồ sơ cần truy cập
                        </p>
                    </div>

                    {/* Request Type */}
                    <div className="space-y-2">
                        <Label>Loại yêu cầu</Label>
                        <div className="grid grid-cols-1 gap-2">
                            {REQUEST_TYPES.map((type) => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => type.enabled && setRequestType(type.value)}
                                    disabled={!type.enabled}
                                    className={`p-3 rounded-xl border-2 text-left transition-all relative ${!type.enabled
                                        ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                                        : requestType === type.value
                                            ? 'border-teal-500 bg-teal-50'
                                            : 'border-slate-200 hover:border-teal-300'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-slate-900">{type.label}</p>
                                            <p className="text-xs text-slate-500">{type.description}</p>
                                        </div>
                                        {type.comingSoon && (
                                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                Sắp ra mắt
                                            </span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                        <Label htmlFor="duration" className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Thời hạn yêu cầu (ngày)
                        </Label>
                        <Input
                            id="duration"
                            type="number"
                            min={1}
                            max={30}
                            value={durationDays}
                            onChange={(e) => setDurationDays(parseInt(e.target.value) || 7)}
                        />
                        <p className="text-xs text-slate-500">
                            Nếu bệnh nhân không trả lời trong thời hạn này, yêu cầu sẽ tự động hết hạn
                        </p>
                    </div>

                    {/* Warning */}
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-yellow-800">
                            Bạn sẽ cần ký giao dịch và trả phí gas để gửi yêu cầu này on-chain.
                        </p>
                    </div>

                    {/* Submit Button */}
                    <Button
                        type="submit"
                        className="w-full bg-teal-600 hover:bg-teal-700"
                        disabled={submitting || !isValidAddress(patientAddress) || !isValidCidHash(cidHash)}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Đang gửi...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Gửi yêu cầu truy cập
                            </>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
