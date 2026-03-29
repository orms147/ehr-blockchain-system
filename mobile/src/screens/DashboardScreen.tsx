import React, { useEffect, useRef } from 'react';
import { ScrollView, ActivityIndicator, Pressable, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileText, Bell, Activity, ChevronRight } from 'lucide-react-native';
import { YStack, XStack, Text, View } from 'tamagui';

import RecordCard from '../components/RecordCard';
import RoleSwitcher from '../components/RoleSwitcher';
import EmptyState from '../components/EmptyState';
import useAuthStore from '../store/authStore';
import useRecords from '../hooks/useRecords';
import useRequests from '../hooks/useRequests';

export default function DashboardScreen({ navigation }: any) {
    const { user } = useAuthStore();
    const { records, isLoading: recordsLoading } = useRecords();
    const { requests, isLoading: requestsLoading } = useRequests();

    const recentRecords = (records || []).slice(0, 3);
    const pendingCount = requests.length;
    const totalRecords = records.length;

    const headerAnim = useRef(new Animated.Value(0)).current;
    const metricsAnim = useRef(new Animated.Value(0)).current;
    const listAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.stagger(120, [
            Animated.timing(headerAnim, {
                toValue: 1,
                duration: 420,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(metricsAnim, {
                toValue: 1,
                duration: 470,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(listAnim, {
                toValue: 1,
                duration: 520,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start();
    }, [headerAnim, metricsAnim, listAnim]);

    const handleRecordPress = (record: any) => {
        navigation.navigate('RecordDetail', { record });
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['top']}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
                <Animated.View
                    style={{
                        opacity: headerAnim,
                        transform: [
                            {
                                translateY: headerAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [16, 0],
                                }),
                            },
                        ],
                    }}
                >
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <YStack style={{ flex: 1, marginRight: 12 }}>
                            <Text fontSize="$2" fontWeight="600" color="olive" style={{ textTransform: 'uppercase', marginBottom: 2 }}>
                                Cong thong tin suc khoe
                            </Text>
                            <Text fontSize="$7" fontWeight="700" color="$color12">Xin chao, {user?.fullName || 'Benh nhan'}!</Text>
                        </YStack>
                        <RoleSwitcher />
                    </XStack>
                </Animated.View>

                <Animated.View
                    style={{
                        opacity: metricsAnim,
                        transform: [
                            {
                                translateY: metricsAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [20, 0],
                                }),
                            },
                        ],
                    }}
                >
                    <XStack style={{ gap: 10, marginBottom: 22 }}>
                        <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('Records')}>
                            <View background="olive" style={{ borderRadius: 16, padding: 14 }}>
                                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 10, alignItems: 'center', justifyContent: 'center' }}>
                                    <FileText size={20} color="white" />
                                </View>
                                {recordsLoading ? (
                                    <ActivityIndicator size="small" color="#bfdbfe" style={{ marginBottom: 4, alignSelf: 'flex-start' }} />
                                ) : (
                                    <Text style={{ fontSize: 34, fontWeight: '700', color: 'white', marginBottom: 2 }}>{totalRecords}</Text>
                                )}
                                <Text fontSize="$3" color="olive" fontWeight="600">Ho so Y te</Text>
                            </View>
                        </Pressable>

                        <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('Requests')}>
                            <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 16, padding: 14 }}>
                                <View background="$amber3" style={{ width: 40, height: 40, borderRadius: 20, marginBottom: 10, alignItems: 'center', justifyContent: 'center' }}>
                                    <Bell size={20} color="#B45309" />
                                </View>
                                {requestsLoading ? (
                                    <ActivityIndicator size="small" color="#f59e0b" style={{ marginBottom: 4, alignSelf: 'flex-start' }} />
                                ) : (
                                    <Text style={{ fontSize: 34, fontWeight: '700', color: '#0f172a', marginBottom: 2 }}>{pendingCount}</Text>
                                )}
                                <Text fontSize="$3" color="$color10" fontWeight="600">Yeu cau cho</Text>
                            </View>
                        </Pressable>
                    </XStack>
                </Animated.View>

                <Animated.View
                    style={{
                        opacity: listAnim,
                        transform: [
                            {
                                translateY: listAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [22, 0],
                                }),
                            },
                        ],
                    }}
                >
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Text fontSize="$5" fontWeight="700" color="$color12">Lich su kham gan day</Text>
                        <Pressable onPress={() => navigation.navigate('Records')} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text fontSize="$3" fontWeight="600" color="olive" style={{ marginRight: 4 }}>Xem tat ca</Text>
                            <ChevronRight size={14} color="#2563EB" />
                        </Pressable>
                    </XStack>

                    {recordsLoading ? (
                        <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 16, padding: 24, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#2563eb" style={{ marginBottom: 12 }} />
                            <Text color="$color10">Dang tai ho so...</Text>
                        </View>
                    ) : recentRecords.length === 0 ? (
                        <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 16, padding: 6 }}>
                            <EmptyState
                                icon={Activity}
                                title="Chua co ho so nao"
                                description="Khi ban co ho so y te, du lieu se hien thi tai day."
                            />
                        </View>
                    ) : (
                        <YStack>
                            {recentRecords.map((record: any) => (
                                <RecordCard key={record.cidHash} record={record} onPress={handleRecordPress} />
                            ))}
                        </YStack>
                    )}

                    {pendingCount > 0 ? (
                        <YStack style={{ marginTop: 22 }}>
                            <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 10 }}>
                                Yeu cau dang cho xu ly
                            </Text>
                            <Pressable onPress={() => navigation.navigate('Requests')}>
                                <View background="$amber2" style={{ borderWidth: 1, borderColor: '#fbbf24', borderRadius: 16, padding: 14 }}>
                                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                                        <XStack style={{ alignItems: 'center', flex: 1 }}>
                                            <View background="$amber3" style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                                                <Bell size={18} color="#B45309" />
                                            </View>
                                            <YStack style={{ flex: 1 }}>
                                                <Text fontSize="$4" fontWeight="700" style={{ color: '#92400e' }}>{pendingCount} yeu cau truy cap moi</Text>
                                                <Text fontSize="$3" style={{ color: '#b45309' }}>Bac si dang cho duyet quyen xem ho so</Text>
                                            </YStack>
                                        </XStack>
                                        <ChevronRight size={18} color="#B45309" />
                                    </XStack>
                                </View>
                            </Pressable>
                        </YStack>
                    ) : null}
                </Animated.View>
            </ScrollView>
        </SafeAreaView>
    );
}



