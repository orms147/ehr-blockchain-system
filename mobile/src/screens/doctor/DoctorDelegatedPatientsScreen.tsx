import React, { useState } from 'react';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ChevronRight,
    FileText,
    Info,
    Send,
    Shield,
    Stethoscope,
    Users,
    X,
} from 'lucide-react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import EmptyState from '../../components/EmptyState';
import LoadingSpinner from '../../components/LoadingSpinner';
import recordService from '../../services/record.service';
import delegationService from '../../services/delegation.service';
import {
    useDelegatedToMe,
    useSubDelegate,
    type DelegationRow,
} from '../../hooks/queries/useDelegations';
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
} from '../../constants/uiColors';

type PatientRecord = {
    id: string;
    cidHash: string;
    ownerAddress: string;
    title: string | null;
    description: string | null;
    recordType: string | null;
    createdAt: string;
};

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const truncateAddr = (addr?: string | null) =>
    addr ? `${addr.substring(0, 8)}...${addr.slice(-6)}` : '???';

const formatDate = (s?: string | null) => {
    if (!s) return '';
    try {
        return new Date(s).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    } catch {
        return s;
    }
};

// ============ RECORD PICKER + SHARE MODAL ============

function ShareRecordModal({
    visible,
    record,
    patientAddress,
    onClose,
    onDone,
}: {
    visible: boolean;
    record: PatientRecord | null;
    patientAddress: string;
    onClose: () => void;
    onDone: () => void;
}) {
    const [newGrantee, setNewGrantee] = useState('');
    const [days, setDays] = useState('30');
    const [includeUpdates, setIncludeUpdates] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const reset = () => {
        setNewGrantee('');
        setDays('30');
        setIncludeUpdates(true);
    };

    const handleSubmit = async () => {
        if (!record) return;
        const grantee = newGrantee.trim().toLowerCase();
        if (!ADDRESS_RE.test(grantee)) {
            Alert.alert('Địa chỉ không hợp lệ', 'Nhập địa chỉ ví bác sĩ 0x...');
            return;
        }
        const d = parseInt(days, 10);
        if (!Number.isFinite(d) || d < 1 || d > 1825) {
            Alert.alert('Thời hạn không hợp lệ', '1 - 1825 ngày.');
            return;
        }
        const expireAtSeconds = Math.floor(Date.now() / 1000) + d * 86400;

        setSubmitting(true);
        try {
            // For records minted via grantUsingDelegation, we don't re-share the
            // off-chain encrypted payload here — the new grantee will receive a
            // separate key-share flow (out of scope for this first cut). The
            // on-chain consent is what this screen establishes.
            const zeroHash = `0x${'0'.repeat(64)}`;
            const result = await delegationService.grantUsingDelegation({
                patientAddress,
                newGrantee: grantee,
                rootCidHash: record.cidHash,
                encKeyHash: zeroHash,
                expireAtSeconds,
                includeUpdates,
                allowDelegate: false,
            });
            Alert.alert(
                'Đã cấp quyền on-chain',
                `Bác sĩ ${truncateAddr(grantee)} đã có consent cho hồ sơ này.\n\nTx: ${result.txHash.slice(0, 14)}...`,
            );
            reset();
            onDone();
        } catch (err: any) {
            Alert.alert('Thất bại', err?.message || 'Không thể mint consent.');
        } finally {
            setSubmitting(false);
        }
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
                            Cấp quyền qua uỷ quyền
                        </Text>
                        <Pressable
                            onPress={() => {
                                reset();
                                onClose();
                            }}
                            style={{ padding: 6 }}
                        >
                            <X size={20} color={EHR_ON_SURFACE_VARIANT} />
                        </Pressable>
                    </XStack>

                    <ScrollView keyboardShouldPersistTaps="handled">
                        {record ? (
                            <View style={styles.recordPreview}>
                                <XStack style={{ alignItems: 'center', gap: 8 }}>
                                    <FileText size={16} color={EHR_PRIMARY} />
                                    <Text fontSize="$3" fontWeight="600" color={EHR_ON_SURFACE}>
                                        {record.title || 'Hồ sơ y tế'}
                                    </Text>
                                </XStack>
                                <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop={4}>
                                    {record.recordType || 'medical_record'}
                                </Text>
                                <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop={2}>
                                    cidHash: {record.cidHash.slice(0, 16)}...
                                </Text>
                            </View>
                        ) : null}

                        <Text style={[styles.label, { marginTop: 16 }]}>Địa chỉ ví bác sĩ nhận</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0x..."
                            placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                            value={newGrantee}
                            onChangeText={setNewGrantee}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <Text style={[styles.label, { marginTop: 16 }]}>Thời hạn (ngày)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="30"
                            placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                            value={days}
                            onChangeText={setDays}
                            keyboardType="number-pad"
                        />
                        <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop={4}>
                            Sẽ bị cắt về thời hạn uỷ quyền gốc nếu lớn hơn.
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
                                    Bao gồm các bản cập nhật
                                </Text>
                                <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop={2}>
                                    Truy cập áp dụng cho toàn bộ chuỗi hồ sơ cập nhật của cid này.
                                </Text>
                            </YStack>
                            <Switch
                                value={includeUpdates}
                                onValueChange={setIncludeUpdates}
                                trackColor={{ false: EHR_OUTLINE_VARIANT, true: EHR_PRIMARY_CONTAINER }}
                                thumbColor={includeUpdates ? EHR_PRIMARY : EHR_SURFACE_LOWEST}
                            />
                        </XStack>

                        <View style={styles.warnBox}>
                            <Info size={14} color={EHR_SECONDARY} style={{ marginRight: 6 }} />
                            <Text fontSize="$1" color={EHR_SECONDARY} flex={1} lineHeight={16}>
                                Chỉ cấp consent on-chain. Bác sĩ nhận sẽ cần lấy khoá giải mã qua
                                flow chia sẻ khoá off-chain riêng.
                            </Text>
                        </View>

                        <Pressable
                            onPress={handleSubmit}
                            disabled={submitting}
                            style={{
                                backgroundColor: submitting ? EHR_SURFACE_LOW : EHR_PRIMARY,
                                borderRadius: 14,
                                paddingVertical: 14,
                                alignItems: 'center',
                                marginTop: 20,
                                marginBottom: 8,
                            }}
                        >
                            <Text fontSize="$4" fontWeight="700" color={EHR_SURFACE_LOWEST}>
                                {submitting ? 'Đang xử lý...' : 'Ký & Cấp on-chain'}
                            </Text>
                        </Pressable>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ============ PATIENT RECORDS DRAWER ============

function PatientRecordsDrawer({
    patient,
    onClose,
}: {
    patient: DelegationRow | null;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [shareTarget, setShareTarget] = useState<PatientRecord | null>(null);
    const [subOpen, setSubOpen] = useState(false);

    const enabled = !!patient;
    const { data, isLoading, refetch, isFetching } = useQuery<{
        delegation: DelegationRow;
        records: PatientRecord[];
    }>({
        queryKey: ['delegatedPatientRecords', patient?.patientAddress],
        queryFn: () => recordService.getDelegatedPatientRecords(patient!.patientAddress),
        enabled,
    });

    const records = data?.records || [];

    const renderRecord = ({ item }: { item: PatientRecord }) => (
        <Pressable onPress={() => setShareTarget(item)} style={styles.recordCard}>
            <XStack style={{ alignItems: 'center', gap: 10 }}>
                <FileText size={20} color={EHR_PRIMARY} />
                <YStack style={{ flex: 1 }}>
                    <Text fontSize="$3" fontWeight="600" color={EHR_ON_SURFACE} numberOfLines={1}>
                        {item.title || 'Hồ sơ y tế'}
                    </Text>
                    <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop={2}>
                        {item.recordType || 'medical_record'} • {formatDate(item.createdAt)}
                    </Text>
                </YStack>
                <Send size={16} color={EHR_ON_SURFACE_VARIANT} />
            </XStack>
        </Pressable>
    );

    return (
        <Modal visible={enabled} animationType="slide" onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
                <XStack
                    style={{
                        padding: 16,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottomWidth: 1,
                        borderBottomColor: EHR_OUTLINE_VARIANT,
                    }}
                >
                    <YStack style={{ flex: 1 }}>
                        <Text fontSize="$5" fontWeight="700" color={EHR_ON_SURFACE}>
                            {patient ? truncateAddr(patient.patientAddress) : ''}
                        </Text>
                        <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT}>
                            Hết hạn: {patient ? formatDate(patient.expiresAt) : ''}
                            {patient?.allowSubDelegate ? ' • cho phép uỷ quyền tiếp' : ''}
                        </Text>
                    </YStack>
                    <Pressable onPress={onClose} style={{ padding: 6 }}>
                        <X size={22} color={EHR_ON_SURFACE_VARIANT} />
                    </Pressable>
                </XStack>

                {patient?.allowSubDelegate ? (
                    <Pressable
                        onPress={() => setSubOpen(true)}
                        style={{
                            margin: 16,
                            marginBottom: 0,
                            padding: 14,
                            backgroundColor: EHR_SECONDARY_CONTAINER,
                            borderRadius: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Users size={16} color={EHR_SECONDARY} style={{ marginRight: 8 }} />
                        <Text fontSize="$3" fontWeight="700" color={EHR_SECONDARY}>
                            Uỷ quyền tiếp cho bác sĩ khác
                        </Text>
                    </Pressable>
                ) : null}

                {isLoading ? (
                    <LoadingSpinner message="Đang tải hồ sơ bệnh nhân..." />
                ) : (
                    <FlatList
                        data={records}
                        keyExtractor={(r) => r.id}
                        contentContainerStyle={{ padding: 16 }}
                        renderItem={renderRecord}
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
                                    icon={FileText}
                                    title="Chưa có hồ sơ"
                                    description="Bệnh nhân này chưa có hồ sơ y tế nào."
                                />
                            </View>
                        }
                    />
                )}

                <ShareRecordModal
                    visible={!!shareTarget}
                    record={shareTarget}
                    patientAddress={patient?.patientAddress || ''}
                    onClose={() => setShareTarget(null)}
                    onDone={() => {
                        setShareTarget(null);
                        queryClient.invalidateQueries({ queryKey: ['delegatedPatientRecords'] });
                    }}
                />

                {patient ? (
                    <SubDelegateModal
                        visible={subOpen}
                        patientAddress={patient.patientAddress}
                        onClose={() => setSubOpen(false)}
                    />
                ) : null}
            </SafeAreaView>
        </Modal>
    );
}

// ============ SUB-DELEGATE MODAL ============

function SubDelegateModal({
    visible,
    patientAddress,
    onClose,
}: {
    visible: boolean;
    patientAddress: string;
    onClose: () => void;
}) {
    const subDelegateMutation = useSubDelegate();
    const [subDelegatee, setSubDelegatee] = useState('');
    const [days, setDays] = useState('30');
    const [allowFurther, setAllowFurther] = useState(false);

    const reset = () => {
        setSubDelegatee('');
        setDays('30');
        setAllowFurther(false);
    };

    const handleSubmit = async () => {
        const addr = subDelegatee.trim().toLowerCase();
        if (!ADDRESS_RE.test(addr)) {
            Alert.alert('Địa chỉ không hợp lệ', 'Nhập địa chỉ ví bác sĩ 0x...');
            return;
        }
        const d = parseInt(days, 10);
        if (!Number.isFinite(d) || d < 1 || d > 1825) {
            Alert.alert('Thời hạn không hợp lệ', '1 - 1825 ngày.');
            return;
        }
        try {
            const result = await subDelegateMutation.mutateAsync({
                patientAddress,
                subDelegatee: addr,
                durationDays: d,
                allowFurther,
            });
            Alert.alert(
                'Đã uỷ quyền tiếp',
                `Bác sĩ ${truncateAddr(addr)} nhận được uỷ quyền tiếp.\n\nTx: ${result.txHash.slice(0, 14)}...`,
            );
            reset();
            onClose();
        } catch (err: any) {
            Alert.alert('Thất bại', err?.message || 'Không thể uỷ quyền tiếp.');
        }
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
                            Uỷ quyền tiếp
                        </Text>
                        <Pressable
                            onPress={() => {
                                reset();
                                onClose();
                            }}
                            style={{ padding: 6 }}
                        >
                            <X size={20} color={EHR_ON_SURFACE_VARIANT} />
                        </Pressable>
                    </XStack>

                    <ScrollView keyboardShouldPersistTaps="handled">
                        <Text style={styles.label}>Địa chỉ ví bác sĩ nhận</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="0x..."
                            placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                            value={subDelegatee}
                            onChangeText={setSubDelegatee}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />

                        <Text style={[styles.label, { marginTop: 16 }]}>Thời hạn (ngày)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="30"
                            placeholderTextColor={EHR_ON_SURFACE_VARIANT}
                            value={days}
                            onChangeText={setDays}
                            keyboardType="number-pad"
                        />
                        <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop={4}>
                            Sẽ bị cắt về thời hạn uỷ quyền gốc của bạn nếu lớn hơn.
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
                                    Cho phép uỷ quyền tiếp tầng 3
                                </Text>
                                <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop={2}>
                                    Bác sĩ nhận có thể tạo uỷ quyền tiếp xuống dưới.
                                </Text>
                            </YStack>
                            <Switch
                                value={allowFurther}
                                onValueChange={setAllowFurther}
                                trackColor={{ false: EHR_OUTLINE_VARIANT, true: EHR_PRIMARY_CONTAINER }}
                                thumbColor={allowFurther ? EHR_PRIMARY : EHR_SURFACE_LOWEST}
                            />
                        </XStack>

                        <Pressable
                            onPress={handleSubmit}
                            disabled={subDelegateMutation.isPending}
                            style={{
                                backgroundColor: subDelegateMutation.isPending ? EHR_SURFACE_LOW : EHR_PRIMARY,
                                borderRadius: 14,
                                paddingVertical: 14,
                                alignItems: 'center',
                                marginTop: 20,
                                marginBottom: 20,
                            }}
                        >
                            <Text fontSize="$4" fontWeight="700" color={EHR_SURFACE_LOWEST}>
                                {subDelegateMutation.isPending ? 'Đang xử lý...' : 'Ký & Uỷ quyền tiếp'}
                            </Text>
                        </Pressable>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

// ============ MAIN SCREEN ============

export default function DoctorDelegatedPatientsScreen() {
    const { data: delegations = [], isLoading, isFetching, refetch } = useDelegatedToMe();
    const [selected, setSelected] = useState<DelegationRow | null>(null);

    const renderItem = ({ item }: { item: DelegationRow }) => {
        const isExpired = item.expiresAt && new Date(item.expiresAt) < new Date();
        return (
            <Pressable
                onPress={() => !isExpired && setSelected(item)}
                disabled={!!isExpired}
                style={{
                    backgroundColor: EHR_SURFACE_LOWEST,
                    borderColor: EHR_OUTLINE_VARIANT,
                    borderWidth: 1,
                    borderRadius: 20,
                    padding: 16,
                    marginBottom: 12,
                    opacity: isExpired ? 0.6 : 1,
                }}
            >
                <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <YStack style={{ flex: 1, paddingRight: 12 }}>
                        <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                            <Stethoscope size={14} color={EHR_PRIMARY} style={{ marginRight: 6 }} />
                            <Text fontSize="$4" fontWeight="700" color={EHR_ON_SURFACE}>
                                {truncateAddr(item.patientAddress)}
                            </Text>
                        </XStack>
                        <Text fontSize="$2" color={EHR_ON_SURFACE_VARIANT}>
                            {item.chainDepth === 1
                                ? 'Uỷ quyền trực tiếp từ bệnh nhân'
                                : `Chuỗi uỷ quyền cấp ${item.chainDepth}`}
                            {item.allowSubDelegate ? ' • được phép uỷ quyền tiếp' : ''}
                        </Text>
                        {item.parentDelegator ? (
                            <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop="$1">
                                Từ bác sĩ: {truncateAddr(item.parentDelegator)}
                            </Text>
                        ) : null}
                        <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop="$1">
                            Hết hạn: {formatDate(item.expiresAt)}
                        </Text>
                        {item.scopeNote ? (
                            <Text fontSize="$1" color={EHR_ON_SURFACE_VARIANT} marginTop="$1" numberOfLines={2}>
                                Phạm vi: {item.scopeNote}
                            </Text>
                        ) : null}
                    </YStack>

                    <View
                        style={{
                            backgroundColor: isExpired ? EHR_SECONDARY_CONTAINER : EHR_PRIMARY_FIXED,
                            borderRadius: 10,
                            paddingVertical: 4,
                            paddingHorizontal: 10,
                        }}
                    >
                        <Text
                            fontSize="$1"
                            fontWeight="700"
                            color={isExpired ? EHR_SECONDARY : EHR_PRIMARY}
                        >
                            {isExpired ? 'HẾT HẠN' : 'HOẠT ĐỘNG'}
                        </Text>
                    </View>
                </XStack>
                {!isExpired ? (
                    <XStack style={{ alignItems: 'center', marginTop: 10, justifyContent: 'flex-end' }}>
                        <Text fontSize="$2" fontWeight="600" color={EHR_PRIMARY}>
                            Xem hồ sơ
                        </Text>
                        <ChevronRight size={16} color={EHR_PRIMARY} />
                    </XStack>
                ) : null}
            </Pressable>
        );
    };

    if (isLoading) {
        return <LoadingSpinner message="Đang tải danh sách bệnh nhân..." />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['top']}>
            <YStack style={{ padding: 20, paddingBottom: 12 }}>
                <Text fontSize={26} fontWeight="800" color={EHR_ON_SURFACE} letterSpacing={-0.5}>
                    Bệnh nhân uỷ quyền
                </Text>
                <Text fontSize="$3" color={EHR_ON_SURFACE_VARIANT} marginTop="$1">
                    Danh sách bệnh nhân đã cấp cho bạn quyền chia sẻ hồ sơ thay họ.
                </Text>
            </YStack>

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
                <Shield size={16} color={EHR_SECONDARY} style={{ marginRight: 8, marginTop: 2 }} />
                <Text fontSize="$2" color={EHR_SECONDARY} flex={1} lineHeight={18}>
                    Tất cả thao tác sẽ được kiểm tra epoch on-chain mỗi khi truy cập. Nếu bệnh nhân
                    hoặc bác sĩ cấp trên thu hồi, các consent bạn đã cấp sẽ bị vô hiệu tự động.
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
                            title="Chưa có uỷ quyền"
                            description="Bạn chưa nhận được uỷ quyền từ bệnh nhân nào."
                        />
                    </View>
                }
                renderItem={renderItem}
            />

            <PatientRecordsDrawer patient={selected} onClose={() => setSelected(null)} />
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
        maxHeight: '92%',
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
    recordPreview: {
        backgroundColor: EHR_SURFACE_LOW,
        borderRadius: 12,
        padding: 12,
    },
    recordCard: {
        backgroundColor: EHR_SURFACE_LOWEST,
        borderColor: EHR_OUTLINE_VARIANT,
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
    },
    warnBox: {
        marginTop: 14,
        padding: 10,
        backgroundColor: EHR_SECONDARY_CONTAINER,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
});
