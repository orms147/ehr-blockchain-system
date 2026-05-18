// DoctorDelegatableRecordsScreen v2 — port from screens/doctor.
// List hồ sơ doctor được phép re-delegate (allowDelegate=true). Re-share
// modal: grantUsingRecordDelegation on-chain + NaCl KeyShare + chain cascade.
//
// ALL wiring preserved:
//   - keyShareService.getDelegatableRecords (TanStack)
//   - consentService.delegateOnChain (msg.sender = doctor, biometric gated)
//   - getOrCreateEncryptionKeypair + encryptForRecipient NaCl seal
//   - keyShareService.shareKey for primary + chain cascade
//   - recordService.getChainCids for cascade enumeration

import React, { useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    Pressable,
    RefreshControl,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { Users, Send, X } from 'lucide-react-native';

import keyShareService from '../../services/keyShare.service';
import authService from '../../services/auth.service';
import consentService from '../../services/consent.service';
import walletActionService from '../../services/walletAction.service';
import { getOrCreateEncryptionKeypair, encryptForRecipient } from '../../services/nacl-crypto';
import localRecordStore from '../../services/localRecordStore';
import recordService from '../../services/record.service';
import useAuthStore from '../../store/authStore';
import ViCard from '../../components-v2/ViCard';
import ViButton from '../../components-v2/ViButton';
import {
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_SOFT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_TERTIARY,
} from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

type DelegatableShare = {
    id: string;
    cidHash: string;
    rootCidHash: string;
    record?: { ownerAddress?: string; title?: string; recordType?: string; parentCidHash?: string };
    sharedBy?: string;
    expiresAt?: string | null;
};

export default function DoctorDelegatableRecordsScreen() {
    const queryClient = useQueryClient();
    const { address: myAddress } = useAuthStore() as any;
    const [selected, setSelected] = useState<DelegatableShare | null>(null);
    const [recipient, setRecipient] = useState('');
    const [expiryDays, setExpiryDays] = useState('30');
    const [sharing, setSharing] = useState(false);

    const { data = [], isLoading, refetch, isRefetching } = useQuery<DelegatableShare[]>({
        queryKey: ['delegatableRecords'],
        queryFn: () => keyShareService.getDelegatableRecords(),
    });

    const closeModal = () => {
        setSelected(null);
        setRecipient('');
        setExpiryDays('30');
    };

    const handleReShare = async () => {
        if (!selected || !recipient) {
            Alert.alert('Thiếu thông tin', 'Vui lòng nhập địa chỉ người nhận.');
            return;
        }
        const addr = recipient.trim().toLowerCase();
        if (!/^0x[a-f0-9]{40}$/.test(addr)) {
            Alert.alert('Địa chỉ không hợp lệ', 'Cần là địa chỉ ví 0x…');
            return;
        }
        const patient = selected.record?.ownerAddress;
        if (!patient) {
            Alert.alert('Lỗi', 'Không xác định được chủ hồ sơ.');
            return;
        }

        setSharing(true);
        try {
            const info = await authService.getEncryptionKey(addr);
            if (!info?.encryptionPublicKey) {
                throw new Error('Người nhận chưa đăng ký khoá mã hoá.');
            }
            const localRecord = await localRecordStore.getKey(selected.cidHash);
            if (!localRecord?.cid || !localRecord?.aesKey) {
                throw new Error('Không tìm thấy khoá giải mã. Hãy mở hồ sơ này trước khi uỷ quyền.');
            }
            const expiresAtMs = expiryDays && expiryDays !== '0'
                ? Date.now() + parseInt(expiryDays, 10) * 86400000
                : (selected.expiresAt ? new Date(selected.expiresAt).getTime() : 0);

            await consentService.delegateOnChain({
                patientAddress: patient,
                granteeAddress: addr,
                rootCidHash: selected.rootCidHash || selected.cidHash,
                aesKey: localRecord.aesKey,
                expiresAtMs,
            });

            const { walletClient } = await walletActionService.getWalletContext();
            const myKeypair = await getOrCreateEncryptionKeypair(walletClient, myAddress!);
            const payload = JSON.stringify({ cid: localRecord.cid, aesKey: localRecord.aesKey });
            const encryptedPayload = encryptForRecipient(payload, info.encryptionPublicKey, myKeypair.secretKey);

            await keyShareService.shareKey({
                cidHash: selected.cidHash,
                recipientAddress: addr,
                encryptedPayload,
                senderPublicKey: myKeypair.publicKey,
                expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
                allowDelegate: false,
            });

            try {
                const chainRes: any = await recordService.getChainCids(selected.cidHash);
                const allVersions: any[] = (chainRes?.records || []).filter(
                    (v: any) => v?.cidHash && v.cidHash !== selected.cidHash,
                );
                const localRecords = await localRecordStore.getAll();
                for (const v of allVersions) {
                    const vLocal = localRecords[v.cidHash];
                    if (!vLocal?.cid || !vLocal?.aesKey) continue;
                    try {
                        const vPayload = JSON.stringify({ cid: vLocal.cid, aesKey: vLocal.aesKey });
                        const vEncrypted = encryptForRecipient(vPayload, info.encryptionPublicKey, myKeypair.secretKey);
                        await keyShareService.shareKey({
                            cidHash: v.cidHash,
                            recipientAddress: addr,
                            encryptedPayload: vEncrypted,
                            senderPublicKey: myKeypair.publicKey,
                            expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
                            allowDelegate: false,
                        });
                    } catch (e) {
                        console.warn('Chain re-share failed for', v.cidHash, e);
                    }
                }
            } catch (e) {
                console.warn('Chain re-share enumeration failed', e);
            }

            Alert.alert('Thành công', `Đã uỷ quyền cho ${addr.slice(0, 10)}…`);
            closeModal();
            queryClient.invalidateQueries({ queryKey: ['delegatableRecords'] });
        } catch (err: any) {
            console.error('Re-share error', err);
            Alert.alert('Lỗi', err?.message || 'Không thể uỷ quyền hồ sơ.');
        } finally {
            setSharing(false);
        }
    };

    const renderItem = ({ item }: { item: DelegatableShare }) => (
        <ViCard padding={14} style={{ marginBottom: 10 }}>
            <XStack style={{ alignItems: 'center', gap: 10 }}>
                <View
                    style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: `${EHR_TERTIARY}1A`,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Users size={18} color={EHR_TERTIARY} />
                </View>
                <YStack style={{ flex: 1 }}>
                    <Text
                        style={{
                            fontFamily: SANS_MEDIUM,
                            fontSize: 14,
                            color: EHR_ON_SURFACE,
                            fontWeight: '600',
                        }}
                    >
                        {item.record?.title || 'Hồ sơ y tế'}
                    </Text>
                    <Text style={{ fontFamily: SANS, fontSize: 12, color: EHR_OUTLINE, marginTop: 2 }}>
                        {item.record?.recordType || 'medical_record'}
                    </Text>
                    <Text style={{ fontFamily: 'monospace', fontSize: 11, color: EHR_OUTLINE, marginTop: 2 }}>
                        BN: {item.record?.ownerAddress?.slice(0, 10)}…
                    </Text>
                </YStack>
            </XStack>
            <View style={{ marginTop: 10 }}>
                <ViButton
                    variant="primary"
                    full
                    size="sm"
                    onPress={() => setSelected(item)}
                    leftIcon={<Send size={14} color={EHR_SURFACE} />}
                >
                    Uỷ quyền cho BS khác
                </ViButton>
            </View>
        </ViCard>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }}>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 26,
                        color: EHR_ON_SURFACE,
                        letterSpacing: -0.4,
                        lineHeight: 30,
                    }}
                >
                    Hồ sơ uỷ quyền lại
                </Text>
                <Text
                    style={{
                        marginTop: 4,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: EHR_ON_SURFACE_VARIANT,
                        lineHeight: 19,
                    }}
                >
                    Hồ sơ bệnh nhân cấp quyền cho bạn re-share cho đồng nghiệp (A → B).
                </Text>
            </View>

            <FlatList
                data={data}
                renderItem={renderItem}
                keyExtractor={(it) => it.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={refetch}
                        tintColor={EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListEmptyComponent={
                    !isLoading ? (
                        <View style={{ paddingTop: 30, alignItems: 'center' }}>
                            <Users size={28} color={EHR_OUTLINE} />
                            <Text
                                style={{
                                    marginTop: 12,
                                    fontFamily: SERIF,
                                    fontSize: 18,
                                    color: EHR_ON_SURFACE,
                                    textAlign: 'center',
                                }}
                            >
                                Chưa có hồ sơ nào
                            </Text>
                            <Text
                                style={{
                                    marginTop: 8,
                                    fontFamily: SANS,
                                    fontSize: 13,
                                    color: EHR_OUTLINE,
                                    textAlign: 'center',
                                    maxWidth: 280,
                                    lineHeight: 19,
                                }}
                            >
                                Bệnh nhân chưa cấp quyền uỷ quyền lại (allowDelegate=true) cho hồ sơ nào của bạn.
                            </Text>
                        </View>
                    ) : null
                }
            />

            <Modal visible={!!selected} animationType="slide" transparent onRequestClose={closeModal}>
                <View
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        justifyContent: 'flex-end',
                    }}
                >
                    <View
                        style={{
                            backgroundColor: EHR_SURFACE_LOWEST,
                            borderTopLeftRadius: 22,
                            borderTopRightRadius: 22,
                            padding: 22,
                            paddingBottom: 36,
                        }}
                    >
                        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <Text
                                style={{
                                    fontFamily: SERIF,
                                    fontSize: 20,
                                    color: EHR_ON_SURFACE,
                                    letterSpacing: -0.3,
                                }}
                            >
                                Uỷ quyền hồ sơ
                            </Text>
                            <Pressable onPress={closeModal} hitSlop={8}>
                                <X size={18} color={EHR_OUTLINE} />
                            </Pressable>
                        </XStack>
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: EHR_ON_SURFACE_VARIANT, marginBottom: 16 }}>
                            {selected?.record?.title}
                        </Text>

                        <FieldLabel>Địa chỉ ví người nhận</FieldLabel>
                        <TextInput
                            style={{
                                borderWidth: 0.5,
                                borderColor: EHR_OUTLINE_SOFT,
                                borderRadius: 12,
                                paddingVertical: 11,
                                paddingHorizontal: 14,
                                color: EHR_ON_SURFACE,
                                backgroundColor: EHR_SURFACE,
                                fontFamily: 'monospace',
                                fontSize: 13,
                                marginBottom: 14,
                            }}
                            placeholder="0x..."
                            placeholderTextColor={EHR_OUTLINE}
                            value={recipient}
                            onChangeText={setRecipient}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <FieldLabel>Thời hạn (ngày, 0 = dùng hạn gốc)</FieldLabel>
                        <TextInput
                            style={{
                                borderWidth: 0.5,
                                borderColor: EHR_OUTLINE_SOFT,
                                borderRadius: 12,
                                paddingVertical: 11,
                                paddingHorizontal: 14,
                                color: EHR_ON_SURFACE,
                                backgroundColor: EHR_SURFACE,
                                fontFamily: SANS,
                                fontSize: 14,
                                marginBottom: 18,
                            }}
                            placeholder="30"
                            placeholderTextColor={EHR_OUTLINE}
                            value={expiryDays}
                            onChangeText={setExpiryDays}
                            keyboardType="number-pad"
                        />

                        <ViButton variant="cinnabar" full loading={sharing} onPress={handleReShare}>
                            {sharing ? 'Đang ký…' : 'Ký & Uỷ quyền on-chain'}
                        </ViButton>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 11.5,
                color: EHR_OUTLINE,
                marginBottom: 6,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                fontWeight: '600',
            }}
        >
            {children}
        </Text>
    );
}

void EHR_PRIMARY_FIXED;
