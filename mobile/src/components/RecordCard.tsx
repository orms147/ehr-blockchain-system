import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, Easing } from 'react-native';
import { FileText, ChevronRight, Activity, Stethoscope, FileSearch } from 'lucide-react-native';
import { XStack, YStack, Text, View } from 'tamagui';

interface RecordCardProps {
    record: any;
    onPress?: (record: any) => void;
}

export default function RecordCard({ record, onPress }: RecordCardProps) {
    const mountAnim = useRef(new Animated.Value(0)).current;
    const pressScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.timing(mountAnim, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [mountAnim]);

    const handlePressIn = () => {
        Animated.spring(pressScale, {
            toValue: 0.98,
            useNativeDriver: true,
            speed: 20,
            bounciness: 0,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(pressScale, {
            toValue: 1,
            useNativeDriver: true,
            speed: 20,
            bounciness: 0,
        }).start();
    };

    const getIcon = () => {
        const type = typeof record?.type === 'string' ? record.type.toLowerCase() : '';
        if (type.includes('lab') || type.includes('xet nghiem')) return <Activity color="#475569" size={24} />;
        if (type.includes('checkup') || type.includes('kham')) return <Stethoscope color="#475569" size={24} />;
        if (type.includes('x-ray') || type.includes('x-quang')) return <FileSearch color="#475569" size={24} />;
        return <FileText color="#475569" size={24} />;
    };

    return (
        <Animated.View
            style={{
                opacity: mountAnim,
                transform: [
                    {
                        translateY: mountAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [10, 0],
                        }),
                    },
                    { scale: pressScale },
                ],
            }}
        >
            <Pressable onPress={() => onPress?.(record)} onPressIn={handlePressIn} onPressOut={handlePressOut}>
                <View
                    background="$background"
                    borderColor="$borderColor"
                    style={{
                        borderWidth: 1,
                        borderRadius: 14,
                        marginBottom: 14,
                        padding: 16,
                        shadowColor: '#0f172a',
                        shadowOffset: { width: 0, height: 5 },
                        shadowOpacity: 0.06,
                        shadowRadius: 10,
                        elevation: 2,
                    }}
                >
                    <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <XStack style={{ flex: 1, alignItems: 'center' }}>
                            <View
                                background="$color3"
                                style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 12,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginRight: 16,
                                }}
                            >
                                {getIcon()}
                            </View>

                            <YStack style={{ flex: 1 }}>
                                <Text fontSize="$5" fontWeight="700" color="$color12" numberOfLines={1} style={{ marginBottom: 4 }}>
                                    {record?.title || record?.type || 'Ho so Y te'}
                                </Text>
                                <XStack style={{ alignItems: 'center', justifyContent: 'space-between', paddingRight: 8 }}>
                                    <Text fontSize="$3" color="$color10" numberOfLines={1} style={{ flex: 1 }}>
                                        {record?.createdByDisplay || 'BS. Khong ro'}
                                    </Text>
                                    <Text fontSize="$2" color="$color9" style={{ marginLeft: 8 }}>
                                        {record?.date}
                                    </Text>
                                </XStack>
                            </YStack>
                        </XStack>

                        <View style={{ paddingLeft: 8 }}>
                            <ChevronRight color="#94A3B8" size={20} />
                        </View>
                    </XStack>
                </View>
            </Pressable>
        </Animated.View>
    );
}
