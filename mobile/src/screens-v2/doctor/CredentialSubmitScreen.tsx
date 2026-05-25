// CredentialSubmitScreen — Wave M per viehp-credential-submit.html.
//
// Doctor submits GPHN/CCHN credentials to a chosen org for verification.
// 5 states driven by current verification status (GET /api/verification/status):
//   idle      — empty form (A1): banner cinnabar warn + form fields + file list + ký CTA
//   signing   — fields disabled, CTA spinner (A2): "Đang ký bằng Web3Auth…"
//   submitted — pending hero (A3): clock glyph + timer + summary KV + hash
//   approved  — jade hero (A4): check glyph + hiệu lực KV + duyệt info
//   rejected  — danger hero (A5): X glyph + reason card + "Sửa và gửi lại" CTA
//
// File upload: UI present per Claude Design decision (Q2 — keep UI, mock backend).
// Stores filename + size locally → POST with documentCid as placeholder.
// Production should add real IPFS upload via expo-document-picker → ipfs.service.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Text, XStack, YStack } from 'tamagui';
import {
    AlertTriangle,
    Building2,
    Check,
    Clock,
    FilePlus2,
    FileText,
    Image as ImageIcon,
    X,
} from 'lucide-react-native';

import LoadingSpinner from '../../components/LoadingSpinner';
import verificationService from '../../services/verification.service';
import orgService from '../../services/org.service';
import useAuthStore from '../../store/authStore';
import { useEhrPalette } from '../../constants/uiColors';

const SERIF = 'Fraunces_400Regular';
const SERIF_ITALIC = 'Fraunces_400Regular_Italic';
const SANS = 'DMSans_400Regular';
const SANS_SEMI = 'DMSans_600SemiBold';
const MONO = 'monospace';

type Status = 'idle' | 'signing' | 'submitted' | 'approved' | 'rejected';

type FileEntry = {
    name: string;
    size: number; // bytes
    kind: 'PDF' | 'IMG' | 'DOC';
};

type StatusResponse = {
    verified?: boolean;
    pendingRequest?: any;
    approvedRequest?: any;
    rejectedRequest?: any;
    rejectionReason?: string | null;
};

type OrgOption = { id: string; name: string; chainOrgId?: string | number };

const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const detectKind = (name: string): FileEntry['kind'] => {
    const ext = name.toLowerCase().split('.').pop() || '';
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'IMG';
    if (ext === 'pdf') return 'PDF';
    return 'DOC';
};

const formatTimeAgo = (iso?: string | null): string => {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 60) return `${min} phút trước`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} giờ trước`;
    const days = Math.floor(hr / 24);
    return `${days} ngày trước`;
};

const formatDotDate = (iso?: string | null): string => {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}·${mm}·${d.getFullYear()}`;
    } catch {
        return '—';
    }
};

export default function CredentialSubmitScreen({ navigation }: any) {
    const palette = useEhrPalette();
    const { user } = useAuthStore();

    const [status, setStatus] = useState<Status>('idle');
    const [serverData, setServerData] = useState<StatusResponse | null>(null);
    const [orgs, setOrgs] = useState<OrgOption[]>([]);
    const [selectedOrg, setSelectedOrg] = useState<OrgOption | null>(null);
    const [licenseNumber, setLicenseNumber] = useState('');
    const [specialty, setSpecialty] = useState('');
    const [files, setFiles] = useState<FileEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchStatus = useCallback(async () => {
        try {
            const [statusRes, orgsRes]: any = await Promise.all([
                verificationService.getMyVerificationStatus(),
                orgService.getAllOrganizations().catch(() => []),
            ]);
            setServerData(statusRes || null);
            const orgList: OrgOption[] = Array.isArray(orgsRes?.organizations)
                ? orgsRes.organizations.map((o: any) => ({
                    id: o.id || String(o.address || ''),
                    name: o.name || o.orgName || 'Tổ chức',
                    chainOrgId: o.chainOrgId,
                }))
                : [];
            setOrgs(orgList);

            // Derive UI status from response
            if (statusRes?.approvedRequest) {
                setStatus('approved');
                // Pre-fill from approved request for display
                const r = statusRes.approvedRequest;
                setLicenseNumber(r.licenseNumber || '');
                setSpecialty(r.specialty || '');
                if (r.organization) {
                    const match = orgList.find((o) => o.name === r.organization);
                    setSelectedOrg(match || { id: '0', name: r.organization });
                }
            } else if (statusRes?.pendingRequest) {
                setStatus('submitted');
                const r = statusRes.pendingRequest;
                setLicenseNumber(r.licenseNumber || '');
                setSpecialty(r.specialty || '');
                if (r.organization) {
                    const match = orgList.find((o) => o.name === r.organization);
                    setSelectedOrg(match || { id: '0', name: r.organization });
                }
            } else if (statusRes?.rejectedRequest) {
                setStatus('rejected');
                const r = statusRes.rejectedRequest;
                setLicenseNumber(r.licenseNumber || '');
                setSpecialty(r.specialty || '');
                if (r.organization) {
                    const match = orgList.find((o) => o.name === r.organization);
                    setSelectedOrg(match || { id: '0', name: r.organization });
                }
            } else {
                setStatus('idle');
            }
        } catch (err) {
            console.warn('Failed to load verification status:', err);
            setStatus('idle');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const pickFile = async () => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
                Alert.alert('Thiếu quyền truy cập ảnh', 'Vui lòng cấp quyền thư viện ảnh để đính kèm CCHN/CCCD.');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: false,
                quality: 0.7,
                exif: false,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            const name = asset.fileName || `file-${Date.now()}.jpg`;
            setFiles((prev) => [
                ...prev,
                {
                    name,
                    size: asset.fileSize || 0,
                    kind: detectKind(name),
                },
            ]);
        } catch (err: any) {
            Alert.alert('Lỗi chọn tệp', err?.message || 'Không thể chọn tệp.');
        }
    };

    const handleSubmit = async () => {
        if (!selectedOrg) {
            Alert.alert('Thiếu cơ sở', 'Vui lòng chọn cơ sở xác minh.');
            return;
        }
        if (!licenseNumber.trim()) {
            Alert.alert('Thiếu CCHN', 'Vui lòng nhập số chứng chỉ hành nghề.');
            return;
        }
        if (!specialty.trim()) {
            Alert.alert('Thiếu chuyên khoa', 'Vui lòng nhập chuyên khoa.');
            return;
        }
        if (files.length === 0) {
            Alert.alert('Thiếu tài liệu', 'Vui lòng đính kèm ít nhất 1 tài liệu.');
            return;
        }

        setStatus('signing');
        try {
            // Mock IPFS upload — store filename list as documentCid placeholder
            // Production should upload each file to IPFS and concat CIDs.
            const fakeCid = `mock-${Date.now()}-${files.length}files`;
            const fileNames = files.map((f) => f.name).join(', ');

            await verificationService.submitVerification({
                fullName: user?.fullName || 'BS.',
                licenseNumber: licenseNumber.trim(),
                specialty: specialty.trim(),
                organization: selectedOrg.name,
                documentCid: fakeCid,
                documentType: fileNames.slice(0, 100),
            });

            await fetchStatus(); // Will set status='submitted'
            Alert.alert(
                'Đã gửi',
                'Hồ sơ xác minh đã được gửi. Cơ sở sẽ xem xét trong 1–3 ngày làm việc.',
            );
        } catch (err: any) {
            setStatus('idle');
            Alert.alert('Lỗi', err?.message || 'Không thể gửi hồ sơ. Vui lòng thử lại.');
        }
    };

    const handleResubmit = () => {
        // Move from 'rejected' state back to 'idle' to allow editing
        setStatus('idle');
    };

    if (isLoading) return <LoadingSpinner message="Đang tải trạng thái xác minh…" />;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.EHR_SURFACE }} edges={['right', 'left', 'bottom']}>
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                {/* Hero states (submitted/approved/rejected) take over the whole screen */}
                {status === 'submitted' && serverData?.pendingRequest ? (
                    <PendingHero request={serverData.pendingRequest} palette={palette} />
                ) : status === 'approved' && serverData?.approvedRequest ? (
                    <ApprovedHero request={serverData.approvedRequest} palette={palette} />
                ) : status === 'rejected' && serverData?.rejectedRequest ? (
                    <RejectedHero
                        request={serverData.rejectedRequest}
                        rejectionReason={serverData.rejectionReason || serverData.rejectedRequest.rejectionReason}
                        onResubmit={handleResubmit}
                        onContact={() => Alert.alert('Liên hệ', 'Liên hệ trực tiếp với cơ sở qua kênh nội bộ.')}
                        palette={palette}
                    />
                ) : (
                    <FormView
                        status={status}
                        orgs={orgs}
                        selectedOrg={selectedOrg}
                        onSelectOrg={setSelectedOrg}
                        licenseNumber={licenseNumber}
                        onLicenseChange={setLicenseNumber}
                        specialty={specialty}
                        onSpecialtyChange={setSpecialty}
                        files={files}
                        onAddFile={pickFile}
                        onRemoveFile={(i: number) => setFiles((f) => f.filter((_, idx) => idx !== i))}
                        onSubmit={handleSubmit}
                        palette={palette}
                    />
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ───────── FORM VIEW (idle + signing) ─────────
function FormView({
    status, orgs, selectedOrg, onSelectOrg, licenseNumber, onLicenseChange,
    specialty, onSpecialtyChange, files, onAddFile, onRemoveFile, onSubmit, palette,
}: any) {
    const isSigning = status === 'signing';

    return (
        <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
            {/* Warning banner (cinnabar) */}
            <View
                style={{
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    backgroundColor: `${palette.EHR_CINNABAR_DEEP}14`,
                    borderWidth: 0.5,
                    borderColor: `${palette.EHR_CINNABAR_DEEP}55`,
                    marginBottom: 18,
                    flexDirection: 'row',
                    gap: 10,
                }}
            >
                <AlertTriangle size={14} color={palette.EHR_CINNABAR_DEEP} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: SANS, fontSize: 12, color: palette.EHR_ON_SURFACE, lineHeight: 18 }}>
                    <Text style={{ color: palette.EHR_CINNABAR_DEEP, fontFamily: SANS_SEMI, fontWeight: '700' }}>
                        Cần thiết ·
                    </Text>{' '}
                    Bác sĩ phải được cơ sở xác minh chứng chỉ hành nghề trước khi tạo, đọc và ký hồ sơ y tế.
                </Text>
            </View>

            {/* Org picker */}
            <SectionLabel palette={palette}>Cơ sở xác minh</SectionLabel>
            <OrgPicker
                orgs={orgs}
                selected={selectedOrg}
                onSelect={onSelectOrg}
                disabled={isSigning}
                palette={palette}
            />

            {/* License number */}
            <SectionLabel palette={palette}>Số chứng chỉ hành nghề</SectionLabel>
            <FieldInput
                value={licenseNumber}
                onChangeText={onLicenseChange}
                placeholder="028294/HN-CCHN"
                mono
                editable={!isSigning}
                palette={palette}
            />

            {/* Specialty */}
            <SectionLabel palette={palette}>Chuyên khoa</SectionLabel>
            <FieldInput
                value={specialty}
                onChangeText={onSpecialtyChange}
                placeholder="Tim mạch"
                editable={!isSigning}
                palette={palette}
            />

            {/* File list */}
            <SectionLabel palette={palette}>Tài liệu kèm theo</SectionLabel>
            <View style={{ gap: 6 }}>
                {files.map((f: FileEntry, i: number) => (
                    <FileRow key={i} file={f} onRemove={isSigning ? undefined : () => onRemoveFile(i)} palette={palette} />
                ))}
                {!isSigning ? (
                    <Pressable
                        onPress={onAddFile}
                        style={({ pressed }) => ({
                            paddingVertical: 11,
                            paddingHorizontal: 14,
                            borderRadius: 10,
                            borderWidth: 0.5,
                            borderStyle: 'dashed',
                            borderColor: palette.EHR_OUTLINE,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            opacity: pressed ? 0.7 : 1,
                            marginTop: files.length > 0 ? 4 : 0,
                        })}
                    >
                        <FilePlus2 size={14} color={palette.EHR_ON_SURFACE} />
                        <Text style={{ fontFamily: SANS_SEMI, fontSize: 12.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}>
                            {files.length > 0 ? 'Thêm tài liệu khác' : 'Đính kèm CCHN + CCCD (mặt trước & sau)'}
                        </Text>
                    </Pressable>
                ) : null}
            </View>

            {/* Privacy note */}
            <View
                style={{
                    marginTop: 18,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                }}
            >
                <Text style={{ fontFamily: SANS, fontSize: 11, color: palette.EHR_TEXT_MUTED, lineHeight: 16 }}>
                    Hồ sơ này sẽ được mã hoá và ký bằng khoá Web3Auth của bạn. Cơ sở chỉ thấy hash + danh sách tài liệu cho đến khi bạn cấp quyền xem chi tiết.
                </Text>
            </View>

            {/* CTA */}
            <Pressable
                onPress={isSigning ? undefined : onSubmit}
                disabled={isSigning}
                style={({ pressed }) => ({
                    marginTop: 22,
                    paddingVertical: 16,
                    borderRadius: 12,
                    backgroundColor: palette.EHR_CINNABAR_DEEP,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 10,
                    opacity: isSigning ? 0.92 : pressed ? 0.85 : 1,
                })}
            >
                {isSigning ? <ActivityIndicator size="small" color="#FBF8F1" /> : null}
                <Text style={{ fontFamily: SANS_SEMI, fontSize: 15, fontWeight: '700', color: '#FBF8F1', letterSpacing: 0.1 }}>
                    {isSigning ? 'Đang ký bằng Web3Auth…' : 'Ký và gửi xác minh'}
                </Text>
            </Pressable>
        </View>
    );
}

function OrgPicker({ orgs, selected, onSelect, disabled, palette }: any) {
    const [open, setOpen] = useState(false);

    if (orgs.length === 0) {
        return (
            <View
                style={{
                    padding: 14,
                    borderRadius: 10,
                    borderWidth: 0.5,
                    borderStyle: 'dashed',
                    borderColor: palette.EHR_OUTLINE_SOFT,
                    marginBottom: 6,
                }}
            >
                <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_TEXT_MUTED, fontStyle: 'italic' }}>
                    Chưa có cơ sở y tế nào trong hệ thống. Vui lòng liên hệ Bộ Y tế.
                </Text>
            </View>
        );
    }

    return (
        <>
            <Pressable
                onPress={() => !disabled && setOpen((o) => !o)}
                disabled={disabled}
                style={({ pressed }) => ({
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    backgroundColor: palette.EHR_ON_SURFACE,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: open ? 6 : 0,
                    opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
                })}
            >
                <View
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        backgroundColor: palette.EHR_CINNABAR_DEEP,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Building2 size={14} color="#FBF8F1" />
                </View>
                <YStack style={{ flex: 1 }}>
                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 13, color: palette.EHR_SURFACE, fontWeight: '700' }}>
                        {selected?.name || 'Chọn cơ sở y tế'}
                    </Text>
                    {selected ? (
                        <Text style={{ fontFamily: MONO, fontSize: 10.5, color: 'rgba(251,248,241,0.6)', marginTop: 2 }}>
                            {selected.chainOrgId ? `org-${String(selected.chainOrgId).padStart(4, '0')}` : 'Mã chưa rõ'} · Đã đăng ký
                        </Text>
                    ) : null}
                </YStack>
                <Text style={{ fontSize: 11, color: 'rgba(251,248,241,0.7)', fontWeight: '600' }}>
                    {open ? 'Đóng' : 'Đổi'}
                </Text>
            </Pressable>

            {open ? (
                <View
                    style={{
                        marginBottom: 6,
                        borderRadius: 10,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE_SOFT,
                        backgroundColor: palette.EHR_SURFACE_LOWEST,
                        maxHeight: 240,
                    }}
                >
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {orgs.map((o: OrgOption, i: number) => (
                            <Pressable
                                key={o.id}
                                onPress={() => {
                                    onSelect(o);
                                    setOpen(false);
                                }}
                                style={({ pressed }) => ({
                                    paddingVertical: 11,
                                    paddingHorizontal: 14,
                                    borderBottomWidth: i === orgs.length - 1 ? 0 : 0.5,
                                    borderBottomColor: palette.EHR_OUTLINE_SOFT,
                                    opacity: pressed ? 0.7 : 1,
                                })}
                            >
                                <Text style={{ fontFamily: SANS_SEMI, fontSize: 13, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}>
                                    {o.name}
                                </Text>
                                {o.chainOrgId ? (
                                    <Text style={{ fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, marginTop: 2 }}>
                                        org-{String(o.chainOrgId).padStart(4, '0')}
                                    </Text>
                                ) : null}
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            ) : null}
        </>
    );
}

function FieldInput({ value, onChangeText, placeholder, mono, editable, palette }: any) {
    return (
        <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.EHR_TEXT_MUTED}
            editable={editable}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
                minHeight: 46,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                color: palette.EHR_ON_SURFACE,
                fontFamily: mono ? MONO : SANS,
                fontSize: 14,
                letterSpacing: mono ? 0.2 : 0,
                opacity: editable === false ? 0.55 : 1,
            }}
        />
    );
}

function FileRow({ file, onRemove, palette }: { file: FileEntry; onRemove?: () => void; palette: any }) {
    const Icon = file.kind === 'PDF' ? FileText : file.kind === 'IMG' ? ImageIcon : FileText;
    return (
        <View
            style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                backgroundColor: palette.EHR_SURFACE_LOWEST,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
            }}
        >
            <View
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: palette.EHR_SURFACE,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Icon size={14} color={palette.EHR_ON_SURFACE_VARIANT} />
            </View>
            <YStack style={{ flex: 1, minWidth: 0 }}>
                <Text
                    style={{ fontFamily: SANS_SEMI, fontSize: 12.5, color: palette.EHR_ON_SURFACE, fontWeight: '600' }}
                    numberOfLines={1}
                >
                    {file.name}
                </Text>
                <Text style={{ fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, marginTop: 1 }}>
                    {formatSize(file.size)} · {file.kind}
                </Text>
            </YStack>
            {onRemove ? (
                <Pressable onPress={onRemove} hitSlop={8}>
                    <X size={14} color={palette.EHR_TEXT_MUTED} />
                </Pressable>
            ) : (
                <Check size={14} color={palette.EHR_TERTIARY} />
            )}
        </View>
    );
}

function SectionLabel({ children, palette }: { children: React.ReactNode; palette: any }) {
    return (
        <Text
            style={{
                fontFamily: MONO,
                fontSize: 10.5,
                color: palette.EHR_TEXT_MUTED,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                fontWeight: '700',
                marginTop: 14,
                marginBottom: 6,
            }}
        >
            {children}
        </Text>
    );
}

// ───────── PENDING HERO (state A3) ─────────
function PendingHero({ request, palette }: any) {
    return (
        <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
            <View
                style={{
                    padding: 22,
                    borderRadius: 14,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                }}
            >
                <View
                    style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        borderWidth: 1.4,
                        borderColor: palette.EHR_CINNABAR_DEEP,
                        alignItems: 'center',
                        justifyContent: 'center',
                        alignSelf: 'flex-start',
                        marginBottom: 16,
                    }}
                >
                    <Clock size={24} color={palette.EHR_CINNABAR_DEEP} />
                </View>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 22,
                        fontWeight: '500',
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.3,
                        lineHeight: 28,
                    }}
                >
                    Đang chờ xác minh
                </Text>
                <Text
                    style={{
                        marginTop: 6,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        lineHeight: 19,
                    }}
                >
                    Cơ sở{' '}
                    <Text style={{ fontFamily: SERIF_ITALIC, fontStyle: 'italic' }}>
                        {request.organization}
                    </Text>{' '}
                    đang xem xét hồ sơ. Bạn sẽ nhận thông báo trong 1–3 ngày làm việc.
                </Text>

                <View
                    style={{
                        marginTop: 14,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: `${palette.EHR_CINNABAR_DEEP}14`,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.EHR_CINNABAR_DEEP }} />
                    <Text style={{ fontFamily: SANS, fontSize: 12, color: palette.EHR_ON_SURFACE_VARIANT }}>
                        Đã gửi{' '}
                        <Text style={{ color: palette.EHR_ON_SURFACE, fontWeight: '700' }}>
                            {formatTimeAgo(request.createdAt)}
                        </Text>
                    </Text>
                </View>

                <SummaryCard request={request} palette={palette} title="Tóm tắt hồ sơ" />

                <View
                    style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTopWidth: 0.5,
                        borderTopColor: palette.EHR_OUTLINE_SOFT,
                    }}
                >
                    <Text style={{ fontFamily: MONO, fontSize: 10.5, color: palette.EHR_TEXT_MUTED, lineHeight: 16 }}>
                        Hash hồ sơ: <Text style={{ color: palette.EHR_ON_SURFACE_VARIANT }}>{(request.documentCid || '').slice(0, 16)}…</Text>
                        {'\n'}
                        Đã ký bằng khoá Web3Auth của bạn.
                    </Text>
                </View>
            </View>
        </View>
    );
}

// ───────── APPROVED HERO (state A4) ─────────
function ApprovedHero({ request, palette }: any) {
    return (
        <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
            <View
                style={{
                    padding: 22,
                    borderRadius: 14,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                }}
            >
                <View
                    style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        borderWidth: 1.4,
                        borderColor: palette.EHR_TERTIARY,
                        alignItems: 'center',
                        justifyContent: 'center',
                        alignSelf: 'flex-start',
                        marginBottom: 16,
                    }}
                >
                    <Check size={26} color={palette.EHR_TERTIARY} strokeWidth={2.4} />
                </View>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 22,
                        fontWeight: '500',
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.3,
                        lineHeight: 28,
                    }}
                >
                    Đã xác minh
                </Text>
                <Text
                    style={{
                        marginTop: 6,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        lineHeight: 19,
                    }}
                >
                    Bạn có thể tạo, đọc và ký hồ sơ y tế thay mặt cho{' '}
                    <Text style={{ fontFamily: SERIF_ITALIC, fontStyle: 'italic' }}>
                        {request.organization}
                    </Text>
                    .
                </Text>

                <SummaryCard
                    request={request}
                    palette={palette}
                    title="Hiệu lực"
                    extraRows={[
                        { k: 'Duyệt bởi', v: request.reviewedBy ? `${request.reviewedBy.slice(0, 8)}…${request.reviewedBy.slice(-4)}` : '—' },
                        { k: 'Duyệt lúc', v: formatTimeAgo(request.reviewedAt) },
                    ]}
                />
            </View>
        </View>
    );
}

// ───────── REJECTED HERO (state A5) ─────────
function RejectedHero({ request, rejectionReason, onResubmit, onContact, palette }: any) {
    return (
        <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
            <View
                style={{
                    padding: 22,
                    borderRadius: 14,
                    backgroundColor: palette.EHR_SURFACE_LOWEST,
                    borderWidth: 0.5,
                    borderColor: palette.EHR_OUTLINE_SOFT,
                }}
            >
                <View
                    style={{
                        width: 56,
                        height: 56,
                        borderRadius: 28,
                        borderWidth: 1.4,
                        borderColor: palette.EHR_DANGER,
                        alignItems: 'center',
                        justifyContent: 'center',
                        alignSelf: 'flex-start',
                        marginBottom: 16,
                    }}
                >
                    <X size={26} color={palette.EHR_DANGER} strokeWidth={2.4} />
                </View>
                <Text
                    style={{
                        fontFamily: SERIF,
                        fontSize: 22,
                        fontWeight: '500',
                        color: palette.EHR_ON_SURFACE,
                        letterSpacing: -0.3,
                        lineHeight: 28,
                    }}
                >
                    Hồ sơ bị từ chối
                </Text>
                <Text
                    style={{
                        marginTop: 6,
                        fontFamily: SANS,
                        fontSize: 13,
                        color: palette.EHR_ON_SURFACE_VARIANT,
                        lineHeight: 19,
                    }}
                >
                    Cơ sở{' '}
                    <Text style={{ fontFamily: SERIF_ITALIC, fontStyle: 'italic' }}>
                        {request.organization}
                    </Text>{' '}
                    yêu cầu bổ sung tài liệu trước khi cấp quyền.
                </Text>

                {rejectionReason ? (
                    <View
                        style={{
                            marginTop: 16,
                            paddingVertical: 12,
                            paddingHorizontal: 14,
                            borderRadius: 10,
                            backgroundColor: `${palette.EHR_DANGER}14`,
                            borderLeftWidth: 2,
                            borderLeftColor: palette.EHR_DANGER,
                        }}
                    >
                        <Text
                            style={{
                                fontFamily: SERIF_ITALIC,
                                fontStyle: 'italic',
                                fontSize: 11,
                                color: palette.EHR_DANGER,
                                letterSpacing: 0.4,
                                textTransform: 'uppercase',
                                fontWeight: '700',
                                marginBottom: 6,
                            }}
                        >
                            Lý do từ chối
                        </Text>
                        <Text style={{ fontFamily: SANS, fontSize: 13, color: palette.EHR_ON_SURFACE, lineHeight: 19 }}>
                            {rejectionReason}
                        </Text>
                    </View>
                ) : null}

                <SummaryCard
                    request={request}
                    palette={palette}
                    title="Bị từ chối"
                    extraRows={[
                        { k: 'Bởi', v: request.reviewedBy ? `${request.reviewedBy.slice(0, 8)}…${request.reviewedBy.slice(-4)}` : '—' },
                        { k: 'Lúc', v: formatTimeAgo(request.reviewedAt) },
                    ]}
                />
            </View>

            <View style={{ paddingHorizontal: 0, marginTop: 16, gap: 9 }}>
                <Pressable
                    onPress={onResubmit}
                    style={({ pressed }) => ({
                        paddingVertical: 16,
                        borderRadius: 12,
                        backgroundColor: palette.EHR_CINNABAR_DEEP,
                        alignItems: 'center',
                        opacity: pressed ? 0.85 : 1,
                    })}
                >
                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 15, fontWeight: '700', color: '#FBF8F1' }}>
                        Sửa hồ sơ và gửi lại
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onContact}
                    style={({ pressed }) => ({
                        paddingVertical: 14,
                        borderRadius: 12,
                        borderWidth: 0.5,
                        borderColor: palette.EHR_OUTLINE,
                        alignItems: 'center',
                        opacity: pressed ? 0.7 : 1,
                    })}
                >
                    <Text style={{ fontFamily: SANS_SEMI, fontSize: 14, fontWeight: '600', color: palette.EHR_ON_SURFACE }}>
                        Liên hệ cơ sở
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

function SummaryCard({ request, palette, title, extraRows }: any) {
    return (
        <View
            style={{
                marginTop: 18,
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 0.5,
                borderColor: palette.EHR_OUTLINE_SOFT,
                gap: 8,
            }}
        >
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                    marginBottom: 4,
                }}
            >
                {title}
            </Text>
            <KV label="Cơ sở" value={request.organization} palette={palette} />
            <KV label="Số CCHN" value={request.licenseNumber || '—'} mono palette={palette} />
            <KV label="Chuyên khoa" value={request.specialty || '—'} palette={palette} />
            <KV label="Gửi ngày" value={formatDotDate(request.createdAt)} mono palette={palette} />
            {extraRows?.map((r: any, i: number) => (
                <KV key={i} label={r.k} value={r.v} palette={palette} />
            ))}
        </View>
    );
}

function KV({ label, value, mono, palette }: any) {
    return (
        <XStack style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <Text
                style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: palette.EHR_TEXT_MUTED,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    fontWeight: '700',
                }}
            >
                {label}
            </Text>
            <Text
                style={{
                    flex: 1,
                    fontFamily: mono ? MONO : SANS,
                    fontSize: 12.5,
                    color: palette.EHR_ON_SURFACE,
                    textAlign: 'right',
                    fontWeight: mono ? '600' : '500',
                }}
                numberOfLines={2}
            >
                {value}
            </Text>
        </XStack>
    );
}
