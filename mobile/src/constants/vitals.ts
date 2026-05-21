// Vital signs reference ranges per Claude Design `viehp-doctor-forms-spec.html` Q2.
// Source: TT 46/2018/TT-BYT + WHO common ranges. Frontend hardcode (backend stores
// raw values only; abnormal flag recomputes on render so ranges can update without
// data migration). Personal baseline override = Phase G.13+ (deferred).

export type VitalId = 'hr' | 'bpSystolic' | 'bpDiastolic' | 'temp' | 'spo2' | 'rr' | 'weight';
export type VitalStatus = 'ok' | 'high' | 'low' | 'empty';

export interface VitalSpec {
    id: VitalId;
    label: string;
    unit: string;
    refLabel: string;    // human-readable range "60–100"
    min: number | null;  // null = no min check
    max: number | null;  // null = no max check
    placeholder?: string;
}

export const VITAL_SPECS: VitalSpec[] = [
    {
        id: 'hr',
        label: 'Nhịp tim',
        unit: 'lần/phút',
        refLabel: '60–100',
        min: 60,
        max: 100,
        placeholder: '78',
    },
    {
        id: 'bpSystolic',
        label: 'HA tâm thu',
        unit: 'mmHg',
        refLabel: '< 140',
        min: null,
        max: 140,
        placeholder: '120',
    },
    {
        id: 'bpDiastolic',
        label: 'HA tâm trương',
        unit: 'mmHg',
        refLabel: '< 90',
        min: null,
        max: 90,
        placeholder: '80',
    },
    {
        id: 'temp',
        label: 'Nhiệt độ',
        unit: '°C',
        refLabel: '36.1–37.2',
        min: 36.1,
        max: 37.2,
        placeholder: '36.8',
    },
    {
        id: 'spo2',
        label: 'SpO₂',
        unit: '%',
        refLabel: '≥ 95',
        min: 95,
        max: null,
        placeholder: '98',
    },
    {
        id: 'rr',
        label: 'Nhịp thở',
        unit: 'lần/phút',
        refLabel: '12–20',
        min: 12,
        max: 20,
        placeholder: '16',
    },
    {
        id: 'weight',
        label: 'Cân nặng',
        unit: 'kg',
        refLabel: '—',
        min: null,
        max: null,
        placeholder: '60',
    },
];

/**
 * Pure function — given vital spec + raw value (string from input or number),
 * return status. Per spec Q2: recompute on render (don't persist flag).
 */
export function flagVital(spec: VitalSpec, rawValue: string | number | null | undefined): VitalStatus {
    if (rawValue === null || rawValue === undefined || rawValue === '') return 'empty';
    const n = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue).replace(',', '.'));
    if (!Number.isFinite(n)) return 'empty';
    if (spec.max !== null && n > spec.max) return 'high';
    if (spec.min !== null && n < spec.min) return 'low';
    return 'ok';
}

/**
 * BP combo OR-flag — high if EITHER systolic OR diastolic exceeds threshold.
 * Per spec Q2 BP-specific logic.
 */
export function flagBp(systolic: string | number | null, diastolic: string | number | null): VitalStatus {
    const sysSpec = VITAL_SPECS.find((v) => v.id === 'bpSystolic')!;
    const diaSpec = VITAL_SPECS.find((v) => v.id === 'bpDiastolic')!;
    const sysFlag = flagVital(sysSpec, systolic);
    const diaFlag = flagVital(diaSpec, diastolic);
    if (sysFlag === 'empty' && diaFlag === 'empty') return 'empty';
    if (sysFlag === 'high' || diaFlag === 'high') return 'high';
    if (sysFlag === 'low' || diaFlag === 'low') return 'low';
    return 'ok';
}

/**
 * Note text for abnormal vital — short clinical phrasing.
 */
export function abnormalNote(spec: VitalSpec, status: VitalStatus): string | null {
    if (status === 'high') return `${spec.label} cao hơn ngưỡng bình thường`;
    if (status === 'low') return `${spec.label} thấp hơn ngưỡng bình thường`;
    return null;
}
