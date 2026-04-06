import React, { useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import { YStack, XStack, Text, Button } from 'tamagui';
import useAuthStore, { ROLE_CONFIG } from '../store/authStore';
import {
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_PRIMARY_FIXED,
    EHR_PRIMARY_FIXED_DIM,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

type RoleKey = 'patient' | 'doctor' | 'org' | 'organization' | 'ministry' | 'admin';
type RoleConfig = { label: string; emoji: string };

const FALLBACK_ROLE: RoleConfig = { label: 'Bệnh nhân', emoji: 'BN' };

export default function RoleSwitcher() {
    const [isOpen, setIsOpen] = useState(false);
    const { activeRole, availableRoles, switchRole } = useAuthStore();

    const currentConfig = useMemo(() => {
        const key = (activeRole as RoleKey) || 'patient';
        return (ROLE_CONFIG as Record<string, RoleConfig>)[key] || FALLBACK_ROLE;
    }, [activeRole]);

    const roles = useMemo(() => {
        if (!Array.isArray(availableRoles)) return [];
        return availableRoles.filter(Boolean) as RoleKey[];
    }, [availableRoles]);

    const handleSwitch = (role: RoleKey) => {
        switchRole(role);
        setIsOpen(false);
    };

    if (roles.length <= 1) return null;

    return (
        <YStack>
            <Button
                size="$4"
                variant="outlined"
                iconAfter={<ChevronDown size={16} color={EHR_ON_SURFACE_VARIANT} />}
                onPress={() => setIsOpen(true)}
                background={EHR_SURFACE_LOWEST}
                borderColor={EHR_OUTLINE_VARIANT}
            >
                <XStack style={{ alignItems: 'center', flex: 1 }}>
                    <Text fontSize="$5" style={{ marginRight: 8 }}>{currentConfig.emoji}</Text>
                    <Text fontSize="$4" fontWeight="700" color="$color12" style={{ flex: 1 }}>
                        {currentConfig.label}
                    </Text>
                </XStack>
            </Button>

            <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
                <Pressable
                    onPress={() => setIsOpen(false)}
                    style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingHorizontal: 24,
                    }}
                >
                    <Pressable
                        onPress={(e) => e.stopPropagation()}
                        style={{
                            width: '100%',
                            backgroundColor: EHR_SURFACE_LOWEST,
                            borderRadius: 20,
                            borderWidth: 1,
                            borderColor: EHR_OUTLINE_VARIANT,
                            padding: 16,
                        }}
                    >
                        <Text fontSize="$6" fontWeight="700" color="$color12" style={{ textAlign: 'center' }}>
                            Chuyển vai trò
                        </Text>
                        <Text fontSize="$3" color="$color10" style={{ textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
                            Chọn vai trò bạn muốn sử dụng
                        </Text>

                        <YStack style={{ gap: 8 }}>
                            {roles.map((role) => {
                                const config = (ROLE_CONFIG as Record<string, RoleConfig>)[role] || FALLBACK_ROLE;
                                const isActive = role === activeRole;

                                return (
                                    <Pressable
                                        key={role}
                                        onPress={() => handleSwitch(role)}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            borderRadius: 16,
                                            paddingVertical: 12,
                                            paddingHorizontal: 12,
                                            borderWidth: 1,
                                            borderColor: isActive ? EHR_PRIMARY_FIXED_DIM : EHR_OUTLINE_VARIANT,
                                            backgroundColor: isActive ? EHR_PRIMARY_FIXED : EHR_SURFACE_LOWEST,
                                        }}
                                    >
                                        <Text fontSize="$6" style={{ marginRight: 10 }}>{config.emoji}</Text>
                                        <Text
                                            fontSize="$5"
                                            fontWeight="500"
                                            color={isActive ? EHR_PRIMARY : '$color12'}
                                            style={{ flex: 1 }}
                                        >
                                            {config.label}
                                        </Text>
                                        {isActive ? <Check size={18} color={EHR_PRIMARY} /> : null}
                                    </Pressable>
                                );
                            })}
                        </YStack>

                        <View style={{ marginTop: 12 }}>
                            <Button size="$4" variant="outlined" onPress={() => setIsOpen(false)} borderColor={EHR_OUTLINE_VARIANT}>
                                <Text color="$color10" fontWeight="500">Đóng</Text>
                            </Button>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </YStack>
    );
}



