// Scenario 1 — LIGHT: 10 concurrent users × 10 min.
//
// Baseline test. Mục tiêu: verify backend handle bình thường, no error,
// p95 response time hợp lý cho dev environment.
//
// Expected outcome:
//   - http_req_failed rate < 1%
//   - http_req_duration p95 < 500ms
//   - throughput ~5-10 RPS sustained
//
// Run: k6 run -e BASE_URL=... -e PATIENT_JWT=... -e CID_HASH=... \
//       --out json=results/01-light.json scenarios/01-light.js

import { simulateUserSession, thinkTime, thresholds } from '../helpers/common.js';

export const options = {
    scenarios: {
        light: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 10 },   // ramp up
                { duration: '8m', target: 10 },   // sustained load
                { duration: '1m', target: 0 },    // ramp down
            ],
            gracefulRampDown: '30s',
        },
    },
    thresholds: thresholds(500, 0.01),  // p95 < 500ms, error < 1%
};

export default function () {
    simulateUserSession();
    thinkTime(1, 3);
}
