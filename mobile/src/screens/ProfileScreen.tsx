import React, { useState, useEffect } from 'react';
import { Alert, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { User, LogOut, Shield, Droplets, ChevronRight, Edit3, Calendar, Settings, Info } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';

import LoadingSpinner from '../components/LoadingSpinner';
import RoleSwitcher from '../components/RoleSwitcher';
import profileService from '../services/profile.service';
import useAuthStore from '../store/authStore';

export default function ProfileScreen() {
    const navigation = useNavigation<any>();
    const { user, logout, token } = useAuthStore();
    const [profile, setProfile] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isMockMode, setIsMockMode] = useState(false);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!token) {
                setIsLoading(false);
                return;
            }
            if (token === 'mock_jwt_token') {
                setIsMockMode(true);
                setIsLoading(false);
                return;
            }
            try {
                const data = await profileService.getMyProfile();
                setProfile(data);
            } catch (error) {
                console.error('Failed to fetch profile', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProfile();
    }, [token]);

    const handleLogout = () => {
        Alert.alert('Dang xuat', 'Ban co chac chan muon dang xuat khoi thiet bi nay?', [
            { text: 'Huy', style: 'cancel' },
            { text: 'Dang xuat', style: 'destructive', onPress: () => logout() },
        ]);
    };

    const handleSaveProfile = async () => {
        try {
            if (!profile) return;
            setIsLoading(true);
            const updated = await profileService.updateMyProfile(profile);
            setProfile(updated || profile);
            Alert.alert('Thanh cong', 'Da cap nhat thong tin ca nhan.');
        } catch (error: any) {
            Alert.alert('Loi', error?.message || 'Khong the cap nhat ho so.');
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return <LoadingSpinner message="Dang tai thong tin ca nhan..." />;

    const userData = { ...(user || {}), ...(profile || {}) };
    const truncateAddress = (addr?: string) => (addr ? `${addr.substring(0, 10)}...${addr.slice(-6)}` : '0x000...');

    const MenuItem = ({ label, onPress }: { label: string; onPress?: () => void }) => (
        <Pressable onPress={onPress}>
            <XStack style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                <Text fontSize="$4" fontWeight="500" color="$color12">{label}</Text>
                <ChevronRight size={18} color="#94A3B8" />
            </XStack>
        </Pressable>
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['right', 'left']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
                {isMockMode ? (
                    <View background="$purple3" borderColor="$purple5" style={{ borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 }}>
                        <XStack style={{ alignItems: 'center' }}>
                            <Info size={16} color="#7C3AED" />
                            <Text fontSize="$3" color="$purple11" style={{ flex: 1, marginLeft: 8 }}>
                                Dang o che do Demo (chua ket noi vi that). Du lieu ben duoi la mau.
                            </Text>
                        </XStack>
                    </View>
                ) : null}

                <RoleSwitcher />
                <View style={{ height: 20 }} />

                <YStack style={{ alignItems: 'center', marginBottom: 24 }}>
                    <View background="olive" style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 12, alignItems: 'center', justifyContent: 'center' }}>
                        <User size={40} color="#2563EB" />
                    </View>
                    <Text fontSize="$6" fontWeight="700" color="$color12" style={{ marginBottom: 4 }}>{userData.fullName || 'Chua cap nhat ten'}</Text>
                    <Text fontSize="$3" color="$color10" style={{ marginBottom: 10 }}>{truncateAddress(userData.walletAddress || userData.address)}</Text>
                    <XStack style={{ backgroundColor: '#dcfce7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' }}>
                        <Shield size={14} color="#16a34a" />
                        <Text style={{ color: '#166534', fontSize: 11, fontWeight: '700', marginLeft: 6, textTransform: 'uppercase' }}>Blockchain Verified</Text>
                    </XStack>
                </YStack>

                <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 12, marginBottom: 20, padding: 16 }}>
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text fontSize="$5" fontWeight="700" color="$color12">Thong tin suc khoe</Text>
                        <XStack style={{ alignItems: 'center' }}>
                            <Edit3 size={14} color="#2563EB" />
                            <Text fontSize="$3" fontWeight="500" color="olive" style={{ marginLeft: 4 }}>Sua</Text>
                        </XStack>
                    </XStack>

                    <XStack style={{ flexWrap: 'wrap' }}>
                        <YStack style={{ width: '50%', paddingRight: 8, marginBottom: 10 }}>
                            <XStack style={{ alignItems: 'center' }}>
                                <View background="$red3" style={{ width: 36, height: 36, borderRadius: 18, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
                                    <Droplets size={16} color="#DC2626" />
                                </View>
                                <YStack>
                                    <Text fontSize="$2" color="$color9" style={{ textTransform: 'uppercase' }}>Nhom mau</Text>
                                    <Text fontSize="$4" fontWeight="700" color="$color12">{userData.bloodType || 'Chua ro'}</Text>
                                </YStack>
                            </XStack>
                        </YStack>

                        <YStack style={{ width: '50%', paddingLeft: 8, marginBottom: 10 }}>
                            <XStack style={{ alignItems: 'center' }}>
                                <View background="olive" style={{ width: 36, height: 36, borderRadius: 18, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
                                    <User size={16} color="#2563EB" />
                                </View>
                                <YStack>
                                    <Text fontSize="$2" color="$color9" style={{ textTransform: 'uppercase' }}>Gioi tinh</Text>
                                    <Text fontSize="$4" fontWeight="700" color="$color12">
                                        {userData.gender === 'male' ? 'Nam' : userData.gender === 'female' ? 'Nu' : (userData.gender || 'Khac')}
                                    </Text>
                                </YStack>
                            </XStack>
                        </YStack>

                        <YStack style={{ width: '50%', paddingRight: 8 }}>
                            <XStack style={{ alignItems: 'center' }}>
                                <View background="$green3" style={{ width: 36, height: 36, borderRadius: 18, marginRight: 8, alignItems: 'center', justifyContent: 'center' }}>
                                    <Calendar size={16} color="#16A34A" />
                                </View>
                                <YStack>
                                    <Text fontSize="$2" color="$color9" style={{ textTransform: 'uppercase' }}>Nam sinh</Text>
                                    <Text fontSize="$4" fontWeight="700" color="$color12">{userData.DOB || 'Chua ro'}</Text>
                                </YStack>
                            </XStack>
                        </YStack>
                    </XStack>

                    <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 }} />
                    <Text fontSize="$2" color="$color9" style={{ textTransform: 'uppercase', marginBottom: 4 }}>Di ung & ghi chu</Text>
                    <Text fontSize="$3" color="$color11" style={{ lineHeight: 22 }}>
                        {userData.allergies || 'Khong co ghi nhan di ung y te dac biet.'}
                    </Text>
                </View>

                <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 12, overflow: 'hidden' }}>
                    <Pressable onPress={() => navigation.navigate('Settings')}>
                        <XStack style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                            <XStack style={{ alignItems: 'center' }}>
                                <Settings size={18} color="#475569" style={{ marginRight: 10 }} />
                                <Text fontSize="$4" fontWeight="500" color="$color12">Cai dat & Vi</Text>
                            </XStack>
                            <ChevronRight size={18} color="#94A3B8" />
                        </XStack>
                    </Pressable>
                    <MenuItem label="Chinh sua ho so" />
                    <Pressable onPress={handleSaveProfile}>
                        <XStack style={{ padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                            <Text fontSize="$4" fontWeight="500" color="$color12">Luu ho so hien tai</Text>
                            <ChevronRight size={18} color="#94A3B8" />
                        </XStack>
                    </Pressable>
                    <MenuItem label="Quan ly bao mat" />
                    <MenuItem label="Ve ung dung" />

                    <Button
                        unstyled
                        onPress={handleLogout}
                        pressStyle={{ background: '$red3' }}
                        style={{ padding: 16 }}
                    >
                        <XStack style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text fontSize="$4" fontWeight="700" color="$red10">Dang xuat</Text>
                            <LogOut size={18} color="#DC2626" />
                        </XStack>
                    </Button>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}






