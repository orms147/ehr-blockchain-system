// DelegationScreen v2 — port of .design-bundle/project/screens-extras.jsx
// DelegationScreen. Patient cấp Full Delegate (toàn quyền hồ sơ) cho bác sĩ
// trong thời hạn ngày. Cinnabar reserved cho cấp + thu hồi (legal-action
// epoch cascade).
//
// Wiring preserved:
//   - useMyDelegates / useGrantAuthority / useRevokeAuthority TanStack hooks
//   - GrantAuthorityModal: address + days + allowSubDelegate switch + scope note
//   - QrAddressScanner for delegatee address
//   - Epoch cascade warning explained in info banner

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
    Switch,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { Info, QrCode, Trash2, UserPlus, Users, X } from 'lucide-react-native';

import LoadingSpinner from '../components/LoadingSpinner';
import QrAddressScanner from '../components/QrAddressScanner';
import {
    useGrantAuthority,
    useMyDelegates,
    useRevokeAuthority,
    type DelegationRow,
} from '../hooks/queries/useDelegations';
import ViCard from '../components-v2/ViCard';
import ViButton from '../components-v2/ViButton';
import { ViStatusChip } from '../components-v2/ViChips';
import {
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE,
    EHR_OUTLINE_SOFT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_TERTIARY,
    EHR_WARNING,
} from '../constants/uiColors';
import { formatExpiry } from '../utils/dateFormatting';

const SERIF = 'Fraunces_400Regular';
const SANS = 'DMSans_400Regular';
const SANS_MEDIUM = 'DMSans_500Medium';
const SANS_SEMI = 'DMSans_600SemiBold';

const truncate = (addr?: string | null) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '???';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function statusToken(item: DelegationRow): 'active' | 'expired' | 'revoked' {
    const isActive = item.status === 'active';
    const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();
    if (!isActive) return 'revoked';
    if (isExpired) return 'expired';
    return 'active';
}

function DelegationCard({
    item,
    onRevoke,
    revoking,
}: {
    item: DelegationRow;
    onRevoke: (item: DelegationRow) => void;
    revoking: boolean;
}) {
    const token = statusToken(item);
    const isActive = token === 'active';

    return (
        <ViCard padding={16} style={{ marginBottom: 10 }}>
            <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                <YStack style={{ flex: 1, paddingRight: 10 }}>
                    <Text
                        style={{
                            fontFamily: 'monospace',
                            fontSize: 13,
                            color: EHR_ON_SURFACE,
                            fontWeight: '600',
                            marginBottom: 4,
                        }}
                    >
                        {truncate(item.delegateeAddress)}
                    </Text>
                    <Text style={{ fontFamily: SANS, fontSize: 12, color: EHR_OUTLINE }}>
                        {item.chainDepth === 1
                            ? 'Uỷ quyền trực tiếp'
                            : `Chuỗi uỷ quyền ${item.chainDepth} cấp`}
                        {item.allowSubDelegate ? ' · cho phép uỷ quyền tiếp' : ''}
                    </Text>
                </YStack>
                <ViStatusChip status={token} />
            </XStack>

            {item.parentDelegator ? (
                <Text style={{ fontFamily: SANS, fontSize: 11.5, color: EHR_OUTLINE, marginBottom: 4 }}>
                    Từ:{' '}
                    <Text style={{ fontFamily: 'monospace' }}>{truncate(item.parentDelegator)}</Text>
                </Text>
            ) : null}
            <Text style={{ fontFamily: SANS, fontSize: 11.5, color: EHR_OUTLINE, marginBottom: 4 }}>
                Hết hạn: {formatExpiry(item.expiresAt)}
            </Text>
            {item.scopeNote ? (
                <Text
                    style={{ fontFamily: SANS, fontSize: 11.5, color: EHR_OUTLINE, lineHeight: 16 }}
                    numberOfLines={2}
                >
                    Phạm vi: {item.scopeNote}
                </Text>
            ) : null}

            {isActive ? (
                <View style={{ marginTop: 12 }}>
                    <ViButton
                        variant="danger"
                        full
                        size="sm"
                        loading={revoking}
                        onPress={() => onRevoke(item)}
                        leftIcon={<Trash2 size={13} color={EHR_PRIMARY} />}
                    >
                        {revoking ? 'Đang thu hồi…' : 'Thu hồi uỷ quyền'}
                    </ViButton>
                </View>
            ) : null}
        </ViCard>
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

    const reset = () => {
        setAddress('');
        setDays('30');
        setAllowSub(false);
        setScope('');
    };

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

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            >
                <View
                    style={{
                        backgroundColor: EHR_SURFACE_LOWEST,
                        borderTopLeftRadius: 22,
                        borderTopRightRadius: 22,
                        padding: 22,
                        paddingBottom: 36,
                        maxHeight: '90%',
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
                            Uỷ quyền bác sĩ
                        </Text>
                        <Pressable
                            onPress={() => {
                                onClose();
                                reset();
                            }}
                            hitSlop={8}
                        >
                            <X size={18} color={EHR_OUTLINE} />
                        </Pressable>
                    </XStack>

                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        <FieldLabel>Địa chỉ ví bác sĩ</FieldLabel>
                        <XStack style={{ gap: 8, marginBottom: 6 }}>
                            <TextInput
                                style={{
                                    flex: 1,
                                    borderWidth: 0.5,
                                    borderColor: EHR_OUTLINE_SOFT,
                                    borderRadius: 12,
                                    paddingVertical: 11,
                                    paddingHorizontal: 14,
                                    color: EHR_ON_SURFACE,
                                    backgroundColor: EHR_SURFACE,
                                    fontFamily: 'monospace',
                                    fontSize: 13,
                                }}
                                placeholder="0x..."
                                placeholderTextColor={EHR_OUTLINE}
                                value={address}
                                onChangeText={setAddress}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <Pressable
                                onPress={() => setScannerOpen(true)}
                                style={({ pressed }) => ({
                                    width: 46,
                                    borderWidth: 0.5,
                                    borderColor: EHR_OUTLINE_SOFT,
                                    borderRadius: 12,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: EHR_SURFACE,
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <QrCode size={18} color={EHR_PRIMARY} />
                            </Pressable>
                        </XStack>
                        {address.length > 0 && !addressValid ? (
                            <Text style={{ fontFamily: SANS, fontSize: 11, color: EHR_PRIMARY, marginBottom: 8 }}>
                                Cần là địa chỉ 0x + 40 ký tự hex.
                            </Text>
                        ) : null}

                        <View style={{ height: 14 }} />
                        <FieldLabel>Thời hạn uỷ quyền (ngày)</FieldLabel>
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
                            }}
                            placeholder="30"
                            placeholderTextColor={EHR_OUTLINE}
                            value={days}
                            onChangeText={setDays}
                            keyboardType="number-pad"
                        />
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: EHR_OUTLINE, marginTop: 4 }}>
                            Tối thiểu 1 ngày, tối đa 1825 (5 năm).
                        </Text>

                        <XStack
                            style={{
                                marginTop: 14,
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                backgroundColor: EHR_SURFACE,
                                borderWidth: 0.5,
                                borderColor: EHR_OUTLINE_SOFT,
                                borderRadius: 12,
                                alignItems: 'center',
                            }}
                        >
                            <YStack style={{ flex: 1, paddingRight: 12 }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 13.5,
                                        color: EHR_ON_SURFACE,
                                        fontWeight: '600',
                                    }}
                                >
                                    Cho phép uỷ quyền tiếp
                                </Text>
                                <Text
                                    style={{
                                        marginTop: 2,
                                        fontFamily: SANS,
                                        fontSize: 11.5,
                                        color: EHR_OUTLINE,
                                        lineHeight: 16,
                                    }}
                                >
                                    Bác sĩ có thể uỷ quyền tiếp cho đồng nghiệp khác.
                                </Text>
                            </YStack>
                            <Switch
                                value={allowSub}
                                onValueChange={setAllowSub}
                                trackColor={{ false: EHR_OUTLINE_VARIANT, true: EHR_PRIMARY }}
                                thumbColor="#FAF7F1"
                            />
                        </XStack>

                        <View style={{ height: 14 }} />
                        <FieldLabel>Phạm vi lâm sàng (tuỳ chọn)</FieldLabel>
                        <TextInput
                            style={{
                                minHeight: 80,
                                borderWidth: 0.5,
                                borderColor: EHR_OUTLINE_SOFT,
                                borderRadius: 12,
                                paddingVertical: 11,
                                paddingHorizontal: 14,
                                color: EHR_ON_SURFACE,
                                backgroundColor: EHR_SURFACE,
                                fontFamily: SANS,
                                fontSize: 14,
                                textAlignVertical: 'top',
                            }}
                            placeholder="VD: điều trị tiểu đường, ICD-10 E11..."
                            placeholderTextColor={EHR_OUTLINE}
                            value={scope}
                            onChangeText={setScope}
                            multiline
                            maxLength={500}
                        />

                        <View style={{ height: 18 }} />
                        <ViButton
                            variant="cinnabar"
                            full
                            size="lg"
                            loading={submitting}
                            disabled={!addressValid}
                            onPress={handleSubmit}
                        >
                            {submitting ? 'Đang xử lý…' : 'Ký & Uỷ quyền'}
                        </ViButton>
                        <Text
                            style={{
                                marginTop: 10,
                                textAlign: 'center',
                                fontFamily: SANS,
                                fontSize: 11,
                                color: EHR_OUTLINE,
                                lineHeight: 16,
                            }}
                        >
                            Miễn phí gas (tính 1/100 lượt ký/tháng) · biometric prompt sẽ hiện
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
                `Bác sĩ ${truncate(data.delegateeAddress)} đã được uỷ quyền.\n\nTx: ${result.txHash.slice(0, 14)}…`,
            );
        } catch (err: any) {
            Alert.alert('Uỷ quyền thất bại', err?.message || 'Không thể uỷ quyền.');
        }
    };

    const handleRevoke = (item: DelegationRow) => {
        Alert.alert(
            'Thu hồi uỷ quyền',
            `Thu hồi quyền của ${truncate(item.delegateeAddress)}?\n\nTất cả các uỷ quyền con và hồ sơ bác sĩ này đã chia sẻ cho người khác sẽ bị vô hiệu (epoch cascade on-chain).`,
            [
                { text: 'Huỷ', style: 'cancel' },
                {
                    text: 'Thu hồi',
                    style: 'destructive',
                    onPress: async () => {
                        setRevokingAddr(item.delegateeAddress);
                        try {
                            const result = await revokeMutation.mutateAsync(item.delegateeAddress);
                            Alert.alert('Đã thu hồi', `Tx: ${result.txHash.slice(0, 14)}…`);
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

    if (isLoading) return <LoadingSpinner message="Đang tải danh sách uỷ quyền..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <YStack style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }}>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 26,
                        color: EHR_ON_SURFACE,
                        letterSpacing: -0.4,
                        lineHeight: 30,
                    }}
                >
                    Uỷ quyền toàn bộ
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
                    Cấp cho bác sĩ quyền thay bạn chia sẻ hồ sơ với đồng nghiệp chuyên khoa.
                </Text>
            </YStack>

            <View style={{ paddingHorizontal: 20 }}>
                <View style={{ marginBottom: 12 }}>
                    <ViButton
                        variant="cinnabar"
                        full
                        onPress={() => setGrantOpen(true)}
                        leftIcon={<UserPlus size={16} color="#FAF7F1" />}
                    >
                        Uỷ quyền cho bác sĩ mới
                    </ViButton>
                </View>
                <View
                    style={{
                        marginBottom: 12,
                        paddingVertical: 11,
                        paddingHorizontal: 14,
                        backgroundColor: `${EHR_WARNING}1A`,
                        borderWidth: 0.5,
                        borderColor: `${EHR_WARNING}50`,
                        borderRadius: 12,
                        flexDirection: 'row',
                        gap: 8,
                    }}
                >
                    <Info size={14} color={EHR_WARNING} style={{ marginTop: 2 }} />
                    <Text
                        style={{
                            flex: 1,
                            fontFamily: SANS,
                            fontSize: 11.5,
                            color: EHR_ON_SURFACE,
                            lineHeight: 17,
                        }}
                    >
                        Khi thu hồi, tất cả uỷ quyền con (sub-delegation) + hồ sơ bác sĩ đã chia sẻ
                        dựa vào uỷ quyền này cũng sẽ bị vô hiệu (epoch cascade on-chain).
                    </Text>
                </View>
            </View>

            <FlatList
                data={delegations}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isFetching && !isLoading}
                        onRefresh={() => refetch()}
                        tintColor={EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListEmptyComponent={
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
                            Chưa có uỷ quyền nào
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
                            Bấm "Uỷ quyền cho bác sĩ mới" ở trên để cấp toàn quyền cho bác sĩ đầu tiên.
                        </Text>
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

void EHR_TERTIARY;
void EHR_OUTLINE_VARIANT;
