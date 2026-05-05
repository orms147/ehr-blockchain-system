// EmergencyLookupScreen — doctor in ER scans/types patient's CCCD digits,
// app hashes locally and resolves to wallet address + Trusted Contact list.
// The contact (e.g. spouse) is the one who actually authorizes record access
// from their own wallet via per-record-delegate flow. This screen does NOT
// trigger any on-chain action — it's a directory lookup + tel: links.

import React, { useState } from 'react';
import { Alert, Linking, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { keccak256, toBytes } from 'viem';
import { YStack, XStack, Text, View, Button } from 'tamagui';
import { Search, Phone, Heart, AlertTriangle, Droplet, ShieldAlert, Info } from 'lucide-react-native';

import trustedContactService from '../../services/trustedContact.service';
import {
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_OUTLINE_VARIANT,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_ON_PRIMARY,
    EHR_ERROR,
    EHR_ERROR_CONTAINER,
    EHR_TERTIARY,
    EHR_TERTIARY_FIXED,
} from '../../constants/uiColors';

type PatientInfo = {
    walletAddress: string;
    fullName?: string | null;
    gender?: string | null;
    bloodType?: string | null;
    allergies?: string | null;
    avatarUrl?: string | null;
};

type Contact = {
    contactAddress: string;
    label?: string | null;
    fullName?: string | null;
    phone?: string | null;
};

const truncate = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '');

export default function EmergencyLookupScreen() {
    const [cccdInput, setCccdInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [patient, setPatient] = useState<PatientInfo | null>(null);
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleLookup = async () => {
        const raw = cccdInput.trim();
        if (!/^\d{9,12}$/.test(raw)) {
            Alert.alert('CCCD không hợp lệ', 'Vui lòng nhập 9-12 chữ số.');
            return;
        }
        setError(null);
        setPatient(null);
        setContacts([]);

        try {
            setLoading(true);
            const cccdHash = keccak256(toBytes(raw));
            const found = await trustedContactService.lookupByCccd(cccdHash);
            setPatient(found);
            try {
                const list = await trustedContactService.getContactsForPatient(found.walletAddress);
                setContacts(Array.isArray(list) ? list : []);
            } catch {
                setContacts([]);
            }
        } catch (err: any) {
            const code = err?.data?.code;
            if (code === 'PATIENT_NOT_FOUND') {
                setError('Không tìm thấy bệnh nhân với CCCD này. Bệnh nhân có thể chưa đăng ký Mã định danh khẩn cấp.');
            } else if (code === 'LOOKUP_RATE_LIMITED') {
                setError(err?.data?.error || 'Bạn đã tra cứu quá nhiều lần. Vui lòng thử lại sau.');
            } else {
                setError(err?.data?.error || err?.message || 'Tra cứu thất bại.');
            }
        } finally {
            setLoading(false);
        }
    };

    const callContact = (phone?: string | null) => {
        if (!phone) {
            Alert.alert('Người thân chưa cập nhật số điện thoại trong app.');
            return;
        }
        Linking.openURL(`tel:${phone}`).catch(() =>
            Alert.alert('Không mở được trình quay số.', phone)
        );
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
                <YStack style={{ marginBottom: 12 }}>
                    <Text fontSize="$7" fontWeight="800" color="$color12">Tra cứu cấp cứu</Text>
                    <Text fontSize="$3" color="$color10" style={{ marginTop: 4, lineHeight: 20 }}>
                        Nhập CCCD/CMND của bệnh nhân để tìm thông tin cấp cứu và liên hệ Người thân tin cậy.
                    </Text>
                </YStack>

                <View style={{
                    backgroundColor: EHR_ERROR_CONTAINER,
                    borderColor: EHR_ERROR,
                    borderWidth: 1,
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 16,
                }}>
                    <XStack style={{ alignItems: 'flex-start' }}>
                        <ShieldAlert size={16} color={EHR_ERROR} />
                        <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 18, color: EHR_ERROR }}>
                            Mọi tra cứu được ghi log audit. Chỉ sử dụng trong trường hợp cấp cứu thực tế.
                        </Text>
                    </XStack>
                </View>

                <Text style={{ color: EHR_ON_SURFACE_VARIANT, fontSize: 12, marginBottom: 4 }}>Số CCCD/CMND</Text>
                <XStack style={{ alignItems: 'center', marginBottom: 16 }}>
                    <TextInput
                        value={cccdInput}
                        onChangeText={setCccdInput}
                        placeholder="012345678901"
                        keyboardType="number-pad"
                        maxLength={12}
                        style={{
                            flex: 1,
                            borderWidth: 1,
                            borderColor: EHR_OUTLINE_VARIANT,
                            borderRadius: 10,
                            padding: 12,
                            color: EHR_ON_SURFACE,
                            backgroundColor: EHR_SURFACE_LOW,
                        }}
                    />
                    <Button
                        size="$3"
                        marginLeft={8}
                        icon={<Search size={16} color={EHR_ON_PRIMARY} />}
                        backgroundColor={EHR_PRIMARY}
                        color={EHR_ON_PRIMARY}
                        onPress={handleLookup}
                        disabled={loading}
                    >
                        <Text color={EHR_ON_PRIMARY} fontWeight="700">{loading ? '...' : 'Tra'}</Text>
                    </Button>
                </XStack>

                {error ? (
                    <View style={{ backgroundColor: EHR_ERROR_CONTAINER, padding: 12, borderRadius: 10, marginBottom: 12 }}>
                        <Text style={{ color: EHR_ERROR }}>{error}</Text>
                    </View>
                ) : null}

                {patient ? (
                    <>
                        <View style={{
                            backgroundColor: EHR_SURFACE_LOW,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: EHR_OUTLINE_VARIANT,
                            padding: 16,
                            marginBottom: 16,
                        }}>
                            <Text fontSize="$5" fontWeight="800" color="$color12">{patient.fullName || '(Không có tên)'}</Text>
                            <Text style={{ color: EHR_ON_SURFACE_VARIANT, fontSize: 12, marginTop: 4 }}>
                                {patient.walletAddress}
                            </Text>

                            <XStack style={{ gap: 12, marginTop: 12 }}>
                                {patient.bloodType ? (
                                    <View style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        backgroundColor: EHR_ERROR_CONTAINER,
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        borderRadius: 999,
                                    }}>
                                        <Droplet size={14} color={EHR_ERROR} />
                                        <Text style={{ color: EHR_ERROR, fontSize: 12, fontWeight: '700', marginLeft: 4 }}>
                                            {patient.bloodType}
                                        </Text>
                                    </View>
                                ) : null}
                                {patient.gender ? (
                                    <View style={{
                                        backgroundColor: EHR_TERTIARY_FIXED,
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        borderRadius: 999,
                                    }}>
                                        <Text style={{ color: EHR_TERTIARY, fontSize: 12, fontWeight: '700' }}>
                                            {patient.gender}
                                        </Text>
                                    </View>
                                ) : null}
                            </XStack>

                            {patient.allergies ? (
                                <View style={{
                                    marginTop: 12,
                                    padding: 10,
                                    borderRadius: 10,
                                    backgroundColor: EHR_ERROR_CONTAINER,
                                }}>
                                    <XStack style={{ alignItems: 'flex-start' }}>
                                        <AlertTriangle size={14} color={EHR_ERROR} />
                                        <YStack style={{ flex: 1, marginLeft: 6 }}>
                                            <Text style={{ color: EHR_ERROR, fontWeight: '800', fontSize: 12 }}>
                                                DỊ ỨNG
                                            </Text>
                                            <Text style={{ color: EHR_ERROR, fontSize: 13, marginTop: 2 }}>
                                                {patient.allergies}
                                            </Text>
                                        </YStack>
                                    </XStack>
                                </View>
                            ) : null}
                        </View>

                        <Text fontSize="$5" fontWeight="800" color="$color12" style={{ marginBottom: 8 }}>
                            Người thân tin cậy ({contacts.length})
                        </Text>
                        <View style={{
                            backgroundColor: EHR_PRIMARY_FIXED,
                            borderColor: EHR_PRIMARY,
                            borderWidth: 1,
                            borderRadius: 10,
                            padding: 10,
                            marginBottom: 12,
                        }}>
                            <XStack style={{ alignItems: 'flex-start' }}>
                                <Info size={14} color={EHR_PRIMARY} />
                                <Text style={{ flex: 1, marginLeft: 6, fontSize: 12, lineHeight: 16, color: EHR_PRIMARY }}>
                                    Liên hệ người thân để họ ký uỷ quyền cho bạn truy cập hồ sơ trong app của họ.
                                </Text>
                            </XStack>
                        </View>

                        {contacts.length === 0 ? (
                            <Text style={{ color: EHR_ON_SURFACE_VARIANT, padding: 12 }}>
                                Bệnh nhân chưa có Người thân tin cậy nào. Không thể truy cập hồ sơ trong tình huống này.
                            </Text>
                        ) : (
                            contacts.map((c) => (
                                <View
                                    key={c.contactAddress}
                                    style={{
                                        backgroundColor: EHR_SURFACE_LOW,
                                        borderRadius: 14,
                                        borderWidth: 1,
                                        borderColor: EHR_OUTLINE_VARIANT,
                                        padding: 14,
                                        marginBottom: 10,
                                    }}
                                >
                                    <XStack style={{ alignItems: 'center', marginBottom: 6 }}>
                                        <Heart size={16} color={EHR_PRIMARY} />
                                        <Text fontWeight="700" fontSize="$4" color="$color12" style={{ marginLeft: 8 }}>
                                            {c.fullName || truncate(c.contactAddress)}
                                        </Text>
                                    </XStack>
                                    {c.label ? (
                                        <Text style={{ fontSize: 12, color: EHR_ON_SURFACE_VARIANT, marginBottom: 4 }}>
                                            {c.label}
                                        </Text>
                                    ) : null}
                                    {c.phone ? (
                                        <Button
                                            size="$3"
                                            marginTop={8}
                                            backgroundColor={EHR_PRIMARY}
                                            color={EHR_ON_PRIMARY}
                                            icon={<Phone size={14} color={EHR_ON_PRIMARY} />}
                                            onPress={() => callContact(c.phone)}
                                        >
                                            <Text color={EHR_ON_PRIMARY} fontWeight="700">
                                                Gọi {c.phone}
                                            </Text>
                                        </Button>
                                    ) : (
                                        <Text style={{ color: EHR_ON_SURFACE_VARIANT, fontSize: 12 }}>
                                            (Không có số điện thoại)
                                        </Text>
                                    )}
                                </View>
                            ))
                        )}
                    </>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}
