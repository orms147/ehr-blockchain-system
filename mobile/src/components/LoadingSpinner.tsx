import React from 'react';
import { YStack, Spinner, Text } from 'tamagui';

interface LoadingSpinnerProps {
    message?: string;
    fullScreen?: boolean;
    size?: 'small' | 'medium' | 'large';
}

export default function LoadingSpinner({
    message = 'Dang tai du lieu...',
    fullScreen = true,
    size = 'large',
}: LoadingSpinnerProps) {
    const spinnerSize = size === 'small' ? 'small' : size === 'medium' ? 'large' : 'large';

    return (
        <YStack
            flex={fullScreen ? 1 : undefined}
            background={fullScreen ? '$background' : 'transparent'}
            style={{ justifyContent: 'center', alignItems: 'center', padding: 16 }}
        >
            <Spinner size={spinnerSize} color="olive" />
            <Text color="$color11" fontSize="$5" fontWeight="500" style={{ marginTop: 16 }}>
                {message}
            </Text>
        </YStack>
    );
}



