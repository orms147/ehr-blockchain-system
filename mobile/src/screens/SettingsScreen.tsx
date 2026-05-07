import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wallet, Copy, ExternalLink, Shield, Info, Coins, Heart, ChevronRight, Fingerprint } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';
import { useNavigation } from '@react-navigation/native';

import useAuthStore from '../store/authStore';
import { isBiometricSigningEnabled, setBiometricSigningEnabled } from '../utils/biometricGate';
import {
    EHR_ON_PRIMARY,
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_CONTAINER,
    EHR_PRIMARY_FIXED,
    EHR_SURFACE,
    EHR_SURFACE_LOW,
    EHR_SURFACE_LOWEST,
    EHR_TERTIARY,
    EHR_TERTIARY_FIXED,
} from '../constants/uiColors';

export default function SettingsScreen() {
    const { user } = useAuthStore();
    const navigation = useNavigation<any>();
    const [copied, setCopied] = useState(false);
    const [bioEnabled, setBioEnabled] = useState(true);

    useEffect(() => {
        isBiometricSigningEnabled().then(setBioEnabled).catch(() => setBioEnabled(true));
    }, []);

    const handleToggleBio = async (next: boolean) => {
        // Optimistic update — flip immediately. The persisted value is only
        // read at signing time, so a transient AsyncStorage write race won't
        // accidentally bypass the gate.
        setBioEnabled(next);
        try {
            await setBiometricSigningEnabled(next);
        } catch (err) {
            setBioEnabled(!next);
            Alert.alert('Lỗi', 'Không lưu được thiết lập. Vui lòng thử lại.');
        }
    };

    const walletAddress = user?.walletAddress || user?.address || '';

    const copyAddress = async () => {
        if (!walletAddress) return;
        await Clipboard.setStringAsync(walletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const openExplorer = () => {
        if (walletAddress) Linking.openURL(`https://sepolia.arbiscan.io/address/${walletAddress}`);
    };

    const openFaucet = () => {
        Linking.openURL('https://www.alchemy.com/faucets/arbitrum-sepolia');
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: EHR_SURFACE }} edges={['bottom', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
                <YStack style={{ marginBottom: 12 }}>
                    <Text fontSize="$7" fontWeight="800" color="$color12">Cài đặt</Text>
                    <Text fontSize="$3" color="$color10" style={{ marginTop: 2 }}>
                        Quản lý ví blockchain và thông tin bảo mật
                    </Text>
                </YStack>

                <View style={{ backgroundColor: EHR_PRIMARY, borderRadius: 24, padding: 20, marginBottom: 20 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 14 }}>
                        <Wallet size={20} color={EHR_ON_PRIMARY} />
                        <Text color={EHR_ON_PRIMARY} fontSize="$5" fontWeight="700" style={{ marginLeft: 8 }}>Ví blockchain của bạn</Text>
                    </XStack>

                    <YStack style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 12, marginBottom: 12 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 6 }}>Địa chỉ ví (Arbitrum Sepolia)</Text>
                        <Text color={EHR_ON_PRIMARY} fontSize="$3">{walletAddress || 'Chưa kết nối'}</Text>
                    </YStack>

                    {walletAddress ? (
                        <XStack style={{ gap: 8 }}>
                            <Button size="$3" background="rgba(255,255,255,0.18)" pressStyle={{ background: 'rgba(255,255,255,0.28)' }} icon={<Copy size={14} color={EHR_ON_PRIMARY} />} onPress={copyAddress}>
                                <Text color={EHR_ON_PRIMARY} fontWeight="600">{copied ? 'Đã copy' : 'Copy'}</Text>
                            </Button>
                            <Button size="$3" background="rgba(255,255,255,0.18)" pressStyle={{ background: 'rgba(255,255,255,0.28)' }} icon={<ExternalLink size={14} color={EHR_ON_PRIMARY} />} onPress={openExplorer}>
                                <Text color={EHR_ON_PRIMARY} fontWeight="600">Arbiscan</Text>
                            </Button>
                        </XStack>
                    ) : null}
                </View>

                <View style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 24, overflow: 'hidden', marginBottom: 20 }}>
                    <XStack style={{ padding: 16, alignItems: 'center', backgroundColor: EHR_TERTIARY_FIXED }}>
                        <Coins size={18} color={EHR_TERTIARY} />
                        <Text fontSize="$5" fontWeight="700" style={{ marginLeft: 8, color: EHR_ON_SURFACE }}>
                            Nạp ETH để không giới hạn quota
                        </Text>
                    </XStack>

                    <YStack style={{ padding: 14, gap: 10 }}>
                        <View style={{ backgroundColor: EHR_SURFACE_LOW, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 14, padding: 12 }}>
                            <XStack style={{ alignItems: 'flex-start' }}>
                                <Info size={16} color={EHR_PRIMARY} />
                                <Text fontSize="$3" style={{ flex: 1, marginLeft: 8, lineHeight: 20, color: EHR_ON_SURFACE_VARIANT }}>
                                    Khi ví có ETH, bạn có thể tự trả gas và không bị giới hạn số lần upload/revoke mỗi tháng.
                                </Text>
                            </XStack>
                        </View>

                        <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginTop: 4 }}>Cách nạp ETH (Testnet):</Text>

                        {[
                            { step: '1', title: 'Sao chép địa chỉ ví', desc: 'Nhấn nút Copy ở card phía trên' },
                            { step: '2', title: 'Nhận ETH testnet miễn phí', desc: 'Truy cập faucet và dán địa chỉ ví' },
                            { step: '3', title: 'Hoặc gửi từ MetaMask', desc: 'Gửi ETH Arbitrum Sepolia tới địa chỉ ví' },
                        ].map((item) => (
                            <XStack key={item.step} style={{ alignItems: 'flex-start', borderRadius: 14, padding: 12, backgroundColor: EHR_SURFACE_LOW }}>
                                <View style={{ width: 24, height: 24, borderRadius: 12, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: EHR_PRIMARY }}>
                                    <Text color={EHR_ON_PRIMARY} fontSize="$2" fontWeight="700">{item.step}</Text>
                                </View>
                                <YStack style={{ flex: 1 }}>
                                    <Text fontSize="$4" fontWeight="700" color="$color12">{item.title}</Text>
                                    <Text fontSize="$2" color="$color10">{item.desc}</Text>
                                </YStack>
                            </XStack>
                        ))}

                        <Button size="$4" variant="outlined" borderColor={EHR_OUTLINE_VARIANT} pressStyle={{ background: EHR_SURFACE_LOW }} icon={<ExternalLink size={14} color={EHR_TERTIARY} />} onPress={openFaucet}>
                            <Text fontWeight="600" style={{ color: EHR_TERTIARY }}>Mở Alchemy Faucet</Text>
                        </Button>

                        <View style={{ backgroundColor: EHR_PRIMARY_FIXED, borderColor: EHR_PRIMARY_CONTAINER, borderWidth: 1, borderRadius: 14, padding: 12 }}>
                            <Text fontSize="$2" style={{ lineHeight: 18, color: EHR_PRIMARY }}>
                                <Text fontWeight="700">Lưu ý: </Text>Đây là mạng testnet (Arbitrum Sepolia). ETH trên testnet không có giá trị thực.
                            </Text>
                        </View>
                    </YStack>
                </View>

                <Pressable
                    onPress={() => navigation.navigate('TrustedContacts')}
                    style={{
                        backgroundColor: EHR_SURFACE_LOWEST,
                        borderColor: EHR_OUTLINE_VARIANT,
                        borderWidth: 1,
                        borderRadius: 20,
                        padding: 14,
                        marginBottom: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                    }}
                >
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: EHR_PRIMARY_FIXED, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <Heart size={20} color={EHR_PRIMARY} />
                    </View>
                    <YStack style={{ flex: 1 }}>
                        <Text fontSize="$5" fontWeight="700" color="$color12">Người thân tin cậy</Text>
                        <Text fontSize="$3" color="$color10" style={{ lineHeight: 18 }}>
                            Cấu hình người được giúp bạn trong tình huống cấp cứu
                        </Text>
                    </YStack>
                    <ChevronRight size={20} color={EHR_ON_SURFACE_VARIANT} />
                </Pressable>

                <View style={{
                    backgroundColor: EHR_SURFACE_LOWEST,
                    borderColor: EHR_OUTLINE_VARIANT,
                    borderWidth: 1,
                    borderRadius: 20,
                    padding: 14,
                    marginBottom: 16,
                }}>
                    <XStack style={{ alignItems: 'center' }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: EHR_PRIMARY_FIXED, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            <Fingerprint size={20} color={EHR_PRIMARY} />
                        </View>
                        <YStack style={{ flex: 1, marginRight: 8 }}>
                            <Text fontSize="$5" fontWeight="700" color="$color12">Yêu cầu vân tay khi ký</Text>
                            <Text fontSize="$2" color="$color10" style={{ lineHeight: 16, marginTop: 2 }}>
                                Mỗi lần ký giao dịch (cấp quyền, uỷ quyền, tạo hồ sơ) sẽ yêu cầu xác thực sinh trắc học.
                            </Text>
                        </YStack>
                        <Switch
                            value={bioEnabled}
                            onValueChange={handleToggleBio}
                            trackColor={{ false: EHR_OUTLINE_VARIANT, true: EHR_PRIMARY }}
                        />
                    </XStack>
                    <Text fontSize="$1" color="$color9" style={{ marginTop: 8, lineHeight: 14 }}>
                        Theo TT 13/2025/TT-BYT, sinh trắc học là chữ ký pháp lý. Tắt nếu thiết bị không có vân tay/Face ID.
                    </Text>
                </View>

                <XStack style={{ backgroundColor: EHR_SURFACE_LOWEST, borderColor: EHR_OUTLINE_VARIANT, borderWidth: 1, borderRadius: 20, padding: 14, alignItems: 'flex-start' }}>
                    <Shield size={22} color={EHR_PRIMARY} />
                    <YStack style={{ flex: 1, marginLeft: 10 }}>
                        <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 4 }}>Bảo mật</Text>
                        <Text fontSize="$3" color="$color11" style={{ lineHeight: 20 }}>
                            Khoá riêng của bạn được mã hoá và lưu trữ bởi Web3Auth. Hệ thống EHR Chain không có quyền truy cập vào khoá riêng.
                        </Text>
                    </YStack>
                </XStack>

                <Button
                    style={{ marginTop: 16 }}
                    size="$4"
                    variant="outlined"
                    onPress={() => setCopied(false)}
                    borderColor={EHR_OUTLINE_VARIANT}
                >
                    <Text color="$color11" fontWeight="600">Reset trạng thái</Text>
                </Button>
            </ScrollView>
        </SafeAreaView>
    );
}






