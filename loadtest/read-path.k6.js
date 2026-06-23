// k6 load test — READ path (DB-dependent) for the EHR backend.
//
// Scope (advisor feedback #4): this measures ONLY the read path that hits the
// backend + Postgres (Neon). It does NOT measure the on-chain WRITE path
// (smart-contract tx latency/gas) nor the client-side encryption/decryption
// path — state this explicitly in the report.
//
// Run:
//   k6 run -e BASE_URL=https://ehr-blockchain-system.onrender.com \
//          -e TOKEN=<JWT> -e ENDPOINT=/api/records \
//          -e VUS=20 -e DURATION=1m loadtest/read-path.k6.js
//
// Record in the report table: server config (Render free 0.1 CPU / 512MB),
// DB (Neon Postgres, region), VUs, ramp-up, endpoint, payload size, p50/p95/p99,
// error rate, throughput (reqs/s). Note Render free tier cold-starts (~30-50s) →
// warm the service before measuring.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://ehr-blockchain-system.onrender.com';
const TOKEN = __ENV.TOKEN || '';                 // JWT for an authed DB-read endpoint
const ENDPOINT = __ENV.ENDPOINT || '/health';    // default baseline; set to a DB-read route
const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || '1m';

const errorRate = new Rate('errors');
const readLatency = new Trend('read_latency_ms', true);

export const options = {
    // Ramp-up → steady → ramp-down (report the exact stages used).
    stages: [
        { duration: '20s', target: VUS },   // ramp-up
        { duration: DURATION, target: VUS }, // steady load
        { duration: '10s', target: 0 },      // ramp-down
    ],
    thresholds: {
        // Report p50/p95/p99 from the summary; these are pass/fail gates.
        http_req_duration: ['p(95)<800', 'p(99)<1500'],
        http_req_failed: ['rate<0.01'],   // <1% errors
        errors: ['rate<0.01'],
    },
};

const params = {
    headers: TOKEN
        ? { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' },
    tags: { endpoint: ENDPOINT },
};

export default function () {
    const res = http.get(`${BASE_URL}${ENDPOINT}`, params);
    readLatency.add(res.timings.duration);
    const ok = check(res, {
        'status is 2xx': (r) => r.status >= 200 && r.status < 300,
        'has body': (r) => r.body && r.body.length > 0,
    });
    errorRate.add(!ok);
    sleep(1); // 1 req/VU/s pacing — adjust to model real usage
}

// Tip: warm Render first (free tier sleeps): curl $BASE_URL/health before the run.
