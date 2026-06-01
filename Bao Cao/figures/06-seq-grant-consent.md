# Sơ đồ 6 — Sequence: Flow Cấp quyền (Grant Consent)

> Embed Chương 4 mục 4.4.2. Trace 18 bước flow patient share record cho doctor.

## Actors / Components
- **Patient** (mobile user)
- **MobileApp** (UI + services)
- **Backend** (Express + relayer)
- **ConsentLedger** (smart contract)
- **Subgraph** (indexer)
- **KeyShare DB** (PostgreSQL table)

## Step trace

1. Patient mở `RecordDetailScreen` → bấm "Chia sẻ"
2. Mobile mở `ShareSheet` → Patient paste/scan QR ví doctor B
3. Patient chọn thời hạn (vd 30 ngày, allowDelegate=false)
4. Patient bấm "Chia sẻ" → biometric MFA gate (LocalAuthentication)
5. Mobile build EIP-712 `ConsentPermit` typed data với nonce mới
6. Mobile gọi `walletClient.signTypedData(...)` → patient ký bằng vân tay
7. Mobile POST `/api/relayer/grant-consent` với `{patient, grantee, cidHash, encKeyHash, expireAt, allowDelegate, deadline, signature}`
8. Backend `relayer.service.js` verify signature on-chain qua `domainSeparator` + `getNonce`
9. Backend submit tx `ConsentLedger.grantBySig(...)` với sponsor wallet trả gas
10. Contract `_grantConsent(...)` lưu `_consents[consentKey]` + clear `recordDelegationSource[consentKey]` (Footgun #1 fix)
11. Contract emit event `ConsentGranted(patient, grantee, root, expireAt, allowDelegate)`
12. Backend return tx hash cho mobile (~2-3s)
13. Subgraph indexer poll loop (30s) phát hiện event `ConsentGranted`
14. Backend `subgraphSync.service.js` → `consentLedgerSync.service.js handleConsentGranted(...)`
15. Backend mirror entry vào `Consent` table (status=active)
16. Mobile separately POST `/api/key-share` cascade keys cho từng version trong record chain (encrypt AES key cho grantee's NaCl pubkey)
17. Backend `keyShareWriter.service.js applyShare` lưu KeyShare row (status=claimed, sender=patient, recipient=grantee)
18. Mobile show "Đã cấp quyền" + invalidate TanStack Query → ShareSheet refresh

## File references
- Mobile entry: [mobile/src/screens-v2/RecordDetailScreen.tsx](../../mobile/src/screens-v2/RecordDetailScreen.tsx) `handleShare`
- EIP-712 sign: [mobile/src/utils/eip712.js](../../mobile/src/utils/eip712.js) `signConsentPermit`
- Backend relayer: [backend/src/routes/relayer.routes.js](../../backend/src/routes/relayer.routes.js) `/grant-consent`
- Contract grant: [contracts/src/ConsentLedger.sol](../../contracts/src/ConsentLedger.sol) `grantBySig` + `_grantConsent`
- Event sync: [backend/src/services/consentLedgerSync.service.js](../../backend/src/services/consentLedgerSync.service.js) `handleConsentGranted`
- KeyShare cascade: [backend/src/routes/keyShare.routes.js](../../backend/src/routes/keyShare.routes.js) POST `/`

## PlantUML

Xem [06-seq-grant-consent.puml](06-seq-grant-consent.puml).
