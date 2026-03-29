import React from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, View, YStack } from 'tamagui';

import RecordCard from '../components/RecordCard';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import useRecords from '../hooks/useRecords';

export default function RecordsScreen({ navigation }: any) {
    const { records, isLoading, isRefreshing, error, refresh } = useRecords();

    const handleRecordPress = (record: any) => {
        navigation.navigate('RecordDetail', { record });
    };

    if (isLoading && !isRefreshing) {
        return <LoadingSpinner message="Dang tai danh sach ho so..." />;
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['right', 'left']}>
            {error && !isLoading ? (
                <View background="$red2" borderColor="$red4" style={{ marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderRadius: 10, padding: 12 }}>
                    <Text color="$red11" fontSize="$3" style={{ textAlign: 'center' }}>{error}</Text>
                </View>
            ) : null}

            {records.length === 0 && !error ? (
                <EmptyState
                    title="Chua co ho so y te"
                    description="Tat ca ho so kham benh va xet nghiem se hien thi tai day."
                    actionLabel="Tai lai"
                    onAction={refresh}
                />
            ) : (
                <FlatList
                    data={records}
                    keyExtractor={(item: any, idx) => item.cidHash || `record-${idx}`}
                    renderItem={({ item }) => <RecordCard record={item} onPress={handleRecordPress} />}
                    contentContainerStyle={{ padding: 16 }}
                    refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} colors={['#2563eb']} />}
                    ListHeaderComponent={
                        <YStack style={{ marginBottom: 10 }}>
                            <Text fontSize="$7" fontWeight="800" color="$color12" style={{ marginBottom: 4 }}>
                                Ho so y te
                            </Text>
                            <Text fontSize="$3" color="$color10" style={{ marginBottom: 8 }}>
                                Tong cong {records.length} ho so (chi hien thi phien ban moi nhat)
                            </Text>
                            <View background="olive" borderColor="olive" style={{ borderWidth: 1, borderRadius: 10, padding: 10 }}>
                                <Text fontSize="$2" color="olive">
                                    Keo xuong de lam moi danh sach. Nhan vao tung the de xem chi tiet.
                                </Text>
                            </View>
                        </YStack>
                    }
                />
            )}
        </SafeAreaView>
    );
}




