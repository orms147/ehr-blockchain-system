// Strip data-URI prefix + whitespace from a base64 string. Used to normalize
// input from image picker / IPFS upload before AES encryption.
//
// S16 R2 (2026-04-29): consolidated from 3 duplicate definitions in
// CreateRecordScreen, RecordDetailScreen, DoctorCreateUpdateScreen.
export function normalizeBase64(data: string): string {
    return data
        .replace(/^data:[^;]+;base64,/, '')
        .replace(/\s+/g, '')
        .trim();
}
