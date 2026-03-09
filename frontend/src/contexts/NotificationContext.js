"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from '@/components/ui/use-toast';
import { Bell } from 'lucide-react';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    // Mock Polling for notifications (Replace with real API later)
    useEffect(() => {
        const interval = setInterval(() => {
            // In a real app, call API here
            // fetchNotifications();
            // For now, static count just to show UI
            setUnreadCount(prev => prev);
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    const addNotification = useCallback((notification) => {
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);

        toast({
            title: notification.title,
            description: notification.message,
            action: <Bell className="w-4 h-4" />
        });
    }, []);

    const markAllRead = useCallback(() => {
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    const clearNotifications = useCallback(() => {
        setNotifications([]);
        setUnreadCount(0);
    }, []);

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            addNotification,
            markAllRead,
            clearNotifications
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    return useContext(NotificationContext);
}
