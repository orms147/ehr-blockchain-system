// Vaccination schema (C2, plan §15).
// TT 13/2026/TT-BYT (hiệu lực 01/07/2026) — bãi bỏ TT 24/2018, 34/2018,
// 05/2020, 52/2025. HPV vào danh sách BẮT BUỘC.
//
// Schema 1 mũi tiêm — 7 trường bắt buộc + 3 tuỳ chọn. Pattern multi-shot
// (1 record = N shots from 1 session) để khớp NIIS data model: doctor có
// thể ghi nhận 1 buổi tiêm chủng nhiều vaccine cho 1 bệnh nhân (vd: trẻ
// tiêm 5 mũi cùng lúc theo lịch NIP).

export type Vaccination = {
    id: string;              // local UUID, không persist on-chain
    vaccineName: string;     // REQUIRED — chọn từ VACCINE_PRESETS hoặc free text
    antigens?: string[];     // auto-suggested theo vaccineName combo
    lotNumber: string;       // REQUIRED — số lô (TT 13/2026 — quan trọng truy xuất lô lỗi)
    expirationDate: string;  // REQUIRED — DD/MM/YYYY (HSD vaccine)
    administeredAt: string;  // REQUIRED — DD/MM/YYYY ngày tiêm, default today
    site: string;            // REQUIRED — vị trí tiêm (VACC_SITES)
    doseNumber?: string;     // optional — Mũi 1/2/3/Nhắc/Đặc biệt
    administrator?: string;  // auto-fill doctor session
    facility?: string;       // auto-fill doctor.hospitalName
    adverseReaction?: string; // optional — phản ứng sau tiêm
};

// Vaccine presets — 2 nhóm theo TT 13/2026:
// 1. HPV BẮT BUỘC (mới theo TT 13/2026)
// 2. NIP (Chương trình Tiêm chủng mở rộng — kế thừa từ TT 34/2018 cũ)
export type VaccineCategory = 'mandatory_hpv' | 'nip';

export type VaccinePreset = {
    name: string;             // tên vaccine (chung hoặc thương mại)
    category: VaccineCategory;
    antigens: string[];       // antigen breakdown cho combo vaccine
    minAgeYears?: number;     // độ tuổi tối thiểu để soft-warning
};

export const VACCINE_PRESETS: VaccinePreset[] = [
    // ───── HPV BẮT BUỘC (TT 13/2026 mới) ─────
    {
        name: 'Gardasil 9',
        category: 'mandatory_hpv',
        antigens: ['HPV-6', 'HPV-11', 'HPV-16', 'HPV-18', 'HPV-31', 'HPV-33', 'HPV-45', 'HPV-52', 'HPV-58'],
        minAgeYears: 9,
    },
    {
        name: 'Cervarix',
        category: 'mandatory_hpv',
        antigens: ['HPV-16', 'HPV-18'],
        minAgeYears: 9,
    },
    {
        name: 'Gardasil',
        category: 'mandatory_hpv',
        antigens: ['HPV-6', 'HPV-11', 'HPV-16', 'HPV-18'],
        minAgeYears: 9,
    },

    // ───── Chương trình tiêm chủng mở rộng (NIP) ─────
    { name: 'BCG (Lao)', category: 'nip', antigens: ['Mycobacterium bovis'] },
    { name: 'Viêm gan B', category: 'nip', antigens: ['HBsAg'] },
    {
        name: 'Pentaxim (5 trong 1)',
        category: 'nip',
        antigens: ['Bạch hầu', 'Ho gà', 'Uốn ván', 'Bại liệt', 'Hib'],
    },
    {
        name: 'Hexaxim (6 trong 1)',
        category: 'nip',
        antigens: ['Bạch hầu', 'Ho gà', 'Uốn ván', 'Bại liệt', 'Hib', 'Viêm gan B'],
    },
    { name: 'Sởi - Quai bị - Rubella (MMR)', category: 'nip', antigens: ['Sởi', 'Quai bị', 'Rubella'] },
    { name: 'Sởi - Rubella', category: 'nip', antigens: ['Sởi', 'Rubella'] },
    { name: 'Viêm não Nhật Bản B', category: 'nip', antigens: ['JEV'] },
    { name: 'Phế cầu', category: 'nip', antigens: ['Streptococcus pneumoniae'] },
    { name: 'Não mô cầu', category: 'nip', antigens: ['Neisseria meningitidis'] },
    { name: 'Rotavirus', category: 'nip', antigens: ['Rotavirus'] },
    { name: 'Cúm', category: 'nip', antigens: ['Influenza A/B'] },
    { name: 'Thuỷ đậu (Varicella)', category: 'nip', antigens: ['Varicella zoster'] },
    { name: 'COVID-19', category: 'nip', antigens: ['SARS-CoV-2'] },
    { name: 'Tả', category: 'nip', antigens: ['Vibrio cholerae'] },
    { name: 'Thương hàn', category: 'nip', antigens: ['Salmonella typhi'] },
];

// Vị trí tiêm — preset chip selector
export const VACC_SITES = [
    'Cánh tay trái',
    'Cánh tay phải',
    'Đùi trái',
    'Đùi phải',
    'Mông trái',
    'Mông phải',
    'Khác',
] as const;

// Số mũi — preset
export const VACC_DOSE_LABELS = [
    'Mũi 1',
    'Mũi 2',
    'Mũi 3',
    'Mũi nhắc',
    'Mũi đặc biệt',
] as const;

// ───── Validation ─────
export type VaccinationError = {
    shotId: string;
    field: keyof Vaccination | 'general';
    severity: 'hard' | 'soft';  // hard = block ký, soft = warning có bypass
    message: string;
};

/**
 * Parse DD/MM/YYYY → Date hoặc null.
 */
function parseVnDate(s: string | undefined): Date | null {
    if (!s) return null;
    const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2200) return null;
    return new Date(yyyy, mm - 1, dd);
}

export function validateShot(v: Vaccination): VaccinationError[] {
    const errors: VaccinationError[] = [];
    if (!v.vaccineName?.trim()) {
        errors.push({ shotId: v.id, field: 'vaccineName', severity: 'hard', message: 'Chọn hoặc nhập tên vaccine.' });
    }
    if (!v.lotNumber?.trim()) {
        errors.push({ shotId: v.id, field: 'lotNumber', severity: 'hard', message: 'Số lô vaccine bắt buộc (truy xuất theo TT 13/2026).' });
    } else if (v.lotNumber.trim().length < 3) {
        errors.push({ shotId: v.id, field: 'lotNumber', severity: 'hard', message: 'Số lô tối thiểu 3 ký tự.' });
    }
    if (!v.administeredAt?.trim()) {
        errors.push({ shotId: v.id, field: 'administeredAt', severity: 'hard', message: 'Ngày tiêm bắt buộc.' });
    }
    if (!v.expirationDate?.trim()) {
        errors.push({ shotId: v.id, field: 'expirationDate', severity: 'hard', message: 'Hạn sử dụng vaccine bắt buộc.' });
    }
    if (!v.site?.trim()) {
        errors.push({ shotId: v.id, field: 'site', severity: 'hard', message: 'Vị trí tiêm bắt buộc.' });
    }

    // Cross-field hard validations
    const adminDate = parseVnDate(v.administeredAt);
    const expDate = parseVnDate(v.expirationDate);
    if (adminDate && expDate && expDate.getTime() < adminDate.getTime()) {
        errors.push({
            shotId: v.id,
            field: 'expirationDate',
            severity: 'hard',
            message: 'Vaccine đã hết hạn vào ngày tiêm. Không được tiêm vaccine quá HSD.',
        });
    }
    if (adminDate) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (adminDate.getTime() > today.getTime()) {
            errors.push({
                shotId: v.id,
                field: 'administeredAt',
                severity: 'hard',
                message: 'Ngày tiêm không thể trong tương lai.',
            });
        }
    }

    return errors;
}

/**
 * ID generator cho Vaccination — local form state.
 */
export function makeShotId(): string {
    return `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Empty shot cho new entry — default site='Cánh tay trái', administeredAt=today.
 */
export function emptyShot(): Vaccination {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return {
        id: makeShotId(),
        vaccineName: '',
        lotNumber: '',
        expirationDate: '',
        administeredAt: `${dd}/${mm}/${yyyy}`,
        site: 'Cánh tay trái',
    };
}

/**
 * Lookup preset cho 1 vaccine name (exact match, case-insensitive).
 */
export function findPreset(name: string): VaccinePreset | undefined {
    const n = name.trim().toLowerCase();
    return VACCINE_PRESETS.find((p) => p.name.toLowerCase() === n);
}

/**
 * Summary 1 line cho VaccCard collapsed state.
 * "Mũi 2 · 28/05/2026 · Cánh tay trái"
 */
export function shotSummary(v: Vaccination): string {
    const parts: string[] = [];
    if (v.doseNumber) parts.push(v.doseNumber);
    if (v.administeredAt) parts.push(v.administeredAt);
    if (v.site) parts.push(v.site);
    return parts.join(' · ') || '—';
}
