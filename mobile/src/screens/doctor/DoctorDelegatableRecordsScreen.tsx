import React, { useState } from 'react';
import { Alert, FlatList, RefreshControl, Modal, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { YStack, XStack, Text, View, Button } from 'tamagui';
import { Users, Send, X } from 'lucide-react-native';

import keyShareService from '../../services/keyShare.service';
import authService from '../../services/auth.service';
import consentService from '../../services/consent.service';
import walletActionService from '../../services/walletAction.service';
import { getOrCreateEncryptionKeypair, encryptForRecipient } from '../../services/nacl-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import recordService from '../../services/record.service';
import useAuthStore from '../../store/authStore';

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
    const { address: myAddress } = useAuthStore();
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
            // 1. Verify recipient has encryption key
            const info = await authService.getEncryptionKey(addr);
            if (!info?.encryptionPublicKey) {
                throw new Error('Người nhận chưa đăng ký khóa mã hóa.');
            }

            // 2. Get local key for this record (I must have claimed & decrypted it before)
            const localStr = await AsyncStorage.getItem('ehr_local_records');
            const localRecords = localStr ? JSON.parse(localStr) : {};
            const localRecord = localRecords?.[selected.cidHash];
            if (!localRecord?.cid || !localRecord?.aesKey) {
                throw new Error('Không tìm thấy khóa giải mã. Hãy mở hồ sơ này trước khi ủy quyền.');
            }

            // 3. Compute expiry
            const expiresAtMs = expiryDays && expiryDays !== '0'
                ? Date.now() + parseInt(expiryDays, 10) * 86400000
                : (selected.expiresAt ? new Date(selected.expiresAt).getTime() : 0);

            // 4. On-chain: grantUsingRecordDelegation (msg.sender = me, doctor A)
            await consentService.delegateOnChain({
                patientAddress: patient,
                granteeAddress: addr,
                rootCidHash: selected.rootCidHash || selected.cidHash,
                aesKey: localRecord.aesKey,
                expiresAtMs,
            });

            // 5. Re-encrypt NaCl box for new recipient & POST key share
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
                allowDelegate: false, // re-shared records cannot be chain-delegated further
            });

            // 6. Propagate to every other version in the chain the delegating doctor
            // has local keys for. On-chain consent already covers whole tree because
            // grantUsingRecordDelegation works at root level, so keyShare rows just
            // mirror the access for fast backend lookup per version.
            try {
                const chainRes: any = await recordService.getChainCids(selected.cidHash);
                const allVersions: any[] = (chainRes?.records || [])
                    .filter((v: any) => v?.cidHash && v.cidHash !== selected.cidHash);
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

            Alert.alert('Thành công', `Đã ủy quyền cho ${addr.slice(0, 10)}…`);
            closeModal();
            queryClient.invalidateQueries({ queryKey: ['delegatableRecords'] });
        } catch (err: any) {
            console.error('Re-share error', err);
            Alert.alert('Lỗi', err?.message || 'Không thể ủy quyền hồ sơ.');
        } finally {
            setSharing(false);
        }
    };

    const renderItem = ({ item }: { item: DelegatableShare }) => (
        <View style={styles.card}>
            <XStack gap={10} alignItems="center">
                <Users size={22} color="#8b5cf6" />
                <YStack flex={1}>
                    <Text fontSize={15} fontWeight="600" color="#0f172a">
                        {item.record?.title || 'Hồ sơ y tế'}
                    </Text>
                    <Text fontSize={12} color="#64748b">
                        {item.record?.recordType || 'medical_record'}
                    </Text>
                    <Text fontSize={11} color="#94a3b8" marginTop={2}>
                        BN: {item.record?.ownerAddress?.slice(0, 10)}…
                    </Text>
                </YStack>
            </XStack>
            <Button
                size="$3"
                backgroundColor="#8b5cf6"
                color="white"
                marginTop={10}
                icon={<Send size={16} color="white" />}
                onPress={() => setSelected(item)}
            >
                Ủy quyền cho BS khác
            </Button>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <YStack padding={16} gap={8}>
                <Text fontSize={20} fontWeight="700" color="#0f172a">Hồ sơ có thể ủy quyền</Text>
                <Text fontSize={13} color="#64748b">
                    Những hồ sơ bạn nhận được quyền ủy quyền tiếp (A → B).
                </Text>
            </YStack>

            <FlatList
                data={data}
                renderItem={renderItem}
                keyExtractor={(it) => it.id}
                contentContainerStyle={{ padding: 16, paddingTop: 0 }}
                refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
                ListEmptyComponent={
                    !isLoading ? (
                        <View style={styles.empty}>
                            <Text color="#64748b">Chưa có hồ sơ nào được phép ủy quyền.</Text>
                        </View>
                    ) : null
                }
            />

            <Modal visible={!!selected} animationType="slide" transparent onRequestClose={closeModal}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <XStack justifyContent="space-between" alignItems="center" marginBottom={12}>
                            <Text fontSize={18} fontWeight="700" color="#0f172a">Ủy quyền hồ sơ</Text>
                            <Button size="$2" circular icon={<X size={18} />} onPress={closeModal} />
                        </XStack>
                        <Text fontSize={13} color="#64748b" marginBottom={16}>
                            {selected?.record?.title}
                        </Text>
                        <Text fontSize={13} fontWeight="600" marginBottom={6}>Địa chỉ ví người nhận</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0x..."
                            value={recipient}
                            onChangeText={setRecipient}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <Text fontSize={13} fontWeight="600" marginTop={12} marginBottom={6}>Thời hạn (ngày, 0 = dùng hạn gốc)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="30"
                            value={expiryDays}
                            onChangeText={setExpiryDays}
                            keyboardType="number-pad"
                        />
                        <Button
                            marginTop={16}
                            backgroundColor="#8b5cf6"
                            color="white"
                            onPress={handleReShare}
                            disabled={sharing}
                        >
                            {sharing ? <ActivityIndicator color="white" /> : 'Ký & Ủy quyền on-chain'}
                        </Button>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    card: {
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    empty: { padding: 40, alignItems: 'center' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: 'white',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        padding: 20,
        paddingBottom: 36,
    },
    input: {
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        backgroundColor: '#f8fafc',
    },
});
