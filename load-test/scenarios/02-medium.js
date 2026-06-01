// Scenario 2 — MEDIUM: 50 concurrent users × 10 min.
//
// Production-realistic load. Mục tiêu: đo p95 latency dưới tải vừa phải,
// xác định RPC quota saturation start point.
//
// Expected outcome:
//   - http_req_failed rate < 5%
//   - http_req_duration p95 < 1500ms
//   - throughput ~25-50 RPS sustained
//   - Alchemy CU usage có thể đạt 100-150/s (under 300 limit)
//
// Run: k6 run -e BASE_URL=... -e PATIENT_JWT=... -e CID_HASH=... \
//       --out json=results/02-medium.json scenarios/02-medium.js

import { simulateUserSession, thinkTime, thresholds } from '../helpers/common.js';

export const options = {
    scenarios: {
        medium: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 50 },   // ramp up
                { duration: '6m', target: 50 },   // sustained load
                { duration: '2m', target: 0 },    // ramp down
            ],
            gracefulRampDown: '30s',
        },
    },
    thresholds: thresholds(1500, 0.05),  // p95 < 1500ms, error < 5%
};

export default function () {
    simulateUserSession();
    thinkTime(0.5, 2);  // shorter think → higher RPS per VU
}
