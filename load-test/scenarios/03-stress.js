// Scenario 3 — STRESS: 200 concurrent users × 5 min.
//
// Stress test. Mục tiêu: verify graceful degradation:
//   - Express rate limiter activate đúng (429 thay vì 500 cascade)
//   - Neon DB pool không saturate hoàn toàn
//   - Backend không crash
//
// Expected outcome:
//   - http_req_failed có thể 30-50% (rate limit kicks in)
//   - http_req_duration p95 cao (vài giây)
//   - 4xx responses majority over 5xx
//   - Backend log thấy "Too many requests" 429 (express-rate-limit)
//   - Đây là PROOF point cho thesis: "khi quá tải, app refuse gracefully"
//
// Run: k6 run -e BASE_URL=... -e PATIENT_JWT=... -e CID_HASH=... \
//       --out json=results/03-stress.json scenarios/03-stress.js

import { simulateUserSession, thinkTime } from '../helpers/common.js';

export const options = {
    scenarios: {
        stress: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 200 },  // aggressive ramp
                { duration: '3m', target: 200 },  // sustained spike
                { duration: '1m', target: 0 },    // ramp down
            ],
            gracefulRampDown: '30s',
        },
    },
    // Relax thresholds — stress scenario chủ ý overload backend.
    // Pass criteria khác: KHÔNG có 5xx cascade + backend còn alive sau test.
    thresholds: {
        http_req_duration: ['p(95)<10000'],
        // Cho phép tới 60% fail (rate limiter sẽ 429 majority).
        http_req_failed: ['rate<0.7'],
    },
};

export default function () {
    simulateUserSession();
    thinkTime(0.1, 0.5);  // minimal think → maximum pressure
}
