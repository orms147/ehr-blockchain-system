"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Upload, Loader2, User, FileText, AlertCircle,
    CheckCircle, Key, Send, Image
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
    recordService, keyShareService, ipfsService, authService,
    generateAESKey, encryptData, exportAESKey, encryptForRecipient, getOrCreateEncryptionKeypair
} from '@/services';
import { useWalletAddress } from '@/hooks/useWalletAddress';
import { createWalletClient, createPublicClient, custom, http, parseAbi, keccak256, toBytes, parseGwei } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { ensureArbitrumSepolia } from '@/utils/chainSwitch';
import { ICD10Input, VitalSignsInput, MedicationsInput, LabResultsInput } from '@/components/medical/StructuredMedicalInput';
import UserName from '@/components/ui/UserName';

const DOCTOR_UPDATE_ADDRESS = process.env.NEXT_PUBLIC_DOCTOR_UPDATE_ADDRESS;
const RECORD_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_RECORD_REGISTRY_ADDRESS;


// ABI for DoctorUpdate.addRecordByDoctor (6 params with auto consent)
// ABI for DoctorUpdate.addRecordByDoctor (6 params with auto consent)
import { DOCTOR_UPDATE_ABI } from '@/config/contractABI';


const RECORD_TYPES = [
    { value: 'diagnosis', label: 'Chẩn đoán' },
    { value: 'prescription', label: 'Đơn thuốc' },
    { value: 'lab_result', label: 'Kết quả xét nghiệm' },
    { value: 'imaging', label: 'Chẩn đoán hình ảnh' },
    { value: 'procedure', label: 'Thủ thuật' },
    { value: 'followup', label: 'Tái khám' },
];

export default function DoctorAddRecordForm({ onSuccess }) {
    const { provider, address: walletAddress } = useWalletAddress();


    const [step, setStep] = useState(1); // 1: form, 2: processing, 3: share key
    const [patientAddress, setPatientAddress] = useState('');
    const [recordType, setRecordType] = useState('diagnosis');
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [file, setFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Structured medical data
    const [diagnoses, setDiagnoses] = useState([]);
    const [vitalSigns, setVitalSigns] = useState({});
    const [medications, setMedications] = useState([]);
    const [labResults, setLabResults] = useState([]);

    // For key sharing
    const [createdRecord, setCreatedRecord] = useState(null);

    const isValidAddress = (addr) => /^0x[a-fA-F0-9]{40}$/.test(addr);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            if (selectedFile.size > 100 * 1024 * 1024) { // 100MB limit
                toast({ title: "Lỗi", description: "File quá lớn (tối đa 100MB)", variant: "destructive" });
                return;
            }
            setFile(selectedFile);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!isValidAddress(patientAddress)) {
            toast({ title: "Lỗi", description: "Địa chỉ bệnh nhân không hợp lệ", variant: "destructive" });
            return;
        }

        if (!title) {
            toast({ title: "Lỗi", description: "Vui lòng nhập tiêu đề", variant: "destructive" });
            return;
        }

        if (!walletAddress) {
            toast({ title: "Lỗi", description: "Vui lòng kết nối ví trước", variant: "destructive" });
            return;
        }

        setSubmitting(true);
        setStep(2);

        try {
            // 1. Create FHIR-like record structure
            const recordData = {
                resourceType: 'Bundle',
                meta: {
                    title: title,
                    type: recordType,
                    createdBy: walletAddress,
                    createdAt: new Date().toISOString(),
                    patient: patientAddress,
                },
                notes: notes,
                attachment: null,
                // Structured medical data (FHIR entry)
                entry: [],
            };

            // Add diagnoses (ICD-10)
            if (diagnoses.length > 0) {
                recordData.entry.push({
                    resource: {
                        resourceType: 'Condition',
                        code: diagnoses.map(d => ({
                            coding: [{ system: 'ICD-10', code: d.code, display: d.name }]
                        }))
                    }
                });
            }

            // Add vital signs
            const hasVitals = Object.values(vitalSigns).some(v => v);
            if (hasVitals) {
                recordData.entry.push({
                    resource: {
                        resourceType: 'Observation',
                        category: 'vital-signs',
                        ...vitalSigns
                    }
                });
            }

            // Add medications
            if (medications.length > 0 && medications.some(m => m.name)) {
                recordData.entry.push({
                    resource: {
                        resourceType: 'MedicationRequest',
                        medications: medications.filter(m => m.name)
                    }
                });
            }

            // Add lab results
            if (labResults.length > 0 && labResults.some(l => l.testName)) {
                recordData.entry.push({
                    resource: {
                        resourceType: 'DiagnosticReport',
                        results: labResults.filter(l => l.testName)
                    }
                });
            }

            // 2. Handle file attachment
            if (file) {
                const fileBuffer = await file.arrayBuffer();
                const base64 = btoa(
                    new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                recordData.attachment = {
                    contentType: file.type,
                    data: base64,
                    fileName: file.name,
                };
            }

            // 3. Generate AES key and encrypt
            const aesKey = await generateAESKey();
            const encryptedData = await encryptData(recordData, aesKey);

            // 4. Upload to IPFS
            const cid = await ipfsService.upload(encryptedData);
            const cidHash = keccak256(toBytes(cid));
            const recordTypeHash = keccak256(toBytes(recordType));

            // 5. Ensure correct chain
            await ensureArbitrumSepolia(provider);

            // 6. Get Doctor's keypair first (need encKeyHash for on-chain consent)
            const doctorKeypair = await getOrCreateEncryptionKeypair(provider, walletAddress);

            // Hash the doctor's public key for on-chain consent
            const doctorEncKeyHash = keccak256(toBytes(doctorKeypair.publicKey));

            // Default Access Duration for Doctor: 7 Days (168 Hours)
            const accessDurationHours = 168;
            const expiresAt = new Date(Date.now() + accessDurationHours * 60 * 60 * 1000).toISOString();

            // INHERITANCE LOGIC: Calculate expiry and duration based on Parent
            let finalAccessDurationHours = accessDurationHours; // Default from props/state (usually 168h/7days)
            let finalExpiresAt = null;

            if (parentRecord) {
                // If checking off-chain parent record (KeyShare metadata likely has expiresAt)
                // We use the parent's expiry to keep the session consistent.
                const parentExpiryStr = parentRecord.expiresAt;
                if (parentExpiryStr) {
                    const now = new Date();
                    const parentExpiry = new Date(parentExpiryStr);
                    const diffMs = parentExpiry.getTime() - now.getTime();
                    // Ceiling to ensure we cover the remaining session
                    // If < 0, it means expired. But usually we are updating an active record.
                    const diffHours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));

                    finalAccessDurationHours = diffHours;
                    finalExpiresAt = parentExpiry.toISOString();
                }
            }

            // If still null (new record or no parent expiry found), calculate default
            if (!finalExpiresAt) {
                const d = new Date();
                d.setTime(d.getTime() + (finalAccessDurationHours * 60 * 60 * 1000));
                finalExpiresAt = d.toISOString();
            }

            // 7. Submit on-chain via DoctorUpdate contract (includes auto-consent for Doctor)
            const walletClient = createWalletClient({
                chain: arbitrumSepolia,
                transport: custom(provider),
            });
            const txHash = await walletClient.writeContract({
                address: DOCTOR_UPDATE_ADDRESS,
                abi: DOCTOR_UPDATE_ABI,
                functionName: 'addRecordByDoctor',
                // DoctorUpdate signature: (cidHash, parentCidHash, recordTypeHash, patient, doctorEncKeyHash, doctorAccessHours)
                args: [
                    cidHash,
                    parentRecord?.cidHash || '0x0000000000000000000000000000000000000000000000000000000000000000', // Fix: Use parent hash if exists
                    recordTypeHash,
                    patientAddress,
                    doctorEncKeyHash,  // For on-chain consent
                    finalAccessDurationHours, // Fix: Use inherited duration
                ],
                account: walletAddress,
                gas: BigInt(500000), // Higher gas for DoctorUpdate (calls 2 contracts)
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });
            // 8. Save to backend (metadata only - on-chain tx already done above)
            // 8. Save to backend (metadata only - on-chain tx already done above)
            await recordService.saveRecordMetadata(cidHash, recordTypeHash, patientAddress, {
                title: title,
                description: notes,
                recordType: recordType,
                parentCidHash: parentRecord?.cidHash || null
            });

            // 9. Prepare key sharing for decryption
            const exportedKey = await exportAESKey(aesKey);
            const keyPayload = JSON.stringify({ cid, aesKey: exportedKey });

            // 10a. ALWAYS save key for Doctor (creator) - so Doctor can decrypt and share later
            // IMPORTANT: This key MUST have an expiry matching on-chain duration!
            const doctorEncryptedKey = encryptForRecipient(
                keyPayload,
                doctorKeypair.publicKey, // Encrypt with Doctor's own public key
                doctorKeypair.secretKey
            );

            await keyShareService.shareKey({
                recipientAddress: walletAddress, // Doctor is recipient
                cidHash: cidHash,
                encryptedPayload: doctorEncryptedKey,
                senderPublicKey: doctorKeypair.publicKey,
                expiresAt: finalExpiresAt // Fix: Sync with On-Chain Expiry
            });

            // 10b. Try to share key with patient (may fail if patient hasn't registered encryption key)
            let patientKeyShared = false;
            try {
                const patientKeyResponse = await authService.getEncryptionKey(patientAddress);

                if (patientKeyResponse?.encryptionPublicKey) {
                    // Encrypt key for patient using NaCl box
                    const encryptedKeyPayload = encryptForRecipient(
                        keyPayload,
                        patientKeyResponse.encryptionPublicKey,
                        doctorKeypair.secretKey
                    );

                    // Share key with patient
                    await keyShareService.shareKey({
                        recipientAddress: patientAddress,
                        cidHash: cidHash,
                        encryptedPayload: encryptedKeyPayload,
                        senderPublicKey: doctorKeypair.publicKey,
                    });
                    patientKeyShared = true;
                } else {
                    throw new Error('Patient has no encryption public key');
                }
            } catch (keyShareError) {
                console.warn('Key sharing with patient failed:', keyShareError);
                toast({
                    title: "Cảnh báo",
                    description: "Bệnh nhân chưa đăng ký khóa mã hóa. Bác sĩ có thể chia sẻ key sau khi bệnh nhân đăng nhập.",
                    variant: "warning",
                });
            }

            // 10c. [COLLABORATION] Share key with referring Doctor (Creator of Parent Record)
            // This ensures "Shared Vision": The doctor who created the original record gets access to the update.
            if (parentRecord && parentRecord.createdBy &&
                parentRecord.createdBy.toLowerCase() !== walletAddress.toLowerCase() &&
                parentRecord.createdBy.toLowerCase() !== patientAddress.toLowerCase()) {
                try {
                    const refereeAddress = parentRecord.createdBy;
                    const refereeKeyResponse = await authService.getEncryptionKey(refereeAddress);

                    if (refereeKeyResponse?.encryptionPublicKey) {
                        const encryptedForKeyRef = encryptForRecipient(
                            keyPayload,
                            refereeKeyResponse.encryptionPublicKey,
                            doctorKeypair.secretKey
                        );

                        await keyShareService.shareKey({
                            recipientAddress: refereeAddress,
                            cidHash: cidHash,
                            encryptedPayload: encryptedForKeyRef,
                            senderPublicKey: doctorKeypair.publicKey,
                        });
                        console.log("Auto-shared key with referring doctor:", refereeAddress);
                        toast({
                            title: "Đồng bộ liên kết",
                            description: "Đã chia sẻ bản cập nhật này cho bác sĩ tạo hồ sơ gốc.",
                            className: "bg-blue-50 text-blue-800 border-blue-200",
                        });
                    }
                } catch (refError) {
                    console.warn("Failed to auto-share with referrer:", refError);
                    // Non-critical, do not block flow
                }
            }

            // 10d. [BROADCAST] Share with other Care Team members
            // SECURITY CRITICAL: We must verify that these members ACTUALLY have access to the Parent Record.
            // If Backend is compromised, it could inject "Attacker X" into this list.
            // We TRUST blockchain, not Backend.
            if (parentRecord && parentRecord.cidHash && parentRecord.ownerAddress) {
                try {
                    const teamMembers = await keyShareService.getRecordRecipients(parentRecord.cidHash);

                    // Filter: Don't share with myself, patient, or the creator (already handled above)
                    const uniqueMembers = teamMembers.filter(m =>
                        m.walletAddress.toLowerCase() !== walletAddress.toLowerCase() &&
                        m.walletAddress.toLowerCase() !== patientAddress.toLowerCase() &&
                        m.walletAddress.toLowerCase() !== (parentRecord.createdBy || '').toLowerCase()
                    );

                    if (uniqueMembers.length > 0) {
                        console.log(`Verifying and broadcasting update to ${uniqueMembers.length} team members...`);

                        let sharedCount = 0;
                        await Promise.all(uniqueMembers.map(async (member) => {
                            if (!member.encryptionPublicKey) return;

                            // 1. [SECURITY CHECK] Verify On-Chain Consent for Parent Record
                            // Is "member" allowed to see "parentRecord"?
                            try {
                                const hasAccess = await publicClient.readContract({
                                    address: CONSENT_LEDGER_ADDRESS,
                                    abi: CONSENT_LEDGER_ABI,
                                    functionName: 'canAccess',
                                    args: [parentRecord.ownerAddress, member.walletAddress, parentRecord.cidHash]
                                });

                                if (!hasAccess) {
                                    console.warn(`Blocking auto-share to ${member.walletAddress}: No on-chain consent for parent record.`);
                                    return; // SKIP (Attacker X filtered out here)
                                }

                                // 2. Encrypt & Share
                                const encryptedForMember = encryptForRecipient(
                                    keyPayload,
                                    member.encryptionPublicKey,
                                    doctorKeypair.secretKey
                                );

                                await keyShareService.shareKey({
                                    recipientAddress: member.walletAddress,
                                    cidHash: cidHash,
                                    encryptedPayload: encryptedForMember,
                                    senderPublicKey: doctorKeypair.publicKey,
                                });
                                sharedCount++;

                            } catch (verifyError) {
                                console.error(`Verification failed for ${member.walletAddress}`, verifyError);
                            }
                        }));

                        if (sharedCount > 0) {
                            toast({
                                title: "Đồng bộ nhóm an toàn",
                                description: `Đã chia sẻ cập nhật cho ${sharedCount} bác sĩ (đã xác thực trên chain).`,
                                className: "bg-purple-50 text-purple-800 border-purple-200",
                            });
                        }
                    }
                } catch (broadcastError) {
                    console.warn("Broadcast failed:", broadcastError);
                }
            }

            setCreatedRecord({
                cid,
                cidHash,
                txHash,
                patientAddress,
                title,
            });

            setStep(3);

            toast({
                title: "Đã tạo hồ sơ thành công!",
                description: "Hồ sơ đã được thêm cho bệnh nhân và chia sẻ key.",
                className: "bg-green-50 border-green-200 text-green-800",
            });

            if (onSuccess) {
                onSuccess({ cid, cidHash, txHash });
            }

        } catch (err) {
            console.error('Create record error:', err);
            setStep(1);
            toast({
                title: "Lỗi",
                description: err.message || "Không thể tạo hồ sơ",
                variant: "destructive",
            });
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setPatientAddress('');
        setRecordType('diagnosis');
        setTitle('');
        setNotes('');
        setFile(null);
        setCreatedRecord(null);
        setDiagnoses([]);
        setVitalSigns({});
        setMedications([]);
        setLabResults([]);
        setStep(1);
    };

    // Step 2: Processing
    if (step === 2) {
        return (
            <Card className="bg-white">
                <CardContent className="p-8">
                    <div className="flex flex-col items-center justify-center text-center">
                        <Loader2 className="w-16 h-16 text-teal-600 animate-spin mb-4" />
                        <h3 className="text-xl font-bold text-slate-900 mb-2">Đang xử lý...</h3>
                        <p className="text-slate-500">Mã hóa, upload IPFS, và ghi on-chain</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Step 3: Success - Share key
    if (step === 3 && createdRecord) {
        return (
            <Card className="bg-green-50 border-green-200">
                <CardContent className="p-8">
                    <div className="flex flex-col items-center text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-green-800 mb-2">Thành công!</h3>
                        <p className="text-green-700 mb-4">Hồ sơ đã được thêm cho bệnh nhân</p>

                        <div className="bg-white p-4 rounded-xl w-full max-w-md text-left mb-6">
                            <p className="text-sm text-slate-600 mb-2">
                                <strong>Tiêu đề:</strong> {createdRecord.title}
                            </p>
                            <p className="text-sm text-slate-600 mb-2">
                                <strong>Bệnh nhân:</strong> <UserName address={createdRecord.patientAddress} />
                            </p>
                            <p className="text-sm text-slate-600">
                                <strong>CID Hash:</strong> {createdRecord.cidHash?.slice(0, 20)}...
                            </p>
                        </div>

                        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg mb-6">
                            <p className="text-sm text-teal-800 flex items-center gap-2">
                                <Key className="w-4 h-4" />
                                Key giải mã đã được chia sẻ tự động với bệnh nhân
                            </p>
                        </div>

                        <Button onClick={resetForm} className="bg-teal-600 hover:bg-teal-700">
                            Tạo hồ sơ mới
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Step 1: Form
    return (
        <Card className="bg-white">
            <CardHeader>
                <CardTitle className="text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-teal-600" />
                    Thêm hồ sơ cho bệnh nhân
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Patient Address */}
                    <div className="space-y-2">
                        <Label htmlFor="patientAddress" className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            Địa chỉ ví bệnh nhân *
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

                    {/* Record Type */}
                    <div className="space-y-2">
                        <Label>Loại hồ sơ</Label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {RECORD_TYPES.map((type) => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => setRecordType(type.value)}
                                    className={`p-2 rounded-lg border-2 text-sm transition-all ${recordType === type.value
                                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                                        : 'border-slate-200 hover:border-teal-300'
                                        }`}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Title */}
                    <div className="space-y-2">
                        <Label htmlFor="title" className="text-slate-800 font-medium">Tiêu đề *</Label>
                        <Input
                            id="title"
                            placeholder="VD: Kết quả khám tổng quát ngày 21/12"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label htmlFor="notes" className="text-slate-800 font-medium">Ghi chú / Nội dung</Label>
                        <Textarea
                            id="notes"
                            placeholder="Nhập ghi chú hoặc nội dung chi tiết..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                        />
                    </div>

                    {/* ─────── Structured Medical Data ─────── */}
                    <div className="border-t border-slate-200 pt-4 space-y-4">
                        <p className="text-sm font-medium text-slate-700">📋 Dữ liệu y tế chi tiết (tùy chọn)</p>

                        {/* Always show ICD-10 for diagnosis/checkup types */}
                        {['diagnosis', 'followup', 'procedure'].includes(recordType) && (
                            <ICD10Input value={diagnoses} onChange={setDiagnoses} />
                        )}

                        {/* Always show VitalSigns */}
                        <VitalSignsInput value={vitalSigns} onChange={setVitalSigns} />

                        {/* Medications for prescription/diagnosis */}
                        {['diagnosis', 'prescription', 'followup'].includes(recordType) && (
                            <MedicationsInput value={medications} onChange={setMedications} />
                        )}

                        {/* Lab results for lab_result type */}
                        {['lab_result', 'diagnosis'].includes(recordType) && (
                            <LabResultsInput value={labResults} onChange={setLabResults} />
                        )}
                    </div>

                    {/* File Upload */}
                    <div className="space-y-2">
                        <Label className="flex items-center gap-1">
                            <Image className="w-4 h-4" />
                            Đính kèm file (tùy chọn)
                        </Label>
                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:border-teal-400 transition-colors">
                            <input
                                type="file"
                                onChange={handleFileChange}
                                className="hidden"
                                id="file-upload"
                                accept="image/*,.pdf,.doc,.docx"
                            />
                            <label htmlFor="file-upload" className="cursor-pointer">
                                {file ? (
                                    <div className="flex items-center justify-center gap-2 text-teal-600">
                                        <CheckCircle className="w-5 h-5" />
                                        {file.name}
                                    </div>
                                ) : (
                                    <div>
                                        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                        <p className="text-slate-500">Kéo thả hoặc click để chọn file</p>
                                        <p className="text-xs text-slate-400">Hỗ trợ: ảnh, PDF, Word (tối đa 10MB)</p>
                                    </div>
                                )}
                            </label>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                        <p className="text-sm text-yellow-800">
                            Bạn sẽ cần ký giao dịch và trả phí gas để thêm hồ sơ on-chain.
                        </p>
                    </div>

                    {/* Submit */}
                    <Button
                        type="submit"
                        className="w-full bg-teal-600 hover:bg-teal-700"
                        disabled={submitting || !isValidAddress(patientAddress) || !title}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Đang xử lý...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Tạo và chia sẻ hồ sơ
                            </>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
