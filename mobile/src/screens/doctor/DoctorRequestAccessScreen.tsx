import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send, User, FileText, AlertCircle, CheckCircle } from 'lucide-react-native';
import { YStack, XStack, Text, Button, Input, TextArea, View } from 'tamagui';

import api from '../../services/api';

const REQUEST_TYPES = [
    { value: 0, label: 'Chi xem', description: 'Xem ho so ma khong chinh sua' },
    { value: 1, label: 'Toan quyen', description: 'Xem va cap nhat ho so' },
];

export default function DoctorRequestAccessScreen() {
    const [patientAddress, setPatientAddress] = useState('');
    const [cidHash, setCidHash] = useState('');
    const [selectedType, setSelectedType] = useState(0);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const isValidAddress = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr);

    const handleSubmit = async () => {
        if (!patientAddress.trim()) {
            Alert.alert('Thieu thong tin', 'Vui long nhap dia chi vi benh nhan.');
            return;
        }
        if (!isValidAddress(patientAddress.trim())) {
            Alert.alert('Dia chi khong hop le', 'Dia chi vi phai bat dau bang 0x va co 42 ky tu.');
            return;
        }

        setIsSubmitting(true);
        try {
            const normalizedCidHash = cidHash.trim() || `0x${'0'.repeat(64)}`;

            await api.post('/api/requests/create', {
                patientAddress: patientAddress.trim().toLowerCase(),
                cidHash: normalizedCidHash,
                requestType: selectedType,
                durationDays: 7,
            });

            setIsSuccess(true);
            setPatientAddress('');
            setCidHash('');
            setSelectedType(0);
            setReason('');
        } catch (error: any) {
            Alert.alert('Loi', error?.message || 'Khong the gui yeu cau. Vui long thu lai.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['right', 'left']}>
                <YStack style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <View background="$green3" style={{ width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                        <CheckCircle size={40} color="#16A34A" />
                    </View>
                    <Text fontSize="$6" fontWeight="700" color="$color12" style={{ marginBottom: 8, textAlign: 'center' }}>
                        Da gui yeu cau
                    </Text>
                    <Text fontSize="$4" color="$color11" style={{ textAlign: 'center', lineHeight: 22 }}>
                        Yeu cau truy cap da duoc gui toi benh nhan.
                    </Text>
                    <Button
                        style={{ marginTop: 20 }}
                        size="$4"
                        onPress={() => setIsSuccess(false)}
                        background="olive"
                        pressStyle={{ background: 'olive' }}
                    >
                        <Text color="white" fontWeight="700">Tao yeu cau moi</Text>
                    </Button>
                </YStack>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['right', 'left']}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
                    <View background="$color2" borderColor="$color4" style={{ borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 20 }}>
                        <XStack style={{ alignItems: 'flex-start' }}>
                            <AlertCircle size={18} color="#475569" />
                            <Text fontSize="$3" color="$color11" style={{ flex: 1, marginLeft: 10, lineHeight: 20 }}>
                                Gui yeu cau de truy cap ho so benh nhan. Benh nhan se nhan thong bao va phe duyet hoac tu choi.
                            </Text>
                        </XStack>
                    </View>

                    <YStack style={{ marginBottom: 16 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>
                            Dia chi vi benh nhan <Text color="$red10">*</Text>
                        </Text>
                        <XStack
                            background="$background"
                            borderColor={patientAddress.length > 0 && !isValidAddress(patientAddress) ? '$red8' : '$borderColor'}
                            style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center' }}
                        >
                            <User size={16} color="#64748B" />
                            <Input
                                flex={1}
                                unstyled
                                fontSize="$4"
                                color="$color12"
                                placeholder="0x..."
                                value={patientAddress}
                                onChangeText={setPatientAddress}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{ paddingVertical: 12, paddingHorizontal: 12 }}
                            />
                        </XStack>
                        {patientAddress.length > 0 && !isValidAddress(patientAddress) ? (
                            <Text fontSize="$2" color="$red10" style={{ marginTop: 6, marginLeft: 4 }}>
                                Dia chi khong hop le
                            </Text>
                        ) : null}
                    </YStack>

                    <YStack style={{ marginBottom: 16 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>
                            CID Hash (tuy chon)
                        </Text>
                        <XStack background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center' }}>
                            <FileText size={16} color="#64748B" />
                            <Input
                                flex={1}
                                unstyled
                                fontSize="$4"
                                color="$color12"
                                placeholder="Nhap CID neu yeu cau"
                                value={cidHash}
                                onChangeText={setCidHash}
                                autoCapitalize="none"
                                autoCorrect={false}
                                style={{ paddingVertical: 12, paddingHorizontal: 12 }}
                            />
                        </XStack>
                    </YStack>

                    <YStack style={{ marginBottom: 16 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Loai yeu cau</Text>
                        <XStack style={{ gap: 10 }}>
                            {REQUEST_TYPES.map((type) => {
                                const isActive = selectedType === type.value;
                                return (
                                    <Pressable
                                        key={type.value}
                                        onPress={() => setSelectedType(type.value)}
                                        style={{
                                            flex: 1,
                                            borderWidth: 1,
                                            borderRadius: 10,
                                            padding: 12,
                                            backgroundColor: isActive ? '#e6fffb' : '#ffffff',
                                            borderColor: isActive ? '#5eead4' : '#e2e8f0',
                                        }}
                                    >
                                        <Text fontSize="$4" fontWeight="700" color={isActive ? '$teal11' : '$color12'}>
                                            {type.label}
                                        </Text>
                                        <Text fontSize="$2" color={isActive ? '$teal10' : '$color9'} style={{ marginTop: 4 }}>
                                            {type.description}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </XStack>
                    </YStack>

                    <YStack style={{ marginBottom: 24 }}>
                        <Text fontSize="$3" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Ly do (tuy chon)</Text>
                        <TextArea
                            borderColor="$borderColor"
                            background="$background"
                            color="$color12"
                            placeholder="VD: Kham dinh ky..."
                            value={reason}
                            onChangeText={setReason}
                            numberOfLines={4}
                            style={{ minHeight: 100 }}
                        />
                    </YStack>

                    <Button
                        size="$5"
                        background="$teal9"
                        pressStyle={{ background: '$teal10' }}
                        disabled={isSubmitting}
                        opacity={isSubmitting ? 0.7 : 1}
                        icon={isSubmitting ? undefined : <Send size={18} color="white" />}
                        onPress={handleSubmit}
                    >
                        <Text color="white" fontWeight="700" fontSize="$5">
                            {isSubmitting ? 'Dang gui...' : 'Gui yeu cau truy cap'}
                        </Text>
                    </Button>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}






