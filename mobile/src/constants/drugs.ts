// Drug schema cho đơn thuốc multi-drug (C1 plan §15).
// TT 26/2025/TT-BYT (hiệu lực 01/07/2025) — cho phép 1 đơn nhiều thuốc cùng/khác chuyên khoa.
// Schema 9 trường theo §17 + Phụ lục bệnh án ngoại trú.

export type Drug = {
    id: string;              // local UUID, không persist on-chain
    medication: string;      // tên thuốc chung quốc tế — REQUIRED
    brandName?: string;      // tên thương mại — optional
    strength: string;        // nồng độ / hàm lượng "500mg" — REQUIRED
    quantity: string;        // số lượng "30" — REQUIRED (số < 10 phải prefix "0")
    quantityUnit: string;    // đơn vị "viên/ml/ống" — REQUIRED (default "viên")
    doseAmount: string;      // mỗi lần "1" — REQUIRED
    doseUnit: string;        // đơn vị mỗi lần "viên/ml" — REQUIRED (= quantityUnit)
    timesPerDay: string;     // số lần / ngày "2" — REQUIRED
    durationDays: string;    // số ngày dùng, max 30 — REQUIRED (TT 26/2025 §17)
    route: string;           // đường dùng — REQUIRED (1 trong DRUG_ROUTES)
    timing?: string;         // thời điểm dùng — optional (1 trong DRUG_TIMINGS hoặc free text)
    instruction?: string;    // hướng dẫn đặc biệt — optional, multi-line
};

// Đường dùng — preset list, chip selector
export const DRUG_ROUTES = [
    'Uống',
    'Tiêm bắp',
    'Tiêm TM',
    'Tiêm dưới da',
    'Bôi',
    'Nhỏ',
    'Khí dung',
    'Đặt',
] as const;
export type DrugRoute = (typeof DRUG_ROUTES)[number];

// Thời điểm dùng — preset list, chip selector (đa chọn được)
export const DRUG_TIMINGS = [
    'Buổi sáng',
    'Buổi trưa',
    'Buổi chiều',
    'Buổi tối',
    'Trước ăn',
    'Sau ăn',
    'Trước ngủ',
    'Khi đau',
] as const;

export const DRUG_QUANTITY_UNITS = [
    'viên',
    'gói',
    'ống',
    'lọ',
    'chai',
    'ml',
    'giọt',
    'liều',
] as const;

// Validation theo TT 26/2025 §17:
// - Tên thuốc: ≥ 2 ký tự
// - Nồng độ + Số lượng + Mỗi lần + Lần/ngày + Số ngày: required (5 trường)
// - Số ngày max 30
// - Đường dùng: required (1 trong DRUG_ROUTES)
// - Số lượng < 10 phải có "0" prefix (vd "08 viên")
export type DrugError = {
    drugId: string;
    field: keyof Drug | 'autoFix';
    message: string;
    autoFix?: { field: keyof Drug; suggestion: string };
};

export const MAX_DRUG_DURATION_DAYS = 30;

export function validateDrug(d: Drug): DrugError[] {
    const errors: DrugError[] = [];
    const med = (d.medication || '').trim();
    if (!med) {
        errors.push({ drugId: d.id, field: 'medication', message: 'Tên thuốc bắt buộc.' });
    } else if (med.length < 2) {
        errors.push({ drugId: d.id, field: 'medication', message: 'Tên thuốc tối thiểu 2 ký tự.' });
    }
    if (!d.strength?.trim()) {
        errors.push({ drugId: d.id, field: 'strength', message: 'Nồng độ/hàm lượng bắt buộc.' });
    }
    const qty = (d.quantity || '').trim();
    if (!qty) {
        errors.push({ drugId: d.id, field: 'quantity', message: 'Số lượng bắt buộc.' });
    } else {
        const n = parseInt(qty.replace(/\D/g, ''), 10);
        if (Number.isFinite(n) && n > 0 && n < 10 && !/^0/.test(qty)) {
            errors.push({
                drugId: d.id,
                field: 'quantity',
                message: `Số dưới 10 phải có "0" đứng trước (vd "0${n}").`,
                autoFix: { field: 'quantity', suggestion: `0${n}` },
            });
        }
    }
    if (!d.doseAmount?.trim()) {
        errors.push({ drugId: d.id, field: 'doseAmount', message: 'Liều mỗi lần bắt buộc.' });
    }
    if (!d.timesPerDay?.trim()) {
        errors.push({ drugId: d.id, field: 'timesPerDay', message: 'Số lần/ngày bắt buộc.' });
    }
    const days = parseInt((d.durationDays || '').replace(/\D/g, ''), 10);
    if (!d.durationDays?.trim()) {
        errors.push({ drugId: d.id, field: 'durationDays', message: 'Số ngày dùng bắt buộc.' });
    } else if (Number.isFinite(days) && days > MAX_DRUG_DURATION_DAYS) {
        errors.push({
            drugId: d.id,
            field: 'durationDays',
            message: `Tối đa ${MAX_DRUG_DURATION_DAYS} ngày/đơn (TT 26/2025 §17).`,
        });
    }
    if (!d.route?.trim()) {
        errors.push({ drugId: d.id, field: 'route', message: 'Đường dùng bắt buộc.' });
    }
    return errors;
}

/**
 * Generate ID đơn giản cho Drug — không cần crypto, chỉ local form state.
 */
export function makeDrugId(): string {
    return `drug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Drug rỗng cho new entry — default route='Uống', unit='viên'.
 */
export function emptyDrug(): Drug {
    return {
        id: makeDrugId(),
        medication: '',
        strength: '',
        quantity: '',
        quantityUnit: 'viên',
        doseAmount: '',
        doseUnit: 'viên',
        timesPerDay: '',
        durationDays: '',
        route: 'Uống',
    };
}

/**
 * Format collapsed summary line cho RxCard.
 * Output: "1 viên × 1 lần / ngày · 30 ngày · uống · buổi sáng"
 */
export function drugSummary(d: Drug): string {
    const parts: string[] = [];
    if (d.doseAmount && d.doseUnit) parts.push(`${d.doseAmount} ${d.doseUnit}`);
    if (d.timesPerDay) parts.push(`× ${d.timesPerDay} lần / ngày`);
    if (d.durationDays) parts.push(`· ${d.durationDays} ngày`);
    if (d.route) parts.push(`· ${d.route.toLowerCase()}`);
    if (d.timing) parts.push(`· ${d.timing.toLowerCase()}`);
    return parts.join(' ') || '—';
}

/**
 * Format total summary footer cho expanded card.
 * Output: "Tổng 30 viên · 30 ngày · uống · buổi sáng"
 */
export function drugTotal(d: Drug): string {
    const parts: string[] = [];
    if (d.quantity && d.quantityUnit) parts.push(`Tổng ${d.quantity} ${d.quantityUnit}`);
    if (d.durationDays) parts.push(`${d.durationDays} ngày`);
    if (d.route) parts.push(d.route.toLowerCase());
    if (d.timing) parts.push(d.timing.toLowerCase());
    return parts.join(' · ');
}
