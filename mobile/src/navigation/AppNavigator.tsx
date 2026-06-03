import React, { useEffect, useMemo } from 'react';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { navigationRef } from '../lib/navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import {
    Home,
    Files,
    ShieldCheck,
    CircleUser,
    Stethoscope,
    Inbox,
    Users,
    Share2,
    Building2,
    LayoutDashboard,
    Award,
    Landmark,
} from 'lucide-react-native';

import LoginScreen from '../screens-v2/LoginScreen';
import LandingScreen from '../screens-v2/LandingScreen';
import MfaOnboardingModal from '../components/MfaOnboardingModal';
import DashboardScreen from '../screens-v2/DashboardScreen';
import RecordsScreen from '../screens-v2/RecordsScreen';
import RequestsScreen from '../screens-v2/RequestsScreen';
import ProfileScreen from '../screens-v2/ProfileScreen';
import RecordDetailScreen from '../screens-v2/RecordDetailScreen';
import CreateRecordScreen from '../screens-v2/CreateRecordScreen';
import AccessLogScreen from '../screens-v2/AccessLogScreen';
import DelegationScreen from '../screens-v2/DelegationScreen';
import LoadingSpinner from '../components/LoadingSpinner';

import DoctorDashboardScreen from '../screens-v2/doctor/DoctorDashboardScreen';
import DoctorOutgoingScreen from '../screens-v2/doctor/DoctorOutgoingScreen';
import DoctorRequestAccessScreen from '../screens-v2/doctor/DoctorRequestAccessScreen';
import DoctorExpiredRecordsScreen from '../screens-v2/doctor/DoctorExpiredRecordsScreen';
import DoctorCreateUpdateScreen from '../screens-v2/doctor/DoctorCreateUpdateScreen';
import DoctorDelegatableRecordsScreen from '../screens-v2/doctor/DoctorDelegatableRecordsScreen';
import DoctorDelegatedPatientsScreen from '../screens-v2/doctor/DoctorDelegatedPatientsScreen';
import DoctorOutgoingSharesScreen from '../screens-v2/doctor/DoctorOutgoingSharesScreen';
import EmergencyLookupScreen from '../screens-v2/doctor/EmergencyLookupScreen';
import CredentialSubmitScreen from '../screens-v2/doctor/CredentialSubmitScreen';
import TrustedContactsScreen from '../screens-v2/TrustedContactsScreen';

import OrgDashboardScreen from '../screens-v2/org/OrgDashboardScreen';
import OrgMembersScreen from '../screens-v2/org/OrgMembersScreen';
import OrgPendingVerificationsScreen from '../screens-v2/org/OrgPendingVerificationsScreen';

import MinistryDashboardScreen from '../screens-v2/ministry/MinistryDashboardScreen';
import MinistryCreateOrgScreen from '../screens-v2/ministry/MinistryCreateOrgScreen';
import MinistryVerifyDoctorScreen from '../screens-v2/ministry/MinistryVerifyDoctorScreen';
import MinistryOrgDetailScreen from '../screens-v2/ministry/MinistryOrgDetailScreen';
import SettingsScreen from '../screens-v2/SettingsScreen';
import EditProfileScreen from '../screens-v2/EditProfileScreen';
import RoleSelectionScreen from '../screens-v2/RoleSelectionScreen';
import BiometricSettingsScreen from '../screens-v2/BiometricSettingsScreen';
import EmergencyProfileScreen from '../screens-v2/EmergencyProfileScreen';
import ReceiptStandaloneScreen from '../screens-v2/ReceiptStandaloneScreen';
import useAuthStore from '../store/authStore';
import { healLocalRecordCache } from '../services/localRecordHealer.service';
import { useEhrPalette } from '../constants/uiColors';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function useNavigationTheme() {
    const palette = useEhrPalette();
    return useMemo(() => ({
        ...DefaultTheme,
        dark: palette.EHR_SURFACE === '#0F1419',
        colors: {
            ...DefaultTheme.colors,
            primary: palette.EHR_PRIMARY,
            background: palette.EHR_SURFACE,
            card: palette.EHR_SURFACE_LOWEST,
            text: palette.EHR_ON_SURFACE,
            border: palette.EHR_OUTLINE_VARIANT,
            notification: palette.EHR_SECONDARY,
        },
    }), [palette]);
}

function useSharedTabOptions(): BottomTabNavigationOptions {
    const palette = useEhrPalette();
    return useMemo(() => ({
        tabBarStyle: {
            paddingBottom: 8,
            paddingTop: 8,
            height: 68,
            backgroundColor: palette.EHR_SURFACE_LOWEST,
            borderTopWidth: 0.5,
            borderTopColor: palette.EHR_OUTLINE_VARIANT,
        },
        tabBarLabelStyle: {
            fontSize: 10.5,
            letterSpacing: 0.2,
            fontWeight: '500' as const,
        },
        tabBarActiveTintColor: palette.EHR_PRIMARY,
        tabBarInactiveTintColor: palette.EHR_ON_SURFACE_VARIANT,
        headerShown: true,
        headerStyle: {
            backgroundColor: palette.EHR_SURFACE,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0.5,
            borderBottomColor: palette.EHR_OUTLINE_VARIANT,
        },
        headerTitleStyle: { fontWeight: '700' as const, color: palette.EHR_ON_SURFACE },
        headerTintColor: palette.EHR_ON_SURFACE,
    }), [palette]);
}

function PatientTabs() {
    const sharedTabOptions = useSharedTabOptions();
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'Dashboard') return <Home color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'Records') return <Files color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'AccessLog') return <ShieldCheck color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'Profile') return <CircleUser color={color} size={size} strokeWidth={1.75} />;
                    return null;
                },
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Hôm nay', headerShown: false }} />
            <Tab.Screen name="Records" component={RecordsScreen} options={{ title: 'Hồ sơ' }} />
            <Tab.Screen name="AccessLog" component={AccessLogScreen} options={{ title: 'Quyền' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Cá nhân' }} />
        </Tab.Navigator>
    );
}

function DoctorTabs() {
    const sharedTabOptions = useSharedTabOptions();
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'DoctorDashboard') return <Home color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'RequestAccess') return <Inbox color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'DoctorOutgoing') return <Users color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'DoctorOutgoingShares') return <Share2 color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'Profile') return <CircleUser color={color} size={size} strokeWidth={1.75} />;
                    return null;
                },
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="DoctorDashboard" component={DoctorDashboardScreen} options={{ title: 'Hôm nay', headerShown: false }} />
            <Tab.Screen name="RequestAccess" component={DoctorRequestAccessScreen} options={{ title: 'Yêu cầu' }} />
            <Tab.Screen name="DoctorOutgoing" component={DoctorOutgoingScreen} options={{ title: 'Bệnh nhân' }} />
            <Tab.Screen name="DoctorOutgoingShares" component={DoctorOutgoingSharesScreen} options={{ title: 'Chia sẻ' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Cá nhân' }} />
        </Tab.Navigator>
    );
}

function OrgTabs() {
    const sharedTabOptions = useSharedTabOptions();
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'OrgDashboard') return <LayoutDashboard color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'Members') return <Stethoscope color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'Verifications') return <Award color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'Profile') return <CircleUser color={color} size={size} strokeWidth={1.75} />;
                    return null;
                },
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="OrgDashboard" component={OrgDashboardScreen} options={{ title: 'Tổng quan', headerShown: false }} />
            <Tab.Screen name="Members" component={OrgMembersScreen} options={{ title: 'Bác sĩ' }} />
            <Tab.Screen name="Verifications" component={OrgPendingVerificationsScreen} options={{ title: 'Xác thực' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Cá nhân' }} />
        </Tab.Navigator>
    );
}

function MinistryTabs() {
    const sharedTabOptions = useSharedTabOptions();
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                tabBarIcon: ({ color, size }) => {
                    if (route.name === 'MinistryDashboard') return <Landmark color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'MinistryVerifyDoctor') return <Stethoscope color={color} size={size} strokeWidth={1.75} />;
                    if (route.name === 'Profile') return <CircleUser color={color} size={size} strokeWidth={1.75} />;
                    return null;
                },
                ...sharedTabOptions,
            })}
        >
            <Tab.Screen name="MinistryDashboard" component={MinistryDashboardScreen} options={{ title: 'Tổng quan', headerShown: false }} />
            <Tab.Screen name="MinistryVerifyDoctor" component={MinistryVerifyDoctorScreen} options={{ title: 'Bác sĩ' }} />
            <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Cá nhân' }} />
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
                options={{ title: 'Tạo hồ sơ mới' }}
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
            <Stack.Screen
                name="Requests"
                component={RequestsScreen}
                options={{ title: 'Yêu cầu truy cập' }}
            />
            <Stack.Screen
                name="DoctorCreateUpdate"
                component={DoctorCreateUpdateScreen}
                options={{ title: 'Cập nhật hồ sơ' }}
            />
            <Stack.Screen
                name="Delegation"
                component={DelegationScreen}
                options={{ title: 'Ủy quyền' }}
            />
            <Stack.Screen
                name="DoctorDelegatableRecords"
                component={DoctorDelegatableRecordsScreen}
                options={{ title: 'Hồ sơ ủy quyền' }}
            />
            <Stack.Screen
                name="DoctorDelegatedPatients"
                component={DoctorDelegatedPatientsScreen}
                options={{ title: 'Bệnh nhân ủy quyền' }}
            />
            <Stack.Screen
                name="DoctorExpiredRecords"
                component={DoctorExpiredRecordsScreen}
                options={{ title: 'Hồ sơ hết hạn / bị thu hồi' }}
            />
            <Stack.Screen
                name="EditProfile"
                component={EditProfileScreen}
                options={{ title: 'Chỉnh sửa hồ sơ' }}
            />
            <Stack.Screen
                name="TrustedContacts"
                component={TrustedContactsScreen}
                options={{ title: 'Người thân tin cậy' }}
            />
            <Stack.Screen
                name="EmergencyLookup"
                component={EmergencyLookupScreen}
                options={{ title: 'Tra cứu cấp cứu' }}
            />
            <Stack.Screen
                name="BiometricSettings"
                component={BiometricSettingsScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="EmergencyProfile"
                component={EmergencyProfileScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="Receipt"
                component={ReceiptStandaloneScreen}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="MinistryCreateOrg"
                component={MinistryCreateOrgScreen}
                options={{ title: 'Tạo cơ sở y tế' }}
            />
            <Stack.Screen
                name="MinistryOrgDetail"
                component={MinistryOrgDetailScreen}
                options={{ title: 'Hồ sơ cơ sở' }}
            />
            <Stack.Screen
                name="CredentialSubmit"
                component={CredentialSubmitScreen}
                options={{ title: 'Xác minh CCHN' }}
            />
        </Stack.Navigator>
    );
}

export default function AppNavigator() {
    const { isAuthenticated, isLoading, needsRoleSelection, needsRoleRegistration } = useAuthStore();
    const navigationTheme = useNavigationTheme();

    // Run the root-walk migration healer once after login. Idempotent — subsequent
    // calls noop via AsyncStorage flag.
    useEffect(() => {
        if (isAuthenticated) {
            healLocalRecordCache();
        }
    }, [isAuthenticated]);

    if (isLoading) {
        return <LoadingSpinner message={'Đang khôi phục phiên đăng nhập...'} />;
    }

    return (
        <NavigationContainer ref={navigationRef} theme={navigationTheme}>
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
            {/* §19 R4: MFA onboarding 1 lần sau login + disclosure NĐ 13/2023. */}
            {isAuthenticated && !needsRoleSelection && !needsRoleRegistration && (
                <MfaOnboardingModal />
            )}
        </NavigationContainer>
    );
}
