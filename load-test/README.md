# Load Test — EHR Backend

> Đo throughput + latency cho **Chương "Đánh giá tính khả thi"** của Quyển.
> Tool: [k6](https://k6.io) (binary, không cần npm).

## 1. Install k6 (Windows)

**Option A** — Chocolatey/Scoop:
```powershell
scoop install k6      # hoặc: choco install k6
```

**Option B** — Binary tay:
- Download Windows ZIP từ https://github.com/grafana/k6/releases/latest
- Giải nén → copy `k6.exe` vào folder trong PATH (vd `C:\Users\admin\bin\`)

Verify:
```bash
k6 version
```

## 2. Prep test data (1 lần)

Backend cần đang chạy + ít nhất 1 patient + 5 record + 1 doctor verified.

**a. Start backend**:
```bash
cd c:/University/DATN/EHR/backend
npm run dev
```

**b. Login patient qua mobile app** → copy JWT từ AsyncStorage (hoặc DevTools).

Setup `.env` file trong `load-test/`:
```bash
# load-test/.env (tạo mới — KHÔNG commit)
BASE_URL=http://localhost:3001
PATIENT_JWT=<paste JWT của patient từ mobile>
DOCTOR_JWT=<paste JWT của doctor verified>
CID_HASH=<copy 1 cidHash từ /api/records/my>
```

K6 đọc env vars qua `-e` flag hoặc `--env-file`.

## 3. Run scenarios

```bash
cd load-test

# Light — 10 VUs × 10 phút (baseline, no error expected)
k6 run -e BASE_URL=http://localhost:3001 \
       -e PATIENT_JWT=<jwt> \
       -e CID_HASH=<cidhash> \
       --out json=results/01-light.json \
       scenarios/01-light.js

# Medium — 50 VUs × 10 phút (production-realistic)
k6 run -e ... --out json=results/02-medium.json scenarios/02-medium.js

# Stress — 200 VUs × 5 phút (verify rate limiter + graceful degradation)
k6 run -e ... --out json=results/03-stress.json scenarios/03-stress.js
```

## 4. Capture cho Quyển

Sau mỗi scenario chạy xong, k6 in summary với:
- `http_req_duration` — p50, p95, p99, max
- `http_reqs` — total + rate (RPS)
- `http_req_failed` — error %
- per-endpoint metrics (qua `group()`)

Chụp screenshot output → đưa vào `results/`.

Mở Alchemy dashboard during run → screenshot CU usage để đo RPC quota saturation.

Mở Neon dashboard → screenshot DB connection saturation.

## 5. Tổng hợp → `RESULTS.md`

Sau khi 3 scenario chạy xong, tổng hợp:
- Bảng so sánh 3 scenario (RPS, p95, p99, error%)
- Bottleneck identification (RPC vs DB vs event loop)
- Conclusion: app handle được X concurrent user với p95 < Y ms

## Constraints (đã verify khi research)

| Limit | Value | Source |
|---|---|---|
| Express rate limit | 1000 req / 15 min mỗi /api path | backend/src/app.js:55-60 |
| Neon Postgres free tier | 3-5 concurrent connections | Neon docs |
| Alchemy free tier RPC | 300 CU/s | dashboard |
| Subgraph poll interval | 30s | .env SUBGRAPH_POLL_MS |

→ Light + Medium nên pass thoải mái. Stress (200 VUs) sẽ hit rate limit
sau ~660 req → expect 429 cascade. Verify backend response gracefully
chứ không 500 crash.

## Endpoints under test

| Endpoint | Method | Cost dominant |
|---|---|---|
| `/api/key-share/record/:cidHash` | GET | RPC eth_call (canAccess) + DB read |
| `/api/records/my` | GET | DB list query |
| `/api/profile/me` | GET | DB read (light) |
| `/api/records/save-only` | POST | DB write |

KHÔNG load test:
- `/api/relayer/*` — cần EIP-712 signature thật, k6 không sign được
- `/api/key-share` POST — cần encrypt NaCl payload thật

Tham khảo: `c:/Users/admin/.claude/plans/inherited-wibbling-hare.md` §17 C3.
