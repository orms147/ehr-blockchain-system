import React from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { Home, FileText, Bell, User, Stethoscope, Send, Building2, Users, Landmark, Clock, Shield, Award, Plus } from 'lucide-react-native';

import LoginScreen from '../screens/LoginScreen';
import LandingScreen from '../screens/LandingScreen';
import DashboardScreen from '../screens/DashboardScreen';
import RecordsScreen from '../screens/RecordsScreen';
import RequestsScreen from '../screens/RequestsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RecordDetailScreen from '../screens/RecordDetailScreen';
import CreateRecordScreen from '../screens/CreateRecordScreen';
import AccessLogScreen from '../screens/AccessLogScreen';
import LoadingSpinner from '../components/LoadingSpinner';

import DoctorDashboardScreen from '../screens/doctor/DoctorDashboardScreen';
import DoctorOutgoingScreen from '../screens/doctor/DoctorOutgoingScreen';
import DoctorRequestAccessScreen from '../screens/doctor/DoctorRequestAccessScreen';
import DoctorExpiredRecordsScreen from '../screens/doctor/DoctorExpiredRecordsScreen';
import DoctorCreateUpdateScreen from '../screens/doctor/DoctorCreateUpdateScreen';

import OrgDashboardScreen from '../screens/org/OrgDashboardScreen';
import OrgMembersScreen from '../screens/org/OrgMembersScreen';
import OrgPendingVerificationsScreen from '../screens/org/OrgPendingVerificationsScreen';

import MinistryDashboardScreen from '../screens/ministry/MinistryDashboardScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import RoleSelectionScreen from '../screens/RoleSelectionScreen';
import useAuthStore from '../store/authStore';
import {
    EHR_ON_SURFACE,
    EHR_ON_SURFACE_VARIANT,
    EHR_OUTLINE_VARIANT,
    EHR_PRIMARY,
    EHR_SECONDARY,
    EHR_SURFACE,
    EHR_SURFACE_LOWEST,
} from '../constants/uiColors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navigationTheme = {
    ...DefaultTheme,
    colors: {
        ...DefaultTheme.colors,
        primary: EHR_PRIMARY,
        background: EHR_SURFACE,
        card: EHR_SURFACE_LOWEST,
        text: EHR_ON_SURFACE,
        border: EHR_OUTLINE_VARIANT,
        notification: EHR_SECONDARY,
    },
};

const sharedTabOptions: BottomTabNavigationOptions = {
    tabBarStyle: {
        paddingBottom: 8,
        paddingTop: 8,
        height: 68,
        backgroundColor: EHR_SURFACE_LOWEST,
        borderTopWidth: 1,
        borderTopColor: EHR_OUTLINE_VARIANT,
    },
    headerShown: true,
    headerStyle: { backgroundColor: EHR_SURFACE, elevation: 0, shadowOpacity: 0, borderBottomWidth: 1, borderBottomColor: EHR_OUTLINE_VARIANT },
    headerTitleStyle: { fontWeight: '700', color: EHR_ON_SURFACE },
    tabBarActiveTintColor: EHR_PRIMARY,
    tabBarInactiveTintColor: EHR_ON_SURFACE_VARIANT,
};

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
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'T\u1ED5ng quan', headerShown: false }} />
            <Tab.Screen name="Records" component={RecordsScreen} options={{ title: 'H\u1ED3 s\u01A1' }} />
            <Tab.Screen name="AccessLog" component={AccessLogScreen} options={{ title: 'Truy c\u1EADp' }} />
            <Tab.Screen name="Requests" component={RequestsScreen} options={{ title: 'Y\u00EAu c\u1EA7u' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'C\u00E1 nh\u00E2n' }} />
        </Tab.Navigator>
    );
}

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
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="DoctorDashboard" component={DoctorDashboardScreen} options={{ title: 'H\u1ED3 s\u01A1', headerShown: false }} />
            <Tab.Screen name="Expired" component={DoctorExpiredRecordsScreen} options={{ title: 'H\u1EBFt h\u1EA1n' }} />
            <Tab.Screen name="RequestAccess" component={DoctorRequestAccessScreen} options={{ title: 'Y\u00EAu c\u1EA7u' }} />
            <Tab.Screen name="Outgoing" component={DoctorOutgoingScreen} options={{ title: '\u0110\u00E3 g\u1EEDi' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'C\u00E1 nh\u00E2n' }} />
        </Tab.Navigator>
    );
}

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
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="OrgDashboard" component={OrgDashboardScreen} options={{ title: 'T\u1ED5 ch\u1EE9c', headerShown: false }} />
            <Tab.Screen name="Members" component={OrgMembersScreen} options={{ title: 'Th\u00E0nh vi\u00EAn' }} />
            <Tab.Screen name="Verifications" component={OrgPendingVerificationsScreen} options={{ title: 'X\u00E1c th\u1EF1c' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'C\u00E1 nh\u00E2n' }} />
        </Tab.Navigator>
    );
}

function MinistryTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'MinistryDashboard') return <Landmark color={color} size={size} />;
                    if (route.name === 'Profile') return <User color={color} size={size} />;
                    return null;
                },
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="MinistryDashboard" component={MinistryDashboardScreen} options={{ title: 'B\u1ED9 Y t\u1EBF', headerShown: false }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'C\u00E1 nh\u00E2n' }} />
        </Tab.Navigator>
    );
}

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

function MainStackNavigator() {
    return (
        <Stack.Navigator>
            <Stack.Screen
                name="MainTabs"
                component={RoleBasedTabs}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="CreateRecord"
                component={CreateRecordScreen}
                options={{ title: 'T\u1EA1o h\u1ED3 s\u01A1 m\u1EDBi' }}
            />
            <Stack.Screen
                name="RecordDetail"
                component={RecordDetailScreen}
                options={{ title: 'Chi ti\u1EBFt h\u1ED3 s\u01A1' }}
            />
            <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: 'C\u00E0i \u0111\u1EB7t' }}
            />
            <Stack.Screen
                name="DoctorCreateUpdate"
                component={DoctorCreateUpdateScreen}
                options={{ title: 'C\u1EADp nh\u1EADt h\u1ED3 s\u01A1' }}
            />
            <Stack.Screen
                name="EditProfile"
                component={EditProfileScreen}
                options={{ title: 'Ch\u1EC9nh s\u1EEDa h\u1ED3 s\u01A1' }}
            />
        </Stack.Navigator>
    );
}

export default function AppNavigator() {
    const { isAuthenticated, isLoading, needsRoleSelection, needsRoleRegistration } = useAuthStore();

    if (isLoading) {
        return <LoadingSpinner message={'\u0110ang kh\u00F4i ph\u1EE5c phi\u00EAn \u0111\u0103ng nh\u1EADp...'} />;
    }

    return (
        <NavigationContainer theme={navigationTheme}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {!isAuthenticated ? (
                    <>
                        <Stack.Screen name="Landing" component={LandingScreen} />
                        <Stack.Screen name="Login" component={LoginScreen} />
                    </>
                ) : needsRoleRegistration || needsRoleSelection ? (
                    <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
                ) : (
                    <Stack.Screen name="MainRoot" component={MainStackNavigator} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
}
