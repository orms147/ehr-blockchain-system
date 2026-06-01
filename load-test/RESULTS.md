# Load Test Results — EHR Backend

> Output cho **Chương "Đánh giá tính khả thi"** của Quyển ĐATN.
> Template — fill các số sau khi run 3 scenario.

## Methodology

- **Tool**: k6 vX.Y.Z (https://k6.io)
- **Hardware**: <CPU model> · <RAM> GB · <OS>
- **Network**: localhost (eliminate network latency)
- **Backend**: Node.js Express + Prisma + Neon Postgres (free tier)
- **Blockchain**: Arbitrum Sepolia via Alchemy free tier (300 CU/s)
- **Subgraph**: The Graph Studio (poll 30s)
- **Date**: 2026-06-XX

## Scenarios

| ID | VUs | Duration | Think time | Mục tiêu |
|---|---|---|---|---|
| 01-light | 10 | 10 min | 1-3s | Baseline · sanity check |
| 02-medium | 50 | 10 min | 0.5-2s | Production-realistic |
| 03-stress | 200 | 5 min | 0.1-0.5s | Graceful degradation under spike |

## Endpoints mix

Mỗi VU iteration mô phỏng patient session:
- 60% `GET /api/key-share/record/:cidHash` (RPC canAccess + DB read)
- 20% `GET /api/records/my` (DB list)
- 15% `GET /api/profile/me` (DB read)
- 5% `PUT /api/profile/me` (DB write)

## Results

### Scenario 1 — Light (10 VUs × 10 min)

| Metric | Value |
|---|---|
| Total requests | <N> |
| Throughput | <N> req/s |
| http_req_duration p50 | <N> ms |
| http_req_duration p95 | <N> ms |
| http_req_duration p99 | <N> ms |
| http_req_failed rate | <X>% |
| Errors observed | <None / 429 / 5xx breakdown> |

**Per-endpoint p95**:

| Endpoint | p50 | p95 | p99 |
|---|---|---|---|
| key_share_read | <ms> | <ms> | <ms> |
| records_list | | | |
| profile_read | | | |
| profile_update | | | |

**Resource saturation**:
- Alchemy CU peak: <N> CU/s (under 300 limit ✓)
- Neon DB connections peak: <N> / 5
- Backend RAM: <MB>

---

### Scenario 2 — Medium (50 VUs × 10 min)

| Metric | Value |
|---|---|
| Total requests | <N> |
| Throughput | <N> req/s |
| http_req_duration p50 | <N> ms |
| http_req_duration p95 | <N> ms |
| http_req_duration p99 | <N> ms |
| http_req_failed rate | <X>% |

**Per-endpoint p95** + **Resource saturation**:
<fill>

---

### Scenario 3 — Stress (200 VUs × 5 min)

| Metric | Value |
|---|---|
| Total requests | <N> |
| Throughput | <N> req/s |
| http_req_duration p50 | <N> ms |
| http_req_duration p95 | <N> ms |
| http_req_failed rate | <X>% |
| 429 (rate limit) % | <X>% |
| 5xx (server error) % | <X>% — should be ~0 |

**Verification**: Backend còn alive sau test? `curl localhost:3001/api/health` → expect 200.

---

## Bottleneck Analysis

(Fill sau khi có data — typical findings)

- **Light/Medium**: bottleneck là <RPC / DB / event loop>. p95 dominated by <endpoint>.
- **Stress**: 429 rate limit kick in tại request thứ ~<N>. Pattern: <linear ramp / step>.
- **DB pool**: <degraded / fine> tại 50 VUs do Neon free tier 5 connection limit.
- **RPC quota**: <under / approaching / hit> 300 CU/s tại <N> VUs.

## Conclusion

App **ViEH backend** dưới điều kiện đo:

- ✅ Handle thoải mái <N> concurrent users (Light scenario, p95 < 500ms, 0 error).
- ✅ Production-realistic <N> users (Medium scenario, p95 < 1500ms, < 5% error).
- ✅ Graceful degradation tại <N> users (Stress scenario — 429 majority, no 5xx cascade).
- ⚠ Bottleneck chính: <RPC quota / DB pool>. Khi scale lên production:
  - Upgrade Alchemy/QuickNode plan (paid tier 3000+ CU/s)
  - Upgrade Neon Postgres (paid tier 100+ connections)
  - Express rate limit có thể nới (hiện 1000/15min/path quá strict cho production)

**Số đo này verify tính khả thi technical**: kiến trúc envelope encryption +
blind mailbox + on-chain consent có thể scale lên hàng trăm concurrent
user mà không cần re-architect — chỉ cần thay free tier infra bằng paid.

---

## Raw output

Screenshots Alchemy + Neon dashboard: `results/`
JSON output: `results/01-light.json`, `02-medium.json`, `03-stress.json`
