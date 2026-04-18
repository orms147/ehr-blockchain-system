import React, { useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Info,
    QrCode,
    Shield,
    Trash2,
    UserPlus,
    Users,
    X,
} from 'lucide-react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import QrAddressScanner from '../components/QrAddressScanner';
import {
    useGrantAuthority,
    useMyDelegates,
    useRevokeAuthority,
    type DelegationRow,
} from '../hooks/queries/useDelegations';
import {
    EHR_ON_SURFACE,
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
import { formatExpiry } from '../utils/dateFormatting';

const truncateAddr = (addr?: string | null) =>
    addr ? `${addr.substring(0, 8)}...${addr.slice(-6)}` : '???';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function DelegationCard({
    item,
    onRevoke,
    revoking,
}: {
    item: DelegationRow;
    onRevoke: (item: DelegationRow) => void;
    revoking: boolean;
}) {
    const isActive = item.status === 'active';
    const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();
    const statusLabel = !isActive
        ? 'ĐÃ THU HỒI'
        : isExpired
        ? 'HẾT HẠN'
        : 'HOẠT ĐỘNG';
    const statusColor = !isActive || isExpired ? EHR_SECONDARY : EHR_PRIMARY;
    const statusBg = !isActive || isExpired ? EHR_SECONDARY_CONTAINER : EHR_PRIMARY_FIXED;

    return (
        <View
            style={{
                backgroundColor: EHR_SURFACE_LOWEST,
                borderColor: EHR_OUTLINE_VARIANT,
                borderWidth: 1,
                borderRadius: 20,
                padding: 16,
                marginBottom: 12,
            }}
        >
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <YStack style={{ flex: 1, paddingRight: 12 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <Shield size={14} color={EHR_PRIMARY} style={{ marginRight: 6 }} />
                        <Text fontSize="$4" fontWeight="700" color="$color12">
                            {truncateAddr(item.delegateeAddress)}
                        </Text>
                    </XStack>
                    <Text fontSize="$2" color="$color10">
                        {item.chainDepth === 1 ? 'Uỷ quyền trực tiếp' : `Chuỗi uỷ quyền ${item.chainDepth} cấp`}
                        {item.allowSubDelegate ? ' • cho phép uỷ quyền tiếp' : ''}
                    </Text>
                    {item.parentDelegator ? (
                        <Text fontSize="$1" color="$color9" marginTop="$1">
                            Từ: {truncateAddr(item.parentDelegator)}
                        </Text>
                    ) : null}
                    <Text fontSize="$1" color="$color9" marginTop="$1">
                        Hết hạn: {formatExpiry(item.expiresAt)}
                    </Text>
                    {item.scopeNote ? (
                        <Text fontSize="$1" color="$color10" marginTop="$1" numberOfLines={2}>
                            Phạm vi: {item.scopeNote}
                        </Text>
                    ) : null}
                </YStack>

                <View
                    style={{
                        backgroundColor: statusBg,
                        borderRadius: 10,
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                    }}
                >
                    <Text fontSize="$1" fontWeight="700" color={statusColor}>
                        {statusLabel}
                    </Text>
                </View>
            </XStack>

            {isActive && !isExpired ? (
                <Pressable
                    onPress={() => onRevoke(item)}
                    disabled={revoking}
                    style={{
                        backgroundColor: revoking ? EHR_SURFACE_LOW : EHR_SECONDARY_CONTAINER,
                        borderRadius: 12,
                        paddingVertical: 10,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        marginTop: 4,
                    }}
                >
                    <Trash2 size={16} color={EHR_SECONDARY} style={{ marginRight: 6 }} />
                    <Text fontSize="$3" fontWeight="600" color={EHR_SECONDARY}>
                        {revoking ? 'Đang thu hồi...' : 'Thu hồi uỷ quyền'}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

function GrantAuthorityModal({
    visible,
    onClose,
    onSubmit,
    submitting,
}: {
    visible: boolean;
    onClose: () => void;
    onSubmit: (data: {
        delegateeAddress: string;
        durationDays: number;
        allowSubDelegate: boolean;
        scopeNote: string | null;
    }) => void;
    submitting: boolean;
}) {
    const [address, setAddress] = useState('');
    const [days, setDays] = useState('30');
    const [allowSub, setAllowSub] = useState(false);
    const [scope, setScope] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);

    const addressValid = useMemo(() => ADDRESS_RE.test(address.trim()), [address]);

    const handleSubmit = () => {
        if (!addressValid) {
            Alert.alert('Địa chỉ không hợp lệ', 'Nhập địa chỉ ví bác sĩ 0x...');
            return;
        }
        const d = parseInt(days, 10);
        if (!Number.isFinite(d) || d < 1 || d > 1825) {
            Alert.alert('Thời hạn không hợp lệ', 'Nhập số ngày từ 1 đến 1825 (tối đa 5 năm).');
            return;
        }
        onSubmit({
            delegateeAddress: address.trim(),
            durationDays: d,
            allowSubDelegate: allowSub,
            scopeNote: scope.trim() || null,
        });
    };

    const reset = () => {
        setAddress('');
        setDays('30');
        setAllowSub(false);
        setScope('');
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.modalOverlay}
            >
                <View style={styles.modalContent}>
                    <XStack style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text fontSize={18} fontWeight="700" color={EHR_ON_SURFACE}>
                            Uỷ quyền bác sĩ
                        </Text>
                        <Pressable
                            onPress={() => {
                                onClose();
                                reset();
                            }}
                            style={{ padding: 6 }}
                        >
                            <X size={20} color={EHR_ON_SURFACE_VARIANT} />
                        </Pressable>
                    </XStack>

                    <ScrollView keyboardShouldPersistTaps="handled">
                        <Text style={styles.label}>Địa chỉ ví bác sĩ</Text>
                        <XStack style={{ gap: 8 }}>
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="0x..."
                                placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                                value={address}
                                onChangeText={setAddress}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <Pressable
                                onPress={() => setScannerOpen(true)}
                                style={styles.qrButton}
                            >
                                <QrCode size={20} color={EHR_PRIMARY} />
                            </Pressable>
                        </XStack>
                        {address.length > 0 && !addressValid ? (
                            <Text fontSize="$1" color={EHR_SECONDARY} marginTop={4}>
                                Cần là địa chỉ 0x + 40 ký tự hex.
                            </Text>
                        ) : null}

                        <Text style={[styles.label, { marginTop: 16 }]}>Thời hạn uỷ quyền (ngày)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="30"
                            placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                            value={days}
                            onChangeText={setDays}
                            keyboardType="number-pad"
                        />
                        <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop={4}>
                            Tối thiểu 1 ngày, tối đa 1825 (5 năm).
                        </Text>

                        <XStack
                            style={{
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: 16,
                                padding: 12,
                                backgroundColor: EHR_SURFACE_LOW,
                                borderRadius: 12,
                            }}
                        >
                            <YStack style={{ flex: 1, paddingRight: 12 }}>
                                <Text fontSize="$3" fontWeight="600" color={EHR_ON_SURFACE}>
                                    Cho phép uỷ quyền tiếp
                                </Text>
                                <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop={2}>
                                    Bác sĩ có thể uỷ quyền tiếp cho bác sĩ khác.
                                </Text>
                            </YStack>
                            <Switch
                                value={allowSub}
                                onValueChange={setAllowSub}
                                trackColor={{ false: EHR_OUTLINE_VARIANT, true: EHR_PRIMARY_CONTAINER }}
                                thumbColor={allowSub ? EHR_PRIMARY : EHR_SURFACE_LOWEST}
                            />
                        </XStack>

                        <Text style={[styles.label, { marginTop: 16 }]}>Phạm vi lâm sàng (tuỳ chọn)</Text>
                        <TextInput
                            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                            placeholder="VD: điều trị tiểu đường, ICD-10 E11..."
                            placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                            value={scope}
                            onChangeText={setScope}
                            multiline
                            maxLength={500}
                        />

                        <Pressable
                            onPress={handleSubmit}
                            disabled={submitting || !addressValid}
                            style={{
                                backgroundColor: submitting || !addressValid ? EHR_SURFACE_LOW : EHR_PRIMARY,
                                borderRadius: 14,
                                paddingVertical: 14,
                                alignItems: 'center',
                                marginTop: 20,
                                marginBottom: 8,
                            }}
                        >
                            <Text fontSize="$4" fontWeight="700" color={EHR_SURFACE_LOWEST}>
                                {submitting ? 'Đang xử lý...' : 'Ký & Uỷ quyền'}
                            </Text>
                        </Pressable>

                        <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} style={{ textAlign: 'center', marginBottom: 20 }}>
                            Miễn phí gas (tính 1/100 lượt ký/tháng)
                        </Text>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
            <QrAddressScanner
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScanned={(v) => {
                    setAddress(v);
                    setScannerOpen(false);
                }}
                title="Quét QR bác sĩ"
                subtitle="Di chuyển camera đến mã QR chứa địa chỉ ví bác sĩ."
            />
        </Modal>
    );
}

export default function DelegationScreen() {
    const { data: delegations = [], isLoading, isFetching, refetch } = useMyDelegates();
    const grantMutation = useGrantAuthority();
    const revokeMutation = useRevokeAuthority();
    const [grantOpen, setGrantOpen] = useState(false);
    const [revokingAddr, setRevokingAddr] = useState<string | null>(null);

    const handleGrant = async (data: {
        delegateeAddress: string;
        durationDays: number;
        allowSubDelegate: boolean;
        scopeNote: string | null;
    }) => {
        try {
            const result = await grantMutation.mutateAsync(data);
            setGrantOpen(false);
            Alert.alert(
                'Đã uỷ quyền',
                `Bác sĩ ${truncateAddr(data.delegateeAddress)} đã được uỷ quyền truy cập.\n\nTx: ${result.txHash.slice(0, 14)}...`,
            );
        } catch (err: any) {
            Alert.alert('Uỷ quyền thất bại', err?.message || 'Không thể uỷ quyền.');
        }
    };

    const handleRevoke = (item: DelegationRow) => {
        Alert.alert(
            'Thu hồi uỷ quyền',
            `Thu hồi quyền của ${truncateAddr(item.delegateeAddress)}?\n\nTất cả các uỷ quyền con và các hồ sơ bác sĩ này đã chia sẻ cho người khác sẽ bị vô hiệu theo cơ chế epoch cascade on-chain.`,
            [
                { text: 'Huỷ', style: 'cancel' },
                {
                    text: 'Thu hồi',
                    style: 'destructive',
                    onPress: async () => {
                        setRevokingAddr(item.delegateeAddress);
                        try {
                            const result = await revokeMutation.mutateAsync(item.delegateeAddress);
                            Alert.alert('Đã thu hồi', `Tx: ${result.txHash.slice(0, 14)}...`);
                        } catch (err: any) {
                            Alert.alert('Lỗi', err?.message || 'Không thể thu hồi.');
                        } finally {
                            setRevokingAddr(null);
                        }
                    },
                },
            ],
        );
    };

    if (isLoading) {
        return <LoadingSpinner message="Đang tải danh sách uỷ quyền..." />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <YStack style={{ padding: 20, paddingBottom: 12 }}>
                <Text fontSize={26} fontWeight="800" color={EHR_ON_SURFACE} letterSpacing={-0.5}>
                    Uỷ quyền
                </Text>
                <Text fontSize="$3" color={EHR_ON_SURFACE_VARIANT} marginTop="$1">
                    Cấp cho bác sĩ quyền thay bạn chia sẻ hồ sơ y tế với đồng nghiệp chuyên khoa.
                </Text>
            </YStack>

            <Pressable
                onPress={() => setGrantOpen(true)}
                style={{
                    marginHorizontal: 20,
                    marginBottom: 12,
                    backgroundColor: EHR_PRIMARY,
                    borderRadius: 16,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <UserPlus size={18} color={EHR_SURFACE_LOWEST} style={{ marginRight: 8 }} />
                <Text fontSize="$4" fontWeight="700" color={EHR_SURFACE_LOWEST}>
                    Uỷ quyền cho bác sĩ mới
                </Text>
            </Pressable>

            <View
                style={{
                    marginHorizontal: 20,
                    marginBottom: 12,
                    backgroundColor: EHR_SECONDARY_CONTAINER,
                    borderRadius: 16,
                    padding: 14,
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                }}
            >
                <Info size={16} color={EHR_SECONDARY} style={{ marginRight: 8, marginTop: 2 }} />
                <Text fontSize="$2" color={EHR_SECONDARY} flex={1} lineHeight={18}>
                    Khi thu hồi, tất cả các chuỗi uỷ quyền tiếp (sub-delegation) và các hồ sơ bác sĩ
                    đã chia sẻ cho người khác dựa vào uỷ quyền này cũng sẽ bị vô hiệu.
                </Text>
            </View>

            <FlatList
                data={delegations}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isFetching && !isLoading}
                        onRefresh={() => refetch()}
                        tintColor={EHR_PRIMARY}
                    />
                }
                ListEmptyComponent={
                    <View style={{ paddingTop: 40 }}>
                        <EmptyState
                            icon={Users}
                            title="Chưa có uỷ quyền nào"
                            description="Bấm nút ở trên để uỷ quyền cho bác sĩ đầu tiên."
                        />
                    </View>
                }
                renderItem={({ item }) => (
                    <DelegationCard
                        item={item}
                        revoking={revokingAddr === item.delegateeAddress}
                        onRevoke={handleRevoke}
                    />
                )}
            />

            <GrantAuthorityModal
                visible={grantOpen}
                onClose={() => setGrantOpen(false)}
                onSubmit={handleGrant}
                submitting={grantMutation.isPending}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        padding: 20,
        paddingBottom: 36,
        maxHeight: '90%',
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: EHR_ON_SURFACE,
        marginBottom: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        borderRadius: 12,
        padding: 12,
        fontSize: 14,
        color: EHR_ON_SURFACE,
        backgroundColor: EHR_SURFACE_LOW,
    },
    qrButton: {
        width: 48,
        borderWidth: 1,
        borderColor: EHR_OUTLINE_VARIANT,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: EHR_SURFACE_LOW,
    },
});
