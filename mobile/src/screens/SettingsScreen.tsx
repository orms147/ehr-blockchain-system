import React, { useState } from 'react';
import { Alert, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Wallet, Copy, ExternalLink, Shield, Info, Coins } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import useAuthStore from '../store/authStore';

export default function SettingsScreen() {
    const { user } = useAuthStore();
    const [copied, setCopied] = useState(false);

    const walletAddress = user?.walletAddress || user?.address || '';

    const copyAddress = () => {
        if (!walletAddress) return;
        setCopied(true);
        Alert.alert('Dia chi vi', walletAddress, [{ text: 'Da hieu' }]);
    };

    const openExplorer = () => {
        if (walletAddress) Linking.openURL(`https://sepolia.arbiscan.io/address/${walletAddress}`);
    };

    const openFaucet = () => {
        Linking.openURL('https://www.alchemy.com/faucets/arbitrum-sepolia');
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['bottom', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
                <YStack style={{ marginBottom: 12 }}>
                    <Text fontSize="$7" fontWeight="800" color="$color12">Cai dat</Text>
                    <Text fontSize="$3" color="$color10" style={{ marginTop: 2 }}>
                        Quan ly vi blockchain va thong tin bao mat
                    </Text>
                </YStack>

                <View background="olive" style={{ borderRadius: 12, padding: 20, marginBottom: 20 }}>
                    <XStack style={{ alignItems: 'center', marginBottom: 14 }}>
                        <Wallet size={20} color="white" />
                        <Text color="white" fontSize="$5" fontWeight="700" style={{ marginLeft: 8 }}>Vi Blockchain cua ban</Text>
                    </XStack>

                    <YStack style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 6 }}>Dia chi vi (Arbitrum Sepolia)</Text>
                        <Text color="white" fontSize="$3">{walletAddress || 'Chua ket noi'}</Text>
                    </YStack>

                    {walletAddress ? (
                        <XStack style={{ gap: 8 }}>
                            <Button size="$3" background="rgba(255,255,255,0.2)" pressStyle={{ background: 'rgba(255,255,255,0.3)' }} icon={<Copy size={14} color="white" />} onPress={copyAddress}>
                                <Text color="white" fontWeight="600">{copied ? 'Da copy' : 'Copy'}</Text>
                            </Button>
                            <Button size="$3" background="rgba(255,255,255,0.2)" pressStyle={{ background: 'rgba(255,255,255,0.3)' }} icon={<ExternalLink size={14} color="white" />} onPress={openExplorer}>
                                <Text color="white" fontWeight="600">Arbiscan</Text>
                            </Button>
                        </XStack>
                    ) : null}
                </View>

                <View background="$teal2" borderColor="$teal4" style={{ borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                    <XStack background="$teal3" style={{ padding: 14, alignItems: 'center' }}>
                        <Coins size={18} color="#0F766E" />
                        <Text color="$teal11" fontSize="$5" fontWeight="700" style={{ marginLeft: 8 }}>
                            Nap ETH de khong gioi han quota
                        </Text>
                    </XStack>

                    <YStack style={{ padding: 14, gap: 10 }}>
                        <View background="olive" borderColor="olive" style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}>
                            <XStack style={{ alignItems: 'flex-start' }}>
                                <Info size={16} color="#2563EB" />
                                <Text fontSize="$3" color="olive" style={{ flex: 1, marginLeft: 8, lineHeight: 20 }}>
                                    Khi vi co ETH, ban co the tu tra gas va khong bi gioi han so lan upload/revoke moi thang.
                                </Text>
                            </XStack>
                        </View>

                        <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginTop: 4 }}>Cach nap ETH (Testnet):</Text>

                        {[
                            { step: '1', title: 'Sao chep dia chi vi', desc: 'Nhan nut Copy o card phia tren' },
                            { step: '2', title: 'Nhan ETH testnet mien phi', desc: 'Truy cap faucet va dan dia chi vi' },
                            { step: '3', title: 'Hoac gui tu MetaMask', desc: 'Gui ETH Arbitrum Sepolia toi dia chi vi' },
                        ].map((item) => (
                            <XStack key={item.step} background="$teal1" style={{ alignItems: 'flex-start', borderRadius: 8, padding: 10 }}>
                                <View background="$teal9" style={{ width: 24, height: 24, borderRadius: 12, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text color="white" fontSize="$2" fontWeight="700">{item.step}</Text>
                                </View>
                                <YStack style={{ flex: 1 }}>
                                    <Text fontSize="$4" fontWeight="700" color="$color12">{item.title}</Text>
                                    <Text fontSize="$2" color="$color10">{item.desc}</Text>
                                </YStack>
                            </XStack>
                        ))}

                        <Button size="$4" variant="outlined" borderColor="$teal7" pressStyle={{ background: '$teal3' }} icon={<ExternalLink size={14} color="#0F766E" />} onPress={openFaucet}>
                            <Text color="$teal10" fontWeight="600">Mo Alchemy Faucet</Text>
                        </Button>

                        <View background="$yellow2" borderColor="$yellow4" style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}>
                            <Text fontSize="$2" color="$yellow11" style={{ lineHeight: 18 }}>
                                <Text fontWeight="700">Luu y: </Text>Day la mang testnet (Arbitrum Sepolia). ETH tren testnet khong co gia tri thuc.
                            </Text>
                        </View>
                    </YStack>
                </View>

                <XStack background="$color2" borderColor="$color4" style={{ borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'flex-start' }}>
                    <Shield size={22} color="#0F766E" />
                    <YStack style={{ flex: 1, marginLeft: 10 }}>
                        <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 4 }}>Bao mat</Text>
                        <Text fontSize="$3" color="$color11" style={{ lineHeight: 20 }}>
                            Khoa rieng cua ban duoc ma hoa va luu tru boi Web3Auth. He thong EHR Chain khong co quyen truy cap vao khoa rieng.
                        </Text>
                    </YStack>
                </XStack>

                <Button
                    style={{ marginTop: 16 }}
                    size="$4"
                    variant="outlined"
                    onPress={() => setCopied(false)}
                    borderColor="$borderColor"
                >
                    <Text color="$color11" fontWeight="600">Reset trang thai</Text>
                </Button>
            </ScrollView>
        </SafeAreaView>
    );
}





