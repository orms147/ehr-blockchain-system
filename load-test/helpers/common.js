// Shared helpers cho 3 k6 scenarios.
// Tránh duplicate header build / threshold definition.

import http from 'k6/http';
import { check, sleep } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
export const PATIENT_JWT = __ENV.PATIENT_JWT || '';
export const DOCTOR_JWT = __ENV.DOCTOR_JWT || '';
export const CID_HASH = __ENV.CID_HASH || '';

if (!PATIENT_JWT) {
    throw new Error('Missing env PATIENT_JWT — see load-test/README.md');
}
if (!CID_HASH) {
    throw new Error('Missing env CID_HASH — see load-test/README.md');
}

export function authHeaders(token) {
    return {
        Authorization: `Bearer ${token || PATIENT_JWT}`,
        'Content-Type': 'application/json',
    };
}

/**
 * Standard threshold cho mọi scenario.
 * Light scenario expects 0% fail; Medium/Stress allow degradation.
 */
export function thresholds(maxP95Ms, maxErrorRate) {
    return {
        http_req_duration: [`p(95)<${maxP95Ms}`],
        http_req_failed: [`rate<${maxErrorRate}`],
    };
}

/**
 * Mix các endpoint theo tỉ lệ usage thực tế (đo từ mobile app behavior).
 * Mỗi VU iteration ~ 1 patient session simulating typical activity:
 *   - 60% read record (canAccess + DB)
 *   - 20% list records
 *   - 15% read profile
 *   -  5% update record meta (write)
 */
export function simulateUserSession() {
    const r = Math.random();
    if (r < 0.6) return readRecord();
    if (r < 0.8) return listRecords();
    if (r < 0.95) return readProfile();
    return updateRecordMeta();
}

export function readRecord() {
    const res = http.get(`${BASE_URL}/api/key-share/record/${CID_HASH}`, {
        headers: authHeaders(),
        tags: { endpoint: 'key_share_read' },
    });
    check(res, {
        'record read 200/404': (r) => r.status === 200 || r.status === 404,
    });
    return res;
}

export function listRecords() {
    const res = http.get(`${BASE_URL}/api/records/my`, {
        headers: authHeaders(),
        tags: { endpoint: 'records_list' },
    });
    check(res, { 'records list 200': (r) => r.status === 200 });
    return res;
}

export function readProfile() {
    const res = http.get(`${BASE_URL}/api/profile/me`, {
        headers: authHeaders(),
        tags: { endpoint: 'profile_read' },
    });
    check(res, { 'profile 200': (r) => r.status === 200 });
    return res;
}

export function updateRecordMeta() {
    // PUT /api/profile/me với payload thay đổi nhẹ (allergies field).
    // Đây là DB-write endpoint không trigger on-chain.
    const body = JSON.stringify({
        allergies: `Load test allergy update ${Date.now()}`,
    });
    const res = http.put(`${BASE_URL}/api/profile/me`, body, {
        headers: authHeaders(),
        tags: { endpoint: 'profile_update' },
    });
    check(res, { 'profile update 200': (r) => r.status === 200 });
    return res;
}

export function thinkTime(min = 1, max = 3) {
    // Random think-time giữa request — mô phỏng user thật (đọc UI, suy nghĩ).
    sleep(min + Math.random() * (max - min));
}
