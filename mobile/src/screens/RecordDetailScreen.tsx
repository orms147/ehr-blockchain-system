import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QrCode, Lock, Clock, FileText, User, Share2, Unlock, X } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getOrCreateEncryptionKeypair, decryptFromSender, encryptForRecipient } from '../services/nacl-crypto';
import { importAESKey, decryptData } from '../services/crypto';
import ipfsService from '../services/ipfs.service';
import keyShareService from '../services/keyShare.service';
import walletActionService from '../services/walletAction.service';
import authService from '../services/auth.service';
import {
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SECONDARY,
    EHR_SECONDARY_CONTAINER,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

type RouteRecord = {
    cidHash?: string;
    title?: string;
    type?: string;
    date?: string;
    createdByDisplay?: string;
};

type DecryptedImage = {
    uri: string;
    fileName?: string;
};

function normalizeBase64(data: string) {
    return data
        .replace(/^data:[^;]+;base64,/, '')
        .replace(/\s+/g, '')
        .trim();
}

function toDataUri(base64Data: string, contentType = 'image/jpeg') {
    if (base64Data.startsWith('data:')) {
        return base64Data;
    }
    return `data:${contentType};base64,${normalizeBase64(base64Data)}`;
}

function extractImageFromPayload(payload: any): DecryptedImage | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }

    if (typeof payload.imageData === 'string' && payload.imageData.trim()) {
        const contentType = payload.imageContentType || payload?.attachment?.contentType || 'image/jpeg';
        return {
            uri: toDataUri(payload.imageData, contentType),
            fileName: payload?.attachment?.fileName || 'Ảnh đính kèm',
        };
    }

    const attachment = payload?.attachment;
    if (
        attachment
        && typeof attachment?.data === 'string'
        && attachment.data.trim()
        && String(attachment?.contentType || '').startsWith('image/')
    ) {
        return {
            uri: toDataUri(attachment.data, attachment.contentType),
            fileName: attachment.fileName || 'Ảnh đính kèm',
        };
    }

    return null;
}

export default function RecordDetailScreen({ route }: any) {
    const record: RouteRecord = route?.params?.record || {};

    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decryptedData, setDecryptedData] = useState<any>(null);
    const [decryptError, setDecryptError] = useState<string | null>(null);

    // Share via address
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareAddress, setShareAddress] = useState('');
    const [isSharing, setIsSharing] = useState(false);

    // QR modal — hiển thị cidHash để bác sĩ nhập thủ công
    const [showQrModal, setShowQrModal] = useState(false);

    const decryptedImage = useMemo(() => extractImageFromPayload(decryptedData), [decryptedData]);

    const decodeSharedKeyPayload = async (cidHash?: string) => {
        const sharedKey = await keyShareService.getKeyForRecord(cidHash);
        if (!sharedKey) {
            throw new Error('Không tìm thấy key giải mã. Có thể hồ sơ này chưa được chia sẻ key cho bạn.');
        }

        if (sharedKey.status === 'pending' && sharedKey.id) {
            try {
                keyShareService.claimKey(sharedKey.id);
            } catch (error) {
                console.warn('Auto-claim failed:', error);
            }
        }

        const { walletClient, address } = await walletActionService.getWalletContext();
        const myKeypair = await getOrCreateEncryptionKeypair(walletClient, address);

        let keyData: any;

        try {
            const decryptedPayload = decryptFromSender(sharedKey.encryptedPayload, sharedKey.senderPublicKey, myKeypair.secretKey);
            keyData = JSON.parse(decryptedPayload);
        } catch {
            try {
                const decodedString = Buffer.from(sharedKey.encryptedPayload, 'base64').toString('utf8');
                keyData = JSON.parse(decodedString);
            } catch {
                try {
                    keyData = JSON.parse(sharedKey.encryptedPayload);
                } catch {
                    throw new Error('Không thể giải mã key. Định dạng key không hợp lệ.');
                }
            }
        }

        if (keyData?.cid && keyData?.aesKey) {
            return { cid: keyData.cid, aesKeyString: keyData.aesKey };
        }

        if (keyData?.metadata?.cid && keyData?.aesKey) {
            return { cid: keyData.metadata.cid, aesKeyString: keyData.aesKey };
        }

        throw new Error('Key đã được mã hoá bằng khoá cũ hoặc không hợp lệ.');
    };

    const saveLocalKey = async (cidHash: string | undefined, cid: string, aesKeyString: string, title: string | undefined) => {
        if (!cidHash) {
            return;
        }

        const latestLocalRecordsString = await AsyncStorage.getItem('ehr_local_records');
        const latestRecords = latestLocalRecordsString ? JSON.parse(latestLocalRecordsString) : {};
        latestRecords[cidHash] = {
            ...(latestRecords[cidHash] || {}),
            cid,
            aesKey: aesKeyString,
            title: title || 'Hồ sơ được chia sẻ',
        };
        await AsyncStorage.setItem('ehr_local_records', JSON.stringify(latestRecords));
    };

function classifyDecryptError(error: any): string {
    const raw = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '');

    if (raw.includes('gcm authentication failed')) {
        return 'Khóa giải mã không khớp. Có thể hồ sơ đã được cập nhật key mới. Thử bấm "Giải mã" lại.';
    }
    if (code === 'KEY_SHARE_NOT_FOUND' || raw.includes('no key share found')) {
        return 'Bạn chưa được chia sẻ key cho hồ sơ này.';
    }
    if (code === 'KEY_SHARE_REVOKED' || raw.includes('revoked')) {
        return 'Quyền truy cập hồ sơ này đã bị thu hồi.';
    }
    if (code === 'KEY_SHARE_EXPIRED' || raw.includes('expired')) {
        return 'Quyền truy cập đã hết hạn. Vui lòng yêu cầu gia hạn.';
    }
    if (code === 'CONSENT_NOT_FOUND') {
        return 'Chưa có quyền on-chain cho hồ sơ này. Vui lòng yêu cầu truy cập.';
    }
    if (code === 'BACKEND_UNREACHABLE' || raw.includes('network') || raw.includes('fetch')) {
        return 'Không kết nối được server. Kiểm tra kết nối mạng.';
    }

    return error?.message || 'Không thể giải mã hồ sơ. Vui lòng thử lại.';
}

    const handleShare = async () => {
        const address = shareAddress.trim().toLowerCase();
        if (!/^0x[a-f0-9]{40}$/.test(address)) {
            Alert.alert('Địa chỉ không hợp lệ', 'Vui lòng nhập địa chỉ ví hợp lệ (0x...).');
            return;
        }

        setIsSharing(true);
        try {
            // Load local CID + AES key
            const localStr = await AsyncStorage.getItem('ehr_local_records');
            const localRecords = localStr ? JSON.parse(localStr) : {};
            const local = localRecords[record.cidHash || ''];
            if (!local?.cid || !local?.aesKey) {
                Alert.alert('Chưa giải mã', 'Hãy giải mã hồ sơ trước khi chia sẻ để lấy khóa.');
                return;
            }

            // Get recipient NaCl public key
            const recipientKeyRes = await authService.getEncryptionKey(address);
            const recipientPubKey = recipientKeyRes?.encryptionPublicKey;
            if (!recipientPubKey) {
                Alert.alert('Không tìm thấy khóa', 'Địa chỉ ví này chưa đăng ký khóa mã hóa trong hệ thống.');
                return;
            }

            // Encrypt payload with NaCl box
            const { walletClient, address: myAddress } = await walletActionService.getWalletContext();
            const myKeypair = await getOrCreateEncryptionKeypair(walletClient, myAddress);
            const payload = JSON.stringify({ cid: local.cid, aesKey: local.aesKey });
            const encryptedPayload = encryptForRecipient(payload, recipientPubKey, myKeypair.secretKey);

            await keyShareService.shareKey({
                cidHash: record.cidHash!,
                recipientAddress: address,
                encryptedPayload,
                senderPublicKey: myKeypair.publicKey,
            });

            setShowShareModal(false);
            setShareAddress('');
            Alert.alert('Chia sẻ thành công', 'Đã gửi khóa hồ sơ cho bác sĩ.');
        } catch (err: any) {
            Alert.alert('Chia sẻ thất bại', err?.message || 'Không thể chia sẻ hồ sơ.');
        } finally {
            setIsSharing(false);
        }
    };

    const handleDecrypt = async () => {
        setIsDecrypting(true);
        setDecryptError(null);

        try {
            let cid: string | undefined;
            let aesKeyString: string | undefined;

            const localRecordsString = await AsyncStorage.getItem('ehr_local_records');
            const localRecords = localRecordsString ? JSON.parse(localRecordsString) : {};
            const localData = localRecords[record.cidHash || ''];

            if (localData?.cid && localData?.aesKey) {
                cid = localData.cid;
                aesKeyString = localData.aesKey;
            } else {
                const sharedPayload = await decodeSharedKeyPayload(record.cidHash);
                cid = sharedPayload.cid;
                aesKeyString = sharedPayload.aesKeyString;
            }

            if (!cid || !aesKeyString) {
                throw new Error('Thiếu cid hoặc khóa AES.');
            }

            let decrypted: any;
            try {
                const encryptedContent = await ipfsService.download(cid);
                const aesKey = await importAESKey(aesKeyString);
                decrypted = await decryptData(encryptedContent, aesKey);
            } catch (decryptErr: any) {
                const shouldRetryWithSharedKey = Boolean(localData)
                    && String(decryptErr?.message || '').includes('GCM Authentication Failed');

                if (!shouldRetryWithSharedKey) {
                    throw decryptErr;
                }

                const sharedPayload = await decodeSharedKeyPayload(record.cidHash);
                cid = sharedPayload.cid;
                aesKeyString = sharedPayload.aesKeyString;

                const retryEncrypted = await ipfsService.download(cid);
                const retryAesKey = await importAESKey(aesKeyString);
                decrypted = await decryptData(retryEncrypted, retryAesKey);
            }

            setDecryptedData(decrypted);

            if (!cid || !aesKeyString) {
                throw new Error('Thiếu dữ liệu key sau khi giải mã.');
            }

            await saveLocalKey(record.cidHash, cid, aesKeyString, decrypted?.meta?.title || record.title);
        } catch (error: any) {
            const message = classifyDecryptError(error);
            console.warn('Decrypt error:', error?.message || error);
            setDecryptError(message);
            Alert.alert('Lỗi giải mã', message);
        } finally {
            setIsDecrypting(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['bottom', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 10 }}>
                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 18 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, marginBottom: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: EHR_PRIMARY_FIXED }}>
                        <FileText size={24} color={EHR_PRIMARY} />
                    </View>
                    <Text fontSize="$6" fontWeight="700" color="$color12" style={{ marginBottom: 8 }}>
                        {record.title || record.type || 'Hồ sơ y tế không tên'}
                    </Text>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <Clock size={14} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 8 }} />
                        <Text fontSize="$3" color="$color10">{record.date || 'Không có ngày'}</Text>
                    </XStack>
                    <XStack style={{ alignItems: 'center' }}>
                        <User size={14} color={EHR_ON_SURFACE_VARIANT} style={{ marginRight: 8 }} />
                        <Text fontSize="$3" color="$color10">{record.createdByDisplay || 'Người tạo không rõ'}</Text>
                    </XStack>
                </View>

                {!decryptedData ? (
                    <View style={{ borderWidth: 1, borderColor: decryptError ? EHR_ERROR : EHR_OUTLINE_VARIANT, borderRadius: 20, padding: 14, marginBottom: 18, backgroundColor: decryptError ? EHR_ERROR_CONTAINER : EHR_SURFACE_LOWEST }}>
                        <XStack style={{ alignItems: 'center', marginBottom: 8 }}>
                            <Lock size={20} color={decryptError ? EHR_ERROR : EHR_PRIMARY} style={{ marginRight: 8 }} />
                            <Text fontSize="$4" fontWeight="700" color="$color11">Dữ liệu được mã hoá</Text>
                        </XStack>
                        <Text fontSize="$3" color="$color10" style={{ lineHeight: 20, marginBottom: 12 }}>
                            Hồ sơ này đã được mã hoá trên IPFS. Bạn cần giải mã bằng khóa chia sẻ để xem nội dung.
                        </Text>
                        {decryptError ? <Text fontSize="$3" style={{ marginBottom: 10, color: EHR_ERROR }}>{decryptError}</Text> : null}
                        <Button size="$4" background={EHR_PRIMARY} pressStyle={{ background: EHR_PRIMARY_CONTAINER }} icon={isDecrypting ? undefined : <Unlock size={18} color="white" />} onPress={handleDecrypt} disabled={isDecrypting} opacity={isDecrypting ? 0.7 : 1}>
                            <Text color="white" fontWeight="700">{isDecrypting ? 'Đang giải mã...' : 'Giải mã nội dung'}</Text>
                        </Button>
                    </View>
                ) : (
                    <View style={{ backgroundColor: EHR_PRIMARY_FIXED, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 18 }}>
                        <XStack style={{ alignItems: 'center', marginBottom: 10 }}>
                            <Unlock size={20} color={EHR_PRIMARY} style={{ marginRight: 8 }} />
                            <Text fontSize="$5" fontWeight="700" style={{ color: EHR_PRIMARY }}>Nội dung đã giải mã</Text>
                        </XStack>

                        {decryptedImage ? (
                            <YStack style={{ marginBottom: 12 }}>
                                <Text style={{ marginBottom: 8, fontSize: 13, fontWeight: '700' }} color="$color11">Ảnh đính kèm</Text>
                                <View borderColor={EHR_OUTLINE_VARIANT} style={{ borderWidth: 1, borderRadius: 10, overflow: 'hidden' }}>
                                    <Image
                                        source={{ uri: decryptedImage.uri }}
                                        style={{ width: '100%', height: 220, backgroundColor: EHR_SURFACE_LOW }}
                                        resizeMode="cover"
                                    />
                                </View>
                                {decryptedImage.fileName ? (
                                    <Text fontSize="$2" color="$color10" style={{ marginTop: 8 }}>
                                        {decryptedImage.fileName}
                                    </Text>
                                ) : null}
                            </YStack>
                        ) : null}

                        {decryptedData?.meta ? (
                            <YStack style={{ marginBottom: 12 }}>
                                <Text fontSize="$3" fontWeight="700" color="$color11">Thông tin bổ sung:</Text>
                                <Text fontSize="$3" color="$color12">- Tiêu đề: {decryptedData.meta.title}</Text>
                                <Text fontSize="$3" color="$color12">- Loại: {decryptedData.meta.type}</Text>
                                {decryptedData.meta.description ? (
                                    <Text fontSize="$3" color="$color12">- Mô tả: {decryptedData.meta.description}</Text>
                                ) : null}
                            </YStack>
                        ) : null}

                        {decryptedData?.summary ? (
                            <YStack style={{ marginBottom: 12 }}>
                                <Text fontSize="$4" fontWeight="700" color="$color11" style={{ marginBottom: 6 }}>Tóm tắt</Text>
                                <Text fontSize="$3" color="$color12" style={{ lineHeight: 20 }}>{decryptedData.summary}</Text>
                            </YStack>
                        ) : null}

                        {decryptedData?.notes ? (
                            <YStack style={{ marginBottom: 12 }}>
                                <Text fontSize="$4" fontWeight="700" color="$color11" style={{ marginBottom: 6 }}>Ghi chú</Text>
                                <Text fontSize="$3" color="$color12" style={{ lineHeight: 20 }}>{decryptedData.notes}</Text>
                            </YStack>
                        ) : null}

                        {decryptedData?.observations && Object.keys(decryptedData.observations).length > 0 ? (
                            <YStack>
                                <Text fontSize="$4" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Quan trắc lâm sàng</Text>
                                {Object.entries(decryptedData.observations).map(([key, val]: any) => (
                                    <XStack key={key} style={{ justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: EHR_OUTLINE_VARIANT, paddingVertical: 6 }}>
                                        <Text fontSize="$3" color="$color10" style={{ textTransform: 'capitalize' }}>{key}</Text>
                                        <Text fontSize="$3" fontWeight="700" color="$color12">{String(val)}</Text>
                                    </XStack>
                                ))}
                            </YStack>
                        ) : null}

                        {decryptedData?.diagnoses?.length ? (
                            <YStack style={{ marginTop: 12 }}>
                                <Text fontSize="$4" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Chẩn đoán</Text>
                                {decryptedData.diagnoses.map((diagnosis: string, index: number) => (
                                    <Text key={index} fontSize="$3" color="$color12" style={{ marginBottom: 4 }}>- {diagnosis}</Text>
                                ))}
                            </YStack>
                        ) : null}

                        {decryptedData?.prescriptions?.length ? (
                            <YStack style={{ marginTop: 12 }}>
                                <Text fontSize="$4" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Đơn thuốc</Text>
                                {decryptedData.prescriptions.map((prescription: any, index: number) => (
                                    <Text key={index} fontSize="$3" color="$color12" style={{ marginBottom: 4 }}>
                                        - {prescription.medication} - {prescription.dosage} ({prescription.frequency})
                                    </Text>
                                ))}
                            </YStack>
                        ) : null}
                    </View>
                )}

                <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 12 }}>Tuỳ chọn chia sẻ</Text>
                <YStack style={{ gap: 10 }}>
                    <Pressable onPress={() => setShowShareModal(true)}>
                        <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 14 }}>
                            <XStack style={{ alignItems: 'center' }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: EHR_PRIMARY_FIXED }}>
                                    <Share2 size={20} color={EHR_PRIMARY} />
                                </View>
                                <YStack>
                                    <Text fontSize="$4" fontWeight="700" color="$color12">Chia sẻ qua ví (Address)</Text>
                                    <Text fontSize="$2" color="$color10">Cấp quyền online cho bác sĩ</Text>
                                </YStack>
                            </XStack>
                        </View>
                    </Pressable>

                    <Pressable onPress={() => setShowQrModal(true)}>
                        <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 14 }}>
                            <XStack style={{ alignItems: 'center' }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: EHR_SECONDARY_CONTAINER }}>
                                    <QrCode size={20} color={EHR_SECONDARY} />
                                </View>
                                <YStack>
                                    <Text fontSize="$4" fontWeight="700" color="$color12">Hiển thị mã CID</Text>
                                    <Text fontSize="$2" color="$color10">Cho bác sĩ nhập CID Hash để tìm hồ sơ</Text>
                                </YStack>
                            </XStack>
                        </View>
                    </Pressable>
                </YStack>
            </ScrollView>

            {/* Modal: Chia sẻ qua địa chỉ ví */}
            <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={() => setShowShareModal(false)}>
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
                    onPress={() => setShowShareModal(false)}
                >
                    <Pressable onPress={(e) => e.stopPropagation()}>
                        <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderRadius: 24, padding: 20 }}>
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <Text fontSize="$5" fontWeight="700" color="$color12">Chia sẻ hồ sơ</Text>
                                <Pressable onPress={() => setShowShareModal(false)}>
                                    <X size={20} color={EHR_ON_SURFACE_VARIANT} />
                                </Pressable>
                            </XStack>
                            <Text fontSize="$3" color="$color10" style={{ marginBottom: 12 }}>
                                Nhập địa chỉ ví của bác sĩ cần chia sẻ. Khóa hồ sơ sẽ được mã hoá đầu-cuối.
                            </Text>
                            <TextInput
                                value={shareAddress}
                                onChangeText={setShareAddress}
                                placeholder="0x..."
                                placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{
                                    borderWidth: 1,
                                    borderColor: EHR_OUTLINE_VARIANT,
                                    borderRadius: 14,
                                    padding: 12,
                                    fontSize: 14,
                                    color: EHR_ON_SURFACE_VARIANT,
                                    marginBottom: 16,
                                    backgroundColor: EHR_SURFACE_LOW,
                                }}
                            />
                            <Button
                                size="$4"
                                background={EHR_PRIMARY}
                                disabled={isSharing}
                                opacity={isSharing ? 0.7 : 1}
                                onPress={handleShare}
                            >
                                <Text color="white" fontWeight="700">
                                    {isSharing ? 'Đang chia sẻ...' : 'Xác nhận chia sẻ'}
                                </Text>
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Modal: Hiển thị CID Hash */}
            <Modal visible={showQrModal} transparent animationType="fade" onRequestClose={() => setShowQrModal(false)}>
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}
                    onPress={() => setShowQrModal(false)}
                >
                    <Pressable onPress={(e) => e.stopPropagation()}>
                        <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderRadius: 24, padding: 20 }}>
                            <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <Text fontSize="$5" fontWeight="700" color="$color12">CID Hash hồ sơ</Text>
                                <Pressable onPress={() => setShowQrModal(false)}>
                                    <X size={20} color={EHR_ON_SURFACE_VARIANT} />
                                </Pressable>
                            </XStack>
                            <Text fontSize="$3" color="$color10" style={{ marginBottom: 12 }}>
                                Cung cấp mã này cho bác sĩ để họ nhập vào form yêu cầu truy cập.
                            </Text>
                            <View style={{ backgroundColor: EHR_PRIMARY_FIXED, borderRadius: 14, padding: 14 }}>
                                <Text
                                    fontSize="$2"
                                    style={{ color: EHR_PRIMARY, fontFamily: 'monospace', lineHeight: 22 }}
                                    selectable
                                >
                                    {record.cidHash || 'Không có CID'}
                                </Text>
                            </View>
                            <Text fontSize="$2" color="$color10" style={{ marginTop: 10 }}>
                                Nhấn giữ để sao chép mã.
                            </Text>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}
