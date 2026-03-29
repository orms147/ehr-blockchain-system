import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, Easing } from 'react-native';
import { FileText, Eye, Clock } from 'lucide-react-native';
import { XStack, YStack, Text, Button, View } from 'tamagui';

interface SharedRecordCardProps {
    record: any;
    onView?: (record: any) => void;
}

export default function SharedRecordCard({ record, onView }: SharedRecordCardProps) {
    const isPending = record?.status === 'pending';
    const truncateAddr = (addr: string) => (addr ? `${addr.substring(0, 8)}...${addr.slice(-4)}` : '???');

    const mountAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(mountAnim, {
            toValue: 1,
            duration: 330,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [mountAnim]);

    return (
        <Animated.View
            style={{
                opacity: mountAnim,
                transform: [
                    {
                        translateY: mountAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [12, 0],
                        }),
                    },
                ],
            }}
        >
            <Pressable onPress={() => onView?.(record)}>
                <View
                    background="$background"
                    borderColor="$borderColor"
                    style={{
                        borderWidth: 1,
                        borderRadius: 14,
                        padding: 16,
                        marginBottom: 12,
                        shadowColor: '#0f172a',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.05,
                        shadowRadius: 10,
                        elevation: 2,
                    }}
                >
                    <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                        <XStack style={{ alignItems: 'center', flex: 1 }}>
                            <View
                                background={isPending ? '$yellow3' : '$teal3'}
                                style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 10,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginRight: 12,
                                }}
                            >
                                <FileText size={20} color={isPending ? '#A16207' : '#0F766E'} />
                            </View>
                            <YStack style={{ flex: 1 }}>
                                <Text fontSize="$4" fontWeight="700" color="$color12" numberOfLines={1}>
                                    CID: {record?.cidHash ? record.cidHash.substring(0, 16) + '...' : 'N/A'}
                                </Text>
                                <Text fontSize="$3" color="$color10" style={{ marginTop: 4 }}>
                                    Benh nhan: {truncateAddr(record?.record?.ownerAddress || record?.senderAddress)}
                                </Text>
                            </YStack>
                        </XStack>

                        <View
                            background={isPending ? '$yellow3' : '$green3'}
                            style={{ borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, marginLeft: 8 }}
                        >
                            <Text fontSize="$2" fontWeight="700" color={isPending ? '$yellow11' : '$green11'}>
                                {isPending ? 'Moi' : 'Da xem'}
                            </Text>
                        </View>
                    </XStack>

                    <XStack style={{ alignItems: 'center', marginBottom: 12 }}>
                        <Clock size={12} color="#64748B" />
                        <Text fontSize="$2" color="$color9" style={{ marginLeft: 4 }}>
                            {record?.createdAt ? new Date(record.createdAt).toLocaleDateString('vi-VN') : ''}
                        </Text>

                        {record?.versionCount > 1 ? (
                            <View background="olive" style={{ borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, marginLeft: 8 }}>
                                <Text fontSize="$2" color="olive">v{record.versionCount}</Text>
                            </View>
                        ) : null}

                        {record?.expiresAt ? (
                            <View background="$color3" style={{ borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, marginLeft: 8 }}>
                                <Text fontSize="$2" color="$color11">
                                    HH: {new Date(record.expiresAt).toLocaleDateString('vi-VN')}
                                </Text>
                            </View>
                        ) : null}
                    </XStack>

                    <Button
                        background="$teal9"
                        pressStyle={{ background: '$teal10' }}
                        icon={<Eye size={16} color="white" />}
                        onPress={() => onView?.(record)}
                    >
                        <Text color="white" fontWeight="600" fontSize="$4">
                            {isPending ? 'Nhan & Xem ho so' : 'Xem ho so'}
                        </Text>
                    </Button>
                </View>
            </Pressable>
        </Animated.View>
    );
}



