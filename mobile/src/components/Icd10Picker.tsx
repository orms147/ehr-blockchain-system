import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, TextInput } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';
import { Check, Search, X } from 'lucide-react-native';

import { ICD10_COMMON, searchIcd10, type Icd10Code } from '../constants/icd10';
import { useEhrPalette } from '../constants/uiColors';

export type Icd10Selection = Icd10Code;

type Props = {
    visible: boolean;
    onClose: () => void;
    onSelect: (item: Icd10Selection) => void;
    selectedCodes?: string[];
};

export default function Icd10Picker({ visible, onClose, onSelect, selectedCodes = [] }: Props) {
    const palette = useEhrPalette();
    const [query, setQuery] = useState('');

    const results = useMemo(() => {
        return query ? searchIcd10(query, 50) : ICD10_COMMON.slice(0, 50);
    }, [query]);

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
            <View style={{ flex: 1, backgroundColor: palette.EHR_SURFACE, paddingTop: 48 }}>
                <XStack style={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 }}>
                    <YStack style={{ flex: 1 }}>
                        <Text fontSize="$6" fontWeight="800" color="$color12">Chọn mã ICD-10</Text>
                        <Text fontSize="$2" color="$color10">Theo Thông tư 46/2018/TT-BYT</Text>
                    </YStack>
                    <Pressable
                        onPress={onClose}
                        style={{ padding: 10, borderRadius: 14, backgroundColor: palette.EHR_SURFACE_LOW }}
                    >
                        <X size={20} color={palette.EHR_ON_SURFACE} />
                    </Pressable>
                </XStack>

                <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
                    <XStack
                        style={{
                            alignItems: 'center',
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: palette.EHR_OUTLINE_VARIANT,
                            backgroundColor: palette.EHR_SURFACE_LOWEST,
                            paddingHorizontal: 14,
                        }}
                    >
                        <Search size={18} color={palette.EHR_ON_SURFACE_VARIANT} />
                        <TextInput
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Tìm theo mã (J45) hoặc tên (hen phế quản)..."
                            placeholderTextColor={palette.EHR_ON_SURFACE_VARIANT}
                            style={{
                                flex: 1,
                                paddingVertical: 12,
                                paddingHorizontal: 10,
                                fontSize: 15,
                                color: palette.EHR_ON_SURFACE,
                            }}
                        />
                    </XStack>
                </View>

                <FlatList
                    data={results}
                    keyExtractor={(item) => item.code}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                    renderItem={({ item }) => {
                        const selected = selectedCodes.includes(item.code);
                        return (
                            <Pressable
                                onPress={() => {
                                    onSelect(item);
                                    onClose();
                                }}
                                style={{
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: selected ? palette.EHR_PRIMARY : palette.EHR_OUTLINE_VARIANT,
                                    backgroundColor: selected ? palette.EHR_PRIMARY_FIXED : palette.EHR_SURFACE_LOWEST,
                                    padding: 14,
                                    marginBottom: 10,
                                }}
                            >
                                <XStack style={{ alignItems: 'center' }}>
                                    <View
                                        style={{
                                            minWidth: 60,
                                            paddingHorizontal: 10,
                                            paddingVertical: 4,
                                            borderRadius: 8,
                                            backgroundColor: palette.EHR_PRIMARY,
                                            marginRight: 12,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Text fontSize="$3" fontWeight="800" style={{ color: '#fff' }}>
                                            {item.code}
                                        </Text>
                                    </View>
                                    <YStack style={{ flex: 1 }}>
                                        <Text fontSize="$3" fontWeight="700" color="$color12">
                                            {item.name}
                                        </Text>
                                        <Text fontSize="$2" color="$color10">
                                            {item.chapter}
                                        </Text>
                                    </YStack>
                                    {selected && <Check size={20} color={palette.EHR_PRIMARY} />}
                                </XStack>
                            </Pressable>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={{ padding: 24, alignItems: 'center' }}>
                            <Text fontSize="$3" color="$color10">
                                Không tìm thấy mã phù hợp. Thử từ khoá khác.
                            </Text>
                        </View>
                    }
                />
            </View>
        </Modal>
    );
}
