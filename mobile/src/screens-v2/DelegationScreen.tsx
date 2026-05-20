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
import { Info, QrCode, Trash2, UserPlus, Users, X, Check } from 'lucide-react-native';

import LoadingSpinner from '../components/LoadingSpinner';
import QrAddressScanner from '../components/QrAddressScanner';
import UserChip from '../components/UserChip';
import {
    useGrantAuthority,
    useMyDelegates,
    useRevokeAuthority,
    type DelegationRow,
} from '../hooks/queries/useDelegations';
import ViCard from '../components-v2/ViCard';
import ViButton from '../components-v2/ViButton';
import { ViStatusChip } from '../components-v2/ViChips';
import { useEhrPalette } from '../constants/uiColors';
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

// G.8 — stakes-first DelegationCard per Claude Design viehp-g-pack-screens.html §3.
// Each active delegation is a full-bleed agreement card: status ribbon, identity,
// powers spelled out as labelled bullets, dates, and a SPLIT action row where
// revoke is the same visual weight as extend (not hidden in a menu).
function DelegationCard({
    item,
    onRevoke,
    onExtend,
    revoking,
}: {
    item: DelegationRow;
    onRevoke: (item: DelegationRow) => void;
    onExtend: (item: DelegationRow) => void;
    revoking: boolean;
}) {
    const palette = useEhrPalette();
    const token = statusToken(item);
    const isActive = token === 'active';

    // Days remaining for "Sắp hết" ribbon
    let daysLeft: number | null = null;
    if (item.expiresAt) {
        const ms = new Date(item.expiresAt).getTime() - Date.now();
        if (ms > 0) daysLeft = Math.ceil(ms / (24 * 60 * 60 * 1000));
    }
    const expiringSoon = isActive && daysLeft !== null && daysLeft <= 14;
    const ribbonLabel = expiringSoon
        ? `Sắp hết · ${daysLeft}d`
        : isActive
            ? 'Đang hiệu lực'
            : token === 'expired' ? 'Đã hết hạn' : 'Đã thu hồi';
    const ribbonTint = expiringSoon ? palette.EHR_WARNING : isActive ? palette.EHR_TERTIARY : palette.EHR_OUTLINE;

    return (
        <View
            style={{
                marginBottom: 16,
                backgroundColor: palette.EHR_SURFACE_HIGH,
                borderRadius: 14,
                borderWidth: 0.5,
                borderColor: expiringSoon ? `${palette.EHR_WARNING}60` : palette.EHR_OUTLINE_VARIANT,
                overflow: 'hidden',
            }}
        >
            <View style={{ padding: 18 }}>
                {/* Status ribbon */}
                <View
                    style={{
                        position: 'absolute',
                        right: 14,
                        top: 14,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 4,
                        backgroundColor: `${ribbonTint}22`,
                        borderWidth: 0.5,
                        borderColor: `${ribbonTint}60`,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 9,
                            fontWeight: '700',
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                            color: ribbonTint,
                        }}
                    >
                        {ribbonLabel}
                    </Text>
                </View>

                {/* Identity */}
                <View style={{ paddingRight: 90 }}>
                    <UserChip address={item.delegateeAddress} expanded showAddress={false} />
                </View>

                {/* Powers — labelled bullets */}
                <View
                    style={{
                        marginTop: 16,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        backgroundColor: palette.EHR_SURFACE,
                        borderRadius: 10,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_VARIANT,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 9,
                            color: palette.EHR_TEXT_MUTED,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                            fontWeight: '700',
                            marginBottom: 10,
                        }}
                    >
                        Bác sĩ này có thể
                    </Text>
                    <Power label="Xem mọi hồ sơ" sub="Hồ sơ hiện tại + mới về sau" on />
                    <Power label="Tạo hồ sơ thay bạn" sub="Hồ sơ mới tự cấp cho họ" on />
                    <Power
                        label="Uỷ quyền tiếp cho đồng nghiệp"
                        sub={item.allowSubDelegate ? 'Bạn cho phép' : 'Bạn không cho phép'}
                        on={item.allowSubDelegate}
                    />
                </View>

                {item.scopeNote ? (
                    <Text
                        style={{
                            marginTop: 12,
                            fontFamily: SANS,
                            fontSize: 11.5,
                            color: palette.EHR_TEXT_MUTED,
                            lineHeight: 16,
                            fontStyle: 'italic',
                        }}
                        numberOfLines={3}
                    >
                        Phạm vi: {item.scopeNote}
                    </Text>
                ) : null}

                {/* Dates */}
                <View
                    style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTopWidth: 0.5,
                        borderStyle: 'dashed',
                        borderColor: palette.EHR_OUTLINE_VARIANT,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                    }}
                >
                    <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED }}>
                        Đến hạn{' '}
                        <Text
                            style={{
                                fontFamily: 'monospace',
                                color: expiringSoon ? palette.EHR_WARNING : palette.EHR_ON_SURFACE,
                            }}
                        >
                            {formatExpiry(item.expiresAt)}
                        </Text>
                    </Text>
                </View>
            </View>

            {/* Split action row — revoke same weight as extend */}
            {isActive ? (
                <View
                    style={{
                        flexDirection: 'row',
                        borderTopWidth: 0.5,
                        borderTopColor: palette.EHR_OUTLINE_VARIANT,
                    }}
                >
                    <Pressable
                        onPress={() => onRevoke(item)}
                        disabled={revoking}
                        style={({ pressed }) => ({
                            flex: 1,
                            paddingVertical: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 6,
                            borderRightWidth: 0.5,
                            borderRightColor: palette.EHR_OUTLINE_VARIANT,
                            opacity: pressed ? 0.5 : revoking ? 0.4 : 1,
                        })}
                    >
                        <Trash2 size={14} color={palette.EHR_DANGER} />
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 13,
                                color: palette.EHR_DANGER,
                                fontWeight: '700',
                            }}
                        >
                            {revoking ? 'Đang thu hồi…' : 'Thu hồi'}
                        </Text>
                    </Pressable>
                    <Pressable
                        onPress={() => onExtend(item)}
                        style={({ pressed }) => ({
                            flex: 1,
                            paddingVertical: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: pressed ? 0.5 : 1,
                        })}
                    >
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 13,
                                color: palette.EHR_ON_SURFACE,
                                fontWeight: '600',
                            }}
                        >
                            Gia hạn
                        </Text>
                    </Pressable>
                </View>
            ) : null}
        </View>
    );
}

// Power row: cinnabar-filled checkbox when on, neutral outline when off.
function Power({ label, sub, on }: { label: string; sub: string; on: boolean }) {
    const palette = useEhrPalette();
    return (
        <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 5, alignItems: 'flex-start' }}>
            <View
                style={{
                    marginTop: 2,
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    backgroundColor: on ? palette.EHR_PRIMARY : 'transparent',
                    borderWidth: 0.5,
                    borderColor: on ? palette.EHR_PRIMARY : palette.EHR_OUTLINE,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {on ? <Check size={9} color="#FBF8F1" strokeWidth={3} /> : null}
            </View>
            <View style={{ flex: 1 }}>
                <Text
                    style={{
                        fontFamily: SANS_SEMI,
                        fontSize: 12,
                        color: on ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE,
                        fontWeight: '600',
                    }}
                >
                    {label}
                </Text>
                <Text
                    style={{
                        marginTop: 2,
                        fontFamily: SANS,
                        fontSize: 10.5,
                        color: palette.EHR_TEXT_MUTED,
                    }}
                >
                    {sub}
                </Text>
            </View>
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
    const palette = useEhrPalette();
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
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
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
                                color: palette.EHR_ON_SURFACE,
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
                            <X size={18} color={palette.EHR_TEXT_MUTED} />
                        </Pressable>
                    </XStack>

                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        <FieldLabel>Địa chỉ ví bác sĩ</FieldLabel>
                        <XStack style={{ gap: 8, marginBottom: 6 }}>
                            <TextInput
                                style={{
                                    flex: 1,
                                    borderWidth: 0.5,
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    borderRadius: 12,
                                    paddingVertical: 11,
                                    paddingHorizontal: 14,
                                    color: palette.EHR_ON_SURFACE,
                                    backgroundColor: palette.EHR_SURFACE,
                                    fontFamily: 'monospace',
                                    fontSize: 13,
                                }}
                                placeholder="0x..."
                                placeholderTextColor={palette.EHR_OUTLINE}
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
                                    borderColor: palette.EHR_OUTLINE_SOFT,
                                    borderRadius: 12,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: palette.EHR_SURFACE,
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <QrCode size={18} color={palette.EHR_PRIMARY} />
                            </Pressable>
                        </XStack>
                        {address.length > 0 && !addressValid ? (
                            <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_PRIMARY, marginBottom: 8 }}>
                                Cần là địa chỉ 0x + 40 ký tự hex.
                            </Text>
                        ) : null}

                        <View style={{ height: 14 }} />
                        <FieldLabel>Thời hạn uỷ quyền (ngày)</FieldLabel>
                        <TextInput
                            style={{
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                borderRadius: 12,
                                paddingVertical: 11,
                                paddingHorizontal: 14,
                                color: palette.EHR_ON_SURFACE,
                                backgroundColor: palette.EHR_SURFACE,
                                fontFamily: SANS,
                                fontSize: 14,
                            }}
                            placeholder="30"
                            placeholderTextColor={palette.EHR_OUTLINE}
                            value={days}
                            onChangeText={setDays}
                            keyboardType="number-pad"
                        />
                        <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, marginTop: 4 }}>
                            Tối thiểu 1 ngày, tối đa 1825 (5 năm).
                        </Text>

                        <XStack
                            style={{
                                marginTop: 14,
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                backgroundColor: palette.EHR_SURFACE,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                borderRadius: 12,
                                alignItems: 'center',
                            }}
                        >
                            <YStack style={{ flex: 1, paddingRight: 12 }}>
                                <Text
                                    style={{
                                        fontFamily: SANS_SEMI,
                                        fontSize: 13.5,
                                        color: palette.EHR_ON_SURFACE,
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
                                        color: palette.EHR_TEXT_MUTED,
                                        lineHeight: 16,
                                    }}
                                >
                                    Bác sĩ có thể uỷ quyền tiếp cho đồng nghiệp khác.
                                </Text>
                            </YStack>
                            <Switch
                                value={allowSub}
                                onValueChange={setAllowSub}
                                trackColor={{ false: palette.EHR_OUTLINE_VARIANT, true: palette.EHR_PRIMARY }}
                                thumbColor="#FAF7F1"
                            />
                        </XStack>

                        <View style={{ height: 14 }} />
                        <FieldLabel>Phạm vi lâm sàng (tuỳ chọn)</FieldLabel>
                        <TextInput
                            style={{
                                minHeight: 80,
                                borderWidth: 0.5,
                                borderColor: palette.EHR_OUTLINE_SOFT,
                                borderRadius: 12,
                                paddingVertical: 11,
                                paddingHorizontal: 14,
                                color: palette.EHR_ON_SURFACE,
                                backgroundColor: palette.EHR_SURFACE,
                                fontFamily: SANS,
                                fontSize: 14,
                                textAlignVertical: 'top',
                            }}
                            placeholder="VD: điều trị tiểu đường, ICD-10 E11..."
                            placeholderTextColor={palette.EHR_OUTLINE}
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
                                color: palette.EHR_TEXT_MUTED,
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

// G.9 — Gia hạn stepper bottom sheet. 4 quick-pick options.
function ExtendSheet({
    target,
    onClose,
    onConfirm,
    submitting,
}: {
    target: DelegationRow | null;
    onClose: () => void;
    onConfirm: (additionalDays: number) => void;
    submitting: boolean;
}) {
    const palette = useEhrPalette();
    const [picked, setPicked] = useState<number>(30);

    if (!target) return null;

    const remainingMs = new Date(target.expiresAt).getTime() - Date.now();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    const newTotal = Math.min(1825, remainingDays + picked);
    const newExpiry = new Date(Date.now() + newTotal * 24 * 60 * 60 * 1000);
    const formatExpiryDate = (d: Date) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}·${mm}·${d.getFullYear()}`;
    };

    const OPTIONS = [
        { days: 30, label: '+30 ngày' },
        { days: 90, label: '+90 ngày' },
        { days: 180, label: '+6 tháng' },
        { days: 365, label: '+12 tháng' },
    ];

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <Pressable
                onPress={onClose}
                style={{ flex: 1, backgroundColor: 'rgba(8,8,12,0.7)', justifyContent: 'flex-end' }}
            >
                <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={{
                        backgroundColor: palette.EHR_SURFACE_HIGH,
                        borderTopLeftRadius: 20,
                        borderTopRightRadius: 20,
                        paddingHorizontal: 22,
                        paddingTop: 14,
                        paddingBottom: 28,
                    }}
                >
                    {/* handle */}
                    <View style={{ alignItems: 'center', marginBottom: 14 }}>
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: palette.EHR_OUTLINE }} />
                    </View>

                    <Text
                        style={{
                            fontFamily: SERIF,
                            fontSize: 20,
                            color: palette.EHR_ON_SURFACE,
                            letterSpacing: -0.3,
                            marginBottom: 6,
                        }}
                    >
                        Gia hạn uỷ quyền
                    </Text>
                    <Text
                        style={{
                            fontFamily: SANS,
                            fontSize: 12.5,
                            color: palette.EHR_ON_SURFACE_VARIANT,
                            lineHeight: 18,
                            marginBottom: 14,
                        }}
                    >
                        Chọn khoảng thời gian thêm vào hạn hiện tại. Còn lại {remainingDays} ngày.
                    </Text>

                    {/* Doctor identity */}
                    <View
                        style={{
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            borderWidth: 0.5,
                            borderColor: palette.EHR_OUTLINE_VARIANT,
                            backgroundColor: palette.EHR_SURFACE,
                            marginBottom: 16,
                        }}
                    >
                        <UserChip address={target.delegateeAddress} expanded showAddress={false} interactive={false} />
                    </View>

                    {/* Stepper options */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        {OPTIONS.map((opt) => {
                            const active = picked === opt.days;
                            return (
                                <Pressable
                                    key={opt.days}
                                    onPress={() => setPicked(opt.days)}
                                    style={({ pressed }) => ({
                                        flexBasis: '47%',
                                        flexGrow: 1,
                                        paddingVertical: 12,
                                        borderRadius: 10,
                                        borderWidth: active ? 1.5 : 0.5,
                                        borderColor: active ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_VARIANT,
                                        backgroundColor: active ? `${palette.EHR_PRIMARY}1A` : palette.EHR_SURFACE,
                                        alignItems: 'center',
                                        opacity: pressed ? 0.7 : 1,
                                    })}
                                >
                                    <Text
                                        style={{
                                            fontFamily: SANS_SEMI,
                                            fontSize: 14,
                                            color: active ? palette.EHR_PRIMARY : palette.EHR_ON_SURFACE,
                                            fontWeight: '700',
                                        }}
                                    >
                                        {opt.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    {/* Preview line */}
                    <View
                        style={{
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            borderWidth: 0.5,
                            borderStyle: 'dashed',
                            borderColor: palette.EHR_OUTLINE_VARIANT,
                            backgroundColor: palette.EHR_SURFACE,
                            marginBottom: 18,
                        }}
                    >
                        <Text style={{ fontFamily: SANS, fontSize: 11.5, color: palette.EHR_TEXT_MUTED }}>
                            Hạn mới sẽ là{' '}
                            <Text style={{ fontFamily: 'monospace', color: palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                                {formatExpiryDate(newExpiry)}
                            </Text>{' '}
                            ({newTotal} ngày từ hôm nay)
                            {newTotal === 1825 ? ' · giới hạn tối đa hợp đồng' : ''}
                        </Text>
                    </View>

                    <XStack style={{ gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            <ViButton variant="ghost" full onPress={onClose}>
                                Huỷ
                            </ViButton>
                        </View>
                        <View style={{ flex: 2 }}>
                            <ViButton
                                variant="cinnabar"
                                full
                                loading={submitting}
                                onPress={() => onConfirm(picked)}
                            >
                                {submitting ? 'Đang ký…' : 'Ký & Gia hạn'}
                            </ViButton>
                        </View>
                    </XStack>
                    <Text
                        style={{
                            marginTop: 10,
                            textAlign: 'center',
                            fontFamily: SANS,
                            fontSize: 10.5,
                            color: palette.EHR_TEXT_MUTED,
                            lineHeight: 15,
                            fontStyle: 'italic',
                        }}
                    >
                        Biometric prompt sẽ hiện · gas sponsor (1/100 lượt ký/tháng).
                    </Text>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    const palette = useEhrPalette();
    return (
        <Text
            style={{
                fontFamily: SANS_SEMI,
                fontSize: 11.5,
                color: palette.EHR_TEXT_MUTED,
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
    const palette = useEhrPalette();
    const { data: delegations = [], isLoading, isFetching, refetch } = useMyDelegates();
    const grantMutation = useGrantAuthority();
    const revokeMutation = useRevokeAuthority();
    const [grantOpen, setGrantOpen] = useState(false);
    const [revokingAddr, setRevokingAddr] = useState<string | null>(null);
    const [extendTarget, setExtendTarget] = useState<DelegationRow | null>(null);

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

    const handleExtend = (item: DelegationRow) => {
        // G.9 — opens stepper bottom sheet. Confirming re-issues delegation
        // with extended duration via the same grant flow.
        setExtendTarget(item);
    };

    const handleExtendConfirm = async (additionalDays: number) => {
        if (!extendTarget) return;
        const remainingMs = new Date(extendTarget.expiresAt).getTime() - Date.now();
        const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
        const newDays = Math.min(1825, remainingDays + additionalDays); // clamp to contract MAX
        try {
            await grantMutation.mutateAsync({
                delegateeAddress: extendTarget.delegateeAddress,
                durationDays: newDays,
                allowSubDelegate: extendTarget.allowSubDelegate,
                scopeNote: extendTarget.scopeNote,
            });
            setExtendTarget(null);
            Alert.alert('Đã gia hạn', `Thời hạn mới: ${newDays} ngày kể từ hôm nay.`);
        } catch (err: any) {
            Alert.alert('Gia hạn thất bại', err?.message || 'Không thể gia hạn.');
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

    const activeCount = delegations.filter((d) => statusToken(d) === 'active').length;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['top']}>
            <FlatList
                data={delegations}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isFetching && !isLoading}
                        onRefresh={() => refetch()}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListHeaderComponent={
                    <View style={{ paddingTop: 14 }}>
                        {/* G.8 — stakes-first hero */}
                        <Text
                            style={{
                                fontFamily: SANS_SEMI,
                                fontSize: 10,
                                color: palette.EHR_PRIMARY,
                                letterSpacing: 1.4,
                                textTransform: 'uppercase',
                                fontWeight: '700',
                            }}
                        >
                            Quyền cao nhất bạn có thể cấp
                        </Text>
                        <Text
                            style={{
                                marginTop: 8,
                                fontFamily: SERIF,
                                fontSize: 24,
                                color: palette.EHR_ON_SURFACE,
                                letterSpacing: -0.4,
                                lineHeight: 30,
                            }}
                        >
                            Người được uỷ quyền sẽ xem được{' '}
                            <Text
                                style={{
                                    fontFamily: 'Fraunces_400Regular_Italic',
                                    fontStyle: 'italic',
                                    color: palette.EHR_PRIMARY,
                                }}
                            >
                                tất cả
                            </Text>{' '}
                            hồ sơ của bạn.
                        </Text>
                        <Text
                            style={{
                                marginTop: 12,
                                fontFamily: SANS,
                                fontSize: 13,
                                color: palette.EHR_ON_SURFACE_VARIANT,
                                lineHeight: 20,
                            }}
                        >
                            Khác với cấp quyền từng hồ sơ, uỷ quyền cho phép bác sĩ xem hồ sơ hiện tại và tương lai mà không cần hỏi lại — phù hợp với bác sĩ chăm sóc dài hạn.
                        </Text>

                        {delegations.length > 0 ? (
                            <Text
                                style={{
                                    marginTop: 22,
                                    fontFamily: SANS_SEMI,
                                    fontSize: 10,
                                    color: palette.EHR_TEXT_MUTED,
                                    letterSpacing: 1.2,
                                    textTransform: 'uppercase',
                                    fontWeight: '700',
                                    marginBottom: 12,
                                }}
                            >
                                Đang có hiệu lực · {activeCount}
                            </Text>
                        ) : (
                            <View style={{ height: 22 }} />
                        )}
                    </View>
                }
                ListEmptyComponent={
                    <View style={{ paddingTop: 14, alignItems: 'center' }}>
                        <Users size={32} color={palette.EHR_TEXT_MUTED} />
                        <Text
                            style={{
                                marginTop: 14,
                                fontFamily: SERIF,
                                fontSize: 18,
                                color: palette.EHR_ON_SURFACE,
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
                                color: palette.EHR_TEXT_MUTED,
                                textAlign: 'center',
                                maxWidth: 280,
                                lineHeight: 19,
                            }}
                        >
                            Bấm &quot;Uỷ quyền cho một bác sĩ mới&quot; bên dưới để cấp toàn quyền cho bác sĩ đầu tiên.
                        </Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <DelegationCard
                        item={item}
                        revoking={revokingAddr === item.delegateeAddress}
                        onRevoke={handleRevoke}
                        onExtend={handleExtend}
                    />
                )}
                ListFooterComponent={
                    <View style={{ marginTop: 8 }}>
                        {/* G.8 — bordered dashed CTA (hesitation, not solid) */}
                        <Pressable
                            onPress={() => setGrantOpen(true)}
                            style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                paddingVertical: 14,
                                borderRadius: 12,
                                borderWidth: 1,
                                borderStyle: 'dashed',
                                borderColor: palette.EHR_PRIMARY,
                                backgroundColor: 'transparent',
                                opacity: pressed ? 0.6 : 1,
                            })}
                        >
                            <UserPlus size={16} color={palette.EHR_PRIMARY} />
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 13,
                                    color: palette.EHR_PRIMARY,
                                    fontWeight: '600',
                                }}
                            >
                                + Uỷ quyền cho một bác sĩ mới
                            </Text>
                        </Pressable>
                        <Text
                            style={{
                                marginTop: 10,
                                textAlign: 'center',
                                fontFamily: SANS,
                                fontSize: 10.5,
                                color: palette.EHR_TEXT_MUTED,
                                lineHeight: 16,
                                fontStyle: 'italic',
                            }}
                        >
                            Bạn sẽ được nhắc xác nhận lại ở bước cuối.
                        </Text>

                        {/* Cascade-revoke explainer kept (load-bearing on-chain reality) */}
                        <View
                            style={{
                                marginTop: 22,
                                paddingVertical: 11,
                                paddingHorizontal: 14,
                                backgroundColor: palette.EHR_SURFACE_LOWEST,
                                borderRadius: 10,
                                borderWidth: 0.5,
                                borderStyle: 'dashed',
                                borderColor: palette.EHR_OUTLINE_VARIANT,
                                flexDirection: 'row',
                                gap: 8,
                            }}
                        >
                            <Info size={13} color={palette.EHR_TEXT_MUTED} style={{ marginTop: 2 }} />
                            <Text
                                style={{
                                    flex: 1,
                                    fontFamily: SANS,
                                    fontSize: 11,
                                    color: palette.EHR_TEXT_MUTED,
                                    lineHeight: 16,
                                }}
                            >
                                Khi thu hồi, tất cả uỷ quyền con (sub-delegation) + hồ sơ bác sĩ đã chia sẻ dựa vào uỷ quyền này cũng sẽ bị vô hiệu (epoch cascade on-chain).
                            </Text>
                        </View>
                    </View>
                }
            />

            <GrantAuthorityModal
                visible={grantOpen}
                onClose={() => setGrantOpen(false)}
                onSubmit={handleGrant}
                submitting={grantMutation.isPending}
            />

            <ExtendSheet
                target={extendTarget}
                onClose={() => setExtendTarget(null)}
                onConfirm={handleExtendConfirm}
                submitting={grantMutation.isPending}
            />
        </SafeAreaView>
    );
}

