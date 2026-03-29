import React from 'react';
import { FileX, LucideIcon, Loader2 } from 'lucide-react-native';
import { YStack, Circle, Text, Button, XStack } from 'tamagui';

interface EmptyStateProps {
    // Legacy props currently used across the app
    message?: string;
    subMessage?: string;
    icon?: LucideIcon | React.ReactNode;
    // New UI-style props (compatible with generated UI snippets)
    title?: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    isLoading?: boolean;
}

export default function EmptyState({
    message,
    subMessage,
    icon,
    title,
    description,
    actionLabel,
    onAction,
    isLoading = false,
}: EmptyStateProps) {
    const heading = title || message || 'Khong co du lieu';
    const body = description || subMessage;

    const renderIcon = () => {
        if (!icon) return <FileX size={40} color="#64748B" />;
        if (typeof icon === 'function') {
            const IconComponent = icon as LucideIcon;
            return <IconComponent size={40} color="#64748B" />;
        }
        return icon as React.ReactNode;
    };

    return (
        <YStack flex={1} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 24 }}>
            <Circle size="$8" background="$color3" style={{ marginBottom: 16 }}>
                {renderIcon()}
            </Circle>
            <Text fontSize="$6" fontWeight="600" color="$color12" style={{ textAlign: 'center', marginBottom: 8 }}>
                {heading}
            </Text>
            {body ? (
                <Text fontSize="$4" color="$color10" style={{ textAlign: 'center' }}>
                    {body}
                </Text>
            ) : null}
            {actionLabel && onAction ? (
                <Button
                    style={{ marginTop: 16 }}
                    size="$4"
                    onPress={onAction}
                    disabled={isLoading}
                    background="olive"
                    opacity={isLoading ? 0.7 : 1}
                    pressStyle={{ background: 'olive' }}
                >
                    <XStack style={{ alignItems: 'center', gap: 8 }}>
                        {isLoading ? <Loader2 size={16} color="#FFF" /> : null}
                        <Text color="white" fontWeight="700">{actionLabel}</Text>
                    </XStack>
                </Button>
            ) : null}
        </YStack>
    );
}




