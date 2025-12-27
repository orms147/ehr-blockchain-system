// useSocket Hook - Real-time WebSocket connection with auto JWT auth
import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { toast } from '@/components/ui/use-toast';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Hook for WebSocket connection with JWT authentication
 * @param {Object} handlers - Event handlers { eventName: callback }
 * @param {boolean} showNotifications - Show toast notifications for events
 * @returns {Object} - Socket connection status and methods
 */
export function useSocket(handlers = {}, showNotifications = true) {
    const socketRef = useRef(null);
    const handlersRef = useRef(handlers);

    // Update handlers ref when handlers change
    useEffect(() => {
        handlersRef.current = handlers;
    }, [handlers]);

    useEffect(() => {
        // Get JWT from localStorage
        const token = typeof window !== 'undefined'
            ? localStorage.getItem('jwt') || localStorage.getItem('jwt_token')
            : null;

        if (!token) {
            return;
        }

        // Create socket connection with auth
        const socket = io(BACKEND_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        // Connection events
        socket.on('connect', () => {
        });

        socket.on('disconnect', (reason) => {
        });

        socket.on('connect_error', (error) => {
            console.error('🔌 WebSocket connection error:', error.message);
        });

        // Register event handlers
        Object.entries(handlersRef.current).forEach(([event, handler]) => {
            socket.on(event, (data) => {
                handler(data);
            });
        });

        // Default notification handlers
        if (showNotifications) {
            socket.on('record:shared', (data) => {
                toast({
                    title: '📥 Hồ sơ mới được chia sẻ!',
                    description: data.recordTitle || 'Có người chia sẻ hồ sơ với bạn',
                    className: 'bg-green-50 border-green-200 text-green-800',
                });
            });

            socket.on('consent:updated', (data) => {
                if (data.status === 'revoked') {
                    toast({
                        title: '🔒 Quyền truy cập đã bị thu hồi',
                        description: 'Một hồ sơ đã bị thu hồi quyền truy cập',
                        variant: 'destructive',
                    });
                }
            });
        }

        // Cleanup on unmount
        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [showNotifications]);

    // Method to manually emit events
    const emit = useCallback((event, data) => {
        if (socketRef.current?.connected) {
            socketRef.current.emit(event, data);
        }
    }, []);

    return {
        socket: socketRef.current,
        emit,
        isConnected: socketRef.current?.connected || false,
    };
}

export default useSocket;
