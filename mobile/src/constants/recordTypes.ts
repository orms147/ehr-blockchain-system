// Record type registry per viehp-doctor-forms-spec.html Q1.
//
// Ship 5 types: general · lab · imaging · rx · vacc. Trimmed `vital_signs` (it
// is a SECTION inside any record, not a type). Deferred `surgery` + `allergy`
// (post-thesis — surgery needs ekíp/ASA fields; allergy already covered by
// EmergencyProfile.allergies baseline + general+ICD-10 T78.x for events).
//
// Persist short stable keys (general/lab/imaging/rx/vacc) in
// RecordMetadata.recordType VARCHAR(50). Old enum values (checkup,
// lab_result, prescription, vaccination, vital_signs) remain readable via
// LEGACY_KEY_MAP so historic rows keep their label/icon.

import {
    FileText,
    Stethoscope,
    Microscope,
    Image as ImageIcon,
    Syringe,
    type LucideIcon,
} from 'lucide-react-native';

export type RecordTypeKey = 'general' | 'lab' | 'imaging' | 'rx' | 'vacc';

export interface RecordTypeSpec {
    key: RecordTypeKey;
    label: string;
    /** Lowercase short label for chips ("xét nghiệm") */
    shortLabel: string;
    icon: LucideIcon;
}

export const RECORD_TYPES: RecordTypeSpec[] = [
    { key: 'general', label: 'Khám tổng quát', shortLabel: 'khám tổng quát', icon: Stethoscope },
    { key: 'lab', label: 'Xét nghiệm', shortLabel: 'xét nghiệm', icon: Microscope },
    { key: 'imaging', label: 'Chẩn đoán hình ảnh', shortLabel: 'chẩn đoán hình ảnh', icon: ImageIcon },
    { key: 'rx', label: 'Đơn thuốc', shortLabel: 'đơn thuốc', icon: FileText },
    { key: 'vacc', label: 'Tiêm chủng', shortLabel: 'tiêm chủng', icon: Syringe },
];

/**
 * Legacy values still stored in DB pre-G.12 — alias to the canonical key so
 * lookups in resolveRecordType() return the right spec.
 */
const LEGACY_KEY_MAP: Record<string, RecordTypeKey> = {
    checkup: 'general',
    diagnosis: 'general',
    lab_result: 'lab',
    prescription: 'rx',
    vaccination: 'vacc',
    // vital_signs has no canonical home — fall back to general
    vital_signs: 'general',
};

const DEFAULT_SPEC: RecordTypeSpec = RECORD_TYPES[0];

/**
 * Resolve a stored DB value (which may be a legacy key) to a RecordTypeSpec.
 * Falls back to "general" for unknown values so the UI never renders an empty
 * chip.
 */
export function resolveRecordType(raw?: string | null): RecordTypeSpec {
    if (!raw) return DEFAULT_SPEC;
    const canonical = LEGACY_KEY_MAP[raw] ?? (raw as RecordTypeKey);
    return RECORD_TYPES.find((t) => t.key === canonical) ?? DEFAULT_SPEC;
}
