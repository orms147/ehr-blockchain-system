// max-throughput.k6.js — tìm TRẦN công suất (open-model, ramping-arrival-rate).
//
// Khác 3 kịch bản "concurrent users + think-time" (đo trải nghiệm), script này
// ÉP một TỐC ĐỘ REQUEST tăng dần (50→600 req/s) và để k6 tự tạo đủ VU để giữ
// nhịp đó — khi backend không theo kịp, độ trễ bùng / iteration bị bỏ (dropped)
// → đó là trần thật.
//
// Chạy:
//   k6 run -e BASE_URL=http://localhost:3001 -e PATIENT_JWT=<jwt> -e CID_HASH=<cid> max-throughput.k6.js

import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TOKEN = __ENV.PATIENT_JWT || __ENV.TOKEN || '';
const CID = __ENV.CID_HASH || '';

if (!TOKEN || !CID) {
    throw new Error('Thiếu PATIENT_JWT hoặc CID_HASH');
}

export const options = {
    scenarios: {
        ramp_rps: {
            executor: 'ramping-arrival-rate',
            startRate: 50,
            timeUnit: '1s',
            preAllocatedVUs: 100,
            maxVUs: 1000,
            stages: [
                { target: 100, duration: '30s' }, // 100 req/s
                { target: 300, duration: '45s' }, // 300 req/s
                { target: 600, duration: '45s' }, // 600 req/s
                { target: 600, duration: '30s' }, // giữ 600 để xem có ổn định
            ],
        },
    },
    thresholds: {
        // chỉ để báo, không fail run
        http_req_failed: ['rate<0.05'],
    },
};

const params = { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } };

export default function () {
    // Hỗn hợp đọc giống phiên người dùng (đường phụ thuộc DB)
    const r = Math.random();
    let url;
    if (r < 0.6) url = `${BASE_URL}/api/key-share/record/${CID}`;
    else if (r < 0.85) url = `${BASE_URL}/api/records/my`;
    else url = `${BASE_URL}/api/profile/me`;

    const res = http.get(url, params);
    check(res, { 'ok 2xx/404': (x) => (x.status >= 200 && x.status < 300) || x.status === 404 });
}
