// MinistryVerifyDoctorScreen — Wave E per viehp-ministry-org-actions §1.2.
//
// Bộ Y tế xác minh trực tiếp bác sĩ độc lập (không thuộc bệnh viện).
// Flow:
//   1. List doctors NOT in any OrganizationMember (backend filters)
//   2. 3 filter chips: Chờ xác minh / Đã xác minh / Đã thu hồi
//   3. IndependentDoctorRow per doctor (name + specialty + GPHN mono +
//      status pill + mono address "không thuộc cơ sở")
//   4. Pending row: 2 buttons — "Xác minh" (ink) + "Xem giấy phép" (ghost)
//   5. Tap "Xác minh" → confirm Alert → biometric → writeContract
//      verifyDoctorByMinistry(doctor, credential) → mirror backend → refresh

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { keccak256, parseGwei, toBytes } from 'viem';

import LoadingSpinner from '../../components/LoadingSpinner';
import orgService from '../../services/org.service';
import walletActionService from '../../services/walletAction.service';
import { gateOrThrow } from '../../utils/biometricGate';
import useAuthStore from '../../store/authStore';
import { useEhrPalette } from '../../constants/uiColors';
import { ACCESS_CONTROL_ABI } from '../../abi/contractABI';

const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

const ACCESS_CONTROL_ADDRESS = process.env.EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS as `0x${string}`;

type IndependentDoctor = {
    walletAddress: string;
    fullName?: string | null;
    specialty?: string | null;
    licenseNumber?: string | null;
    verifiedAt?: string | null;
    verificationState?: 'pending' | 'verified' | 'rejected' | 'revoked';
};

type FilterKey = 'pending' | 'verified' | 'revoked';

const truncate = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '???');

export default function MinistryVerifyDoctorScreen() {
    const palette = useEhrPalette();
    const { token } = useAuthStore();

    const [doctors, setDoctors] = useState<IndependentDoctor[]>([]);
    const [counts, setCounts] = useState<{ pending: number; verified: number; revoked: number }>({ pending: 0, verified: 0, revoked: 0 });
    const [activeFilter, setActiveFilter] = useState<FilterKey>('pending');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [verifyingAddr, setVerifyingAddr] = useState<string | null>(null);

    const fetchData = useCallback(async (status: FilterKey = activeFilter) => {
        try {
            const res: any = await (orgService as any).getIndependentDoctors(status);
            setDoctors(Array.isArray(res?.doctors) ? res.doctors : []);
            if (res?.counts) setCounts(res.counts);
        } catch (err) {
            console.error('Failed to fetch independent doctors:', err);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [activeFilter]);

    useEffect(() => {
        if (token) fetchData(activeFilter);
    }, [token, activeFilter, fetchData]);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchData(activeFilter);
    }, [fetchData, activeFilter]);

    const handleVerify = useCallback(async (doctor: IndependentDoctor) => {
        if (!ACCESS_CONTROL_ADDRESS) {
            Alert.alert('Thiếu cấu hình', 'EXPO_PUBLIC_ACCESS_CONTROL_ADDRESS chưa được đặt.');
            return;
        }
        const doctorAddr = doctor.walletAddress.toLowerCase();
        // Plaintext stays off-chain (mirror → Postgres). On-chain credential is a
        // keccak256 hash so no licence PII lands on the public ledger (NĐ 356/2025 Đ11).
        const credential = doctor.licenseNumber || 'VERIFIED_BY_MINISTRY';
        const credentialHash = keccak256(toBytes(credential));

        const confirmed = await new Promise<boolean>((resolve) => {
            Alert.alert(
                'Xác minh bác sĩ',
                `${doctor.fullName || truncate(doctorAddr)}\n${doctor.specialty || 'Chưa rõ chuyên khoa'} · ${doctor.licenseNumber || 'không có GPHN'}\n\nBạn xác nhận đã đối chiếu giấy phép và đồng ý xác minh.`,
                [
                    { text: 'Huỷ', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Xác minh', onPress: () => resolve(true) },
                ],
            );
        });
        if (!confirmed) return;

        setVerifyingAddr(doctorAddr);
        try {
            const { walletClient, account } = await walletActionService.getWalletContext();
            await gateOrThrow('Bộ Y tế xác minh trực tiếp bác sĩ');

            const txHash = await walletClient.writeContract({
                account,
                address: ACCESS_CONTROL_ADDRESS,
                abi: ACCESS_CONTROL_ABI,
                functionName: 'verifyDoctorByMinistry',
                args: [doctorAddr as `0x${string}`, credentialHash],
                gas: BigInt(300000),
                maxFeePerGas: parseGwei('1.0'),
                maxPriorityFeePerGas: parseGwei('0.1'),
            });

            try {
                await (orgService as any).mirrorVerifyDoctor(doctorAddr, txHash, credential);
            } catch (mirrorErr) {
                console.warn('Verify mirror failed (non-fatal):', mirrorErr);
            }

            Alert.alert(
                'Đã xác minh',
                `${doctor.fullName || truncate(doctorAddr)} đã được xác minh. Bác sĩ có thể bắt đầu yêu cầu truy cập hồ sơ bệnh nhân.`,
            );
            handleRefresh();
        } catch (error: any) {
            const msg = String(error?.message || '');
            if (msg.includes('NotMinistry')) {
                Alert.alert('Không có quyền', 'Ví này không phải Bộ Y tế.');
            } else if (msg.includes('insufficient funds')) {
                Alert.alert('Số dư không đủ', 'Ví Bộ Y tế không đủ để trả phí.');
            } else {
                Alert.alert('Lỗi', msg || 'Không thể xác minh bác sĩ.');
            }
        } finally {
            setVerifyingAddr(null);
        }
    }, [handleRefresh]);

    if (isLoading) return <LoadingSpinner message="Đang tải danh sách bác sĩ..." />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left']}>
            {/* PageHeader */}
            <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 14 }}>
                <Text
                    style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: palette.EHR_TEXT_MUTED,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        fontWeight: '700',
                        marginBottom: 8,
                    }}
                >
                    verifyDoctorByMinistry(doctor, credential)
                </Text>
                <Text
                    style={{
                        fontFamily: SANS_SEMI,
                        fontSize: 22,
                        fontWeight: '700',
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.2,
                        lineHeight: 26,
                    }}
                >
                    Xác minh bác sĩ độc lập
                </Text>
                <Text
                    style={{
                        marginTop: 6,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        lineHeight: 19,
                        maxWidth: 320,
                    }}
                >
                    Hành nghề tư nhân, không thuộc bệnh viện nào. Bộ Y tế xác minh trực tiếp dựa trên giấy phép.
                </Text>
            </View>

            {/* Filter chips */}
            <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 22, paddingBottom: 14 }}>
                {([
                    ['pending', 'Chờ xác minh', counts.pending],
                    ['verified', 'Đã xác minh', counts.verified],
                    ['revoked', 'Đã thu hồi', counts.revoked],
                ] as const).map(([k, label, count]) => {
                    const active = activeFilter === k;
                    return (
                        <Pressable
                            key={k}
                            onPress={() => setActiveFilter(k as FilterKey)}
                            style={({ pressed }) => ({
                                paddingHorizontal: 12,
                                paddingVertical: 7,
                                borderRadius: 999,
                                borderWidth: 0.5,
                                borderColor: active ? palette.EHR_ON_SURFACE : palette.EHR_OUTLINE_SOFT,
                                backgroundColor: active ? palette.EHR_ON_SURFACE : 'transparent',
                                opacity: pressed ? 0.7 : 1,
                            })}
                        >
                            <Text
                                style={{
                                    fontFamily: SANS_SEMI,
                                    fontSize: 12,
                                    fontWeight: '600',
                                    color: active ? palette.EHR_SURFACE : palette.EHR_ON_SURFACE,
                                }}
                            >
                                {label} · {count}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <FlatList
                data={doctors}
                keyExtractor={(d, i) => d.walletAddress || String(i)}
                renderItem={({ item }) => (
                    <IndependentDoctorRow
                        doctor={item}
                        onVerify={() => handleVerify(item)}
                        isVerifying={verifyingAddr === item.walletAddress.toLowerCase()}
                    />
                )}
                contentContainerStyle={{ paddingBottom: 32 }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={palette.EHR_ON_SURFACE_VARIANT}
                    />
                }
                ListEmptyComponent={
                    <View style={{ paddingTop: 30, paddingHorizontal: 22, alignItems: 'center' }}>
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_TEXT_MUTED, textAlign: 'center', fontStyle: 'italic' }}>
                            {activeFilter === 'pending'
                                ? 'Không có bác sĩ nào đang chờ xác minh.'
                                : activeFilter === 'verified'
                                    ? 'Chưa có bác sĩ độc lập nào được xác minh.'
                                    : 'Không có bác sĩ nào đã thu hồi.'}
                        </Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

function IndependentDoctorRow({
    doctor,
    onVerify,
    isVerifying,
}: {
    doctor: IndependentDoctor;
    onVerify: () => void;
    isVerifying: boolean;
}) {
    const palette = useEhrPalette();
    const state = doctor.verificationState || 'pending';
    const isVerified = state === 'verified';

    const pillTone = isVerified ? palette.EHR_TERTIARY : palette.EHR_WARNING;
    const pillLabel = isVerified ? 'Đã xác minh' : 'Chờ';

    return (
        <View
            style={{
                paddingVertical: 16,
                paddingHorizontal: 22,
                borderTopWidth: 0.5,
                borderTopColor: palette.EHR_OUTLINE_SOFT,
            }}
        >
            <XStack style={{ alignItems: 'baseline', gap: 10 }}>
                <YStack style={{ flex: 1 }}>
                    <Text
                        style={{
                            fontFamily: SANS_SEMI,
                            fontSize: 15,
                            color: palette.EHR_ON_SURFACE,
                            fontWeight: '700',
                            letterSpacing: -0.1,
                        }}
                    >
                        {doctor.fullName || `Bác sĩ ${truncate(doctor.walletAddress)}`}
                    </Text>
                    <Text style={{ marginTop: 3, fontFamily: SANS, fontSize: 12.5, color: palette.EHR_ON_SURFACE_VARIANT }}>
                        {doctor.specialty || 'Chưa rõ chuyên khoa'}
                        {doctor.licenseNumber ? (
                            <>
                                {' · '}
                                <Text style={{ fontFamily: MONO, fontSize: 11.5, color: palette.EHR_TEXT_MUTED }}>
                                    {doctor.licenseNumber}
                                </Text>
                            </>
                        ) : null}
                    </Text>
                </YStack>
                <View
                    style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 4,
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_SOFT,
                    }}
                >
                    <Text
                        style={{
                            fontFamily: MONO,
                            fontSize: 9.5,
                            color: pillTone,
                            fontWeight: '700',
                            letterSpacing: 0.8,
                            textTransform: 'uppercase',
                        }}
                    >
                        {pillLabel}
                    </Text>
                </View>
            </XStack>

            {/* Mono address line */}
            <Text style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.2 }}>
                {truncate(doctor.walletAddress)} · không thuộc cơ sở
            </Text>

            {/* Action buttons — pending only */}
            {!isVerified ? (
                <XStack style={{ marginTop: 12, gap: 8 }}>
                    <Pressable
                        onPress={onVerify}
                        disabled={isVerifying}
                        style={({ pressed }) => ({
                            paddingVertical: 9,
                            paddingHorizontal: 14,
                            borderRadius: 8,
                            backgroundColor: palette.EHR_ON_SURFACE,
                            opacity: isVerifying ? 0.5 : pressed ? 0.85 : 1,
                        })}
                    >
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 13, color: palette.EHR_SURFACE, fontWeight: '700', letterSpacing: 0.1 }}>
                            {isVerifying ? 'Đang ký…' : 'Xác minh'}
                        </Text>
                    </Pressable>
                    {/* "Xem giấy phép" deferred — needs IPFS upload flow first */}
                </XStack>
            ) : doctor.verifiedAt ? (
                <Text style={{ marginTop: 8, fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, letterSpacing: 0.3 }}>
                    Xác minh từ {new Date(doctor.verifiedAt).toLocaleDateString('vi-VN')}
                </Text>
            ) : null}
        </View>
    );
}
