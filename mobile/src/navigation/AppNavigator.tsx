import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Home, FileText, Bell, User, Stethoscope, Send, Building2, Users, Landmark, Clock, Shield, Settings, Plus, Award } from 'lucide-react-native';

import LoginScreen from '../screens/LoginScreen';
import LandingScreen from '../screens/LandingScreen';
import DashboardScreen from '../screens/DashboardScreen';
import RecordsScreen from '../screens/RecordsScreen';
import RequestsScreen from '../screens/RequestsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RecordDetailScreen from '../screens/RecordDetailScreen';
import AccessLogScreen from '../screens/AccessLogScreen';
import LoadingSpinner from '../components/LoadingSpinner';

// Doctor Screens
import DoctorDashboardScreen from '../screens/doctor/DoctorDashboardScreen';
import DoctorOutgoingScreen from '../screens/doctor/DoctorOutgoingScreen';
import DoctorRequestAccessScreen from '../screens/doctor/DoctorRequestAccessScreen';
import DoctorExpiredRecordsScreen from '../screens/doctor/DoctorExpiredRecordsScreen';

// Org Screens
import OrgDashboardScreen from '../screens/org/OrgDashboardScreen';
import OrgMembersScreen from '../screens/org/OrgMembersScreen';
import OrgPendingVerificationsScreen from '../screens/org/OrgPendingVerificationsScreen';

// Ministry Screens
import MinistryDashboardScreen from '../screens/ministry/MinistryDashboardScreen';

// Common Screens
import SettingsScreen from '../screens/SettingsScreen';

// Store
import useAuthStore from '../store/authStore';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Shared tab bar style
const sharedTabOptions: BottomTabNavigationOptions = {
    tabBarStyle: { paddingBottom: 5, paddingTop: 5, height: 60 },
    headerShown: true,
    headerStyle: { backgroundColor: '#fff', elevation: 0, shadowOpacity: 0, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    headerTitleStyle: { fontWeight: '600', color: '#0f172a' },
};

// ──── PATIENT TABS ────
function PatientTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'Dashboard') return <Home color={color} size={size} />;
                    if (route.name === 'Records') return <FileText color={color} size={size} />;
                    if (route.name === 'AccessLog') return <Shield color={color} size={size} />;
                    if (route.name === 'Requests') return <Bell color={color} size={size} />;
                    if (route.name === 'Profile') return <User color={color} size={size} />;
                    return null;
                },
                tabBarActiveTintColor: '#2563EB',
                tabBarInactiveTintColor: '#94A3B8',
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Tổng quan', headerShown: false }} />
            <Tab.Screen name="Records" component={RecordsScreen} options={{ title: 'Hồ sơ' }} />
            <Tab.Screen name="AccessLog" component={AccessLogScreen} options={{ title: 'Truy cập' }} />
            <Tab.Screen name="Requests" component={RequestsScreen} options={{ title: 'Yêu cầu' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Cá nhân' }} />
        </Tab.Navigator>
    );
}

// ──── DOCTOR TABS ────
function DoctorTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'DoctorDashboard') return <Stethoscope color={color} size={size} />;
                    if (route.name === 'Expired') return <Clock color={color} size={size} />;
                    if (route.name === 'RequestAccess') return <Plus color={color} size={size} />;
                    if (route.name === 'Outgoing') return <Send color={color} size={size} />;
                    if (route.name === 'Profile') return <User color={color} size={size} />;
                    return null;
                },
                tabBarActiveTintColor: '#0D9488',
                tabBarInactiveTintColor: '#94A3B8',
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="DoctorDashboard" component={DoctorDashboardScreen} options={{ title: 'Hồ sơ', headerShown: false }} />
            <Tab.Screen name="Expired" component={DoctorExpiredRecordsScreen} options={{ title: 'Hết hạn' }} />
            <Tab.Screen name="RequestAccess" component={DoctorRequestAccessScreen} options={{ title: 'Yêu cầu' }} />
            <Tab.Screen name="Outgoing" component={DoctorOutgoingScreen} options={{ title: 'Đã gửi' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Cá nhân' }} />
        </Tab.Navigator>
    );
}

// ──── ORG TABS ────
function OrgTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'OrgDashboard') return <Building2 color={color} size={size} />;
                    if (route.name === 'Members') return <Users color={color} size={size} />;
                    if (route.name === 'Verifications') return <Award color={color} size={size} />;
                    if (route.name === 'Profile') return <User color={color} size={size} />;
                    return null;
                },
                tabBarActiveTintColor: '#7C3AED',
                tabBarInactiveTintColor: '#94A3B8',
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="OrgDashboard" component={OrgDashboardScreen} options={{ title: 'Tổ chức', headerShown: false }} />
            <Tab.Screen name="Members" component={OrgMembersScreen} options={{ title: 'Thành viên' }} />
            <Tab.Screen name="Verifications" component={OrgPendingVerificationsScreen} options={{ title: 'Xác thực' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Cá nhân' }} />
        </Tab.Navigator>
    );
}

// ──── MINISTRY TABS ────
function MinistryTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'MinistryDashboard') return <Landmark color={color} size={size} />;
                    if (route.name === 'Profile') return <User color={color} size={size} />;
                    return null;
                },
                tabBarActiveTintColor: '#DC2626',
                tabBarInactiveTintColor: '#94A3B8',
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="MinistryDashboard" component={MinistryDashboardScreen} options={{ title: 'Bộ Y tế', headerShown: false }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Cá nhân' }} />
        </Tab.Navigator>
    );
}

// ──── ROLE ROUTER ────
function RoleBasedTabs() {
    const { activeRole } = useAuthStore();

    switch (activeRole) {
        case 'doctor':
            return <DoctorTabs />;
        case 'org':
        case 'organization':
            return <OrgTabs />;
        case 'ministry':
        case 'admin':
            return <MinistryTabs />;
        case 'patient':
        default:
            return <PatientTabs />;
    }
}

// ──── MAIN STACK ────
function MainStackNavigator() {
    return (
        <Stack.Navigator>
            <Stack.Screen 
                name="MainTabs" 
                component={RoleBasedTabs} 
                options={{ headerShown: false }} 
            />
            <Stack.Screen 
                name="RecordDetail" 
                component={RecordDetailScreen} 
                options={{ title: 'Chi tiết hồ sơ' }} 
            />
            <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: 'Cài đặt' }}
            />
        </Stack.Navigator>
    );
}

// ──── ROOT NAVIGATOR ────
export default function AppNavigator() {
    const { isAuthenticated, isLoading } = useAuthStore();

    if (isLoading) {
        return <LoadingSpinner message="Dang khoi phuc phien dang nhap..." />;
    }

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!isAuthenticated ? (
                    <>
                        <Stack.Screen name="Landing" component={LandingScreen} />
                        <Stack.Screen name="Login" component={LoginScreen} />
                    </>
                ) : (
                    <Stack.Screen name="MainRoot" component={MainStackNavigator} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}


