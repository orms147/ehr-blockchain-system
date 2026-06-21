# Chức năng — Thu hồi quyền (revoke consent / revoke delegation)

## Tóm tắt 30 giây

Bệnh nhân (patient) có thể **rút lại quyền đã cấp** theo hai trục:

1. **Thu hồi consent một hồ sơ** (một record-chain) cho một người nhận cụ thể — đi qua **relayer gasless** (sponsor trả gas), hợp đồng gọi `ConsentLedger.revokeFor`. Hết 100 lượt miễn phí/tháng thì bệnh nhân **tự trả gas** gọi thẳng `ConsentLedger.revoke`.
2. **Thu hồi delegation** (uỷ quyền số lượng lớn cho một bác sĩ) — **KHÔNG có biến thể BySig**, nên bệnh nhân **luôn tự trả gas** gọi `ConsentLedger.revokeDelegation` từ ví của mình.

Điểm cốt lõi về bảo mật: mỗi lần thu hồi delegation, hợp đồng **tăng `delegationEpoch` (epoch bump)** → mọi consent/sub-delegation downstream do người bị thu hồi tạo ra đều **tự động vô hiệu** trong `canAccess` (cascade), không cần đụng từng dòng. Off-chain, backend **xoá payload mã hoá trong KeyShare** (`encryptedPayload = ''`) và đánh dấu `status='revoked'` — vừa làm ngay (best-effort khi UI gọi), vừa làm lại chắc chắn khi worker bắt được event `ConsentRevoked` / `DelegationRevoked`.

---

## 1. Khái niệm nền (cho người chưa rành backend/mobile/crypto)

Trước khi vào luồng, ba khối kiến thức tối thiểu:

| Khái niệm | Giải thích ngắn | Vì sao liên quan tới "thu hồi" |
|---|---|---|
| **Consent (on-chain)** | Một bản ghi trong `ConsentLedger` cho phép `grantee` đọc một **record-chain** của `patient`. Key = `keccak256(patient, grantee, rootCidHash)`. Lưu cờ `active`, `expireAt`, `allowDelegate`. | Thu hồi = bật `active = false` tại đúng key này. |
| **Delegation (on-chain)** | Uỷ quyền "số lượng lớn": bác sĩ được patient uỷ quyền có thể tự cấp consent cho bác sĩ khác (`grantUsingDelegation`) mà không cần chữ ký patient mỗi lần. Lưu dạng packed `uint256` trong `_delegations[patient][delegatee]`. | Thu hồi delegation phải làm vô hiệu **dây chuyền** mọi thứ phát sinh từ nó. |
| **KeyShare (off-chain, Postgres)** | "Hộp thư mù": backend giữ `encryptedPayload` = gói `{cid, aesKey}` đã mã hoá bằng public key của người nhận (NaCl box). Backend **không giải mã được**. Người nhận dùng key này để tải + giải mã hồ sơ trên IPFS. | Thu hồi phải **xoá/đánh dấu** KeyShare để người nhận mất đường lấy key. |

Mã hoá ai đọc được gì:

```
On-chain ConsentLedger : metadata + hash  → AI CŨNG ĐỌC (public)  → không có key thật
Postgres KeyShare       : encryptedPayload → CHỈ người nhận giải   → backend mù
IPFS (Pinata)           : ciphertext AES   → cần aesKey (nằm trong KeyShare)
```

Vì backend "mù", việc **gate truy cập** không nằm ở backend mà ở `ConsentLedger.canAccess` on-chain. Backend chỉ là tấm chắn phụ: nếu consent đã revoke, `canAccess` trả `false` → backend từ chối trả payload (`backend/src/routes/keyShare.routes.js:1273-1343`).

---

## 2. Hai loại thu hồi — bảng so sánh

| | **Revoke consent (1 record)** | **Revoke delegation** | **Revoke sub-delegation** |
|---|---|---|---|
| Ai làm | Patient (chủ hồ sơ) | Patient | Bác sĩ cha đã sub-delegate |
| Hàm contract | `revoke` / `revokeFor` | `revokeDelegation` | `revokeSubDelegation` |
| Có BySig? | Không cần — `revoke`/`revokeFor` không ký EIP-712 | **Không có BySig** | Không có BySig |
| Ai trả gas | Sponsor (relayer); hết quota → patient tự trả | **Luôn patient tự trả** | Bác sĩ cha tự trả |
| Epoch bump? | Không | **Có** (`delegationEpoch[patient][delegatee] += 1`) | **Có** (`delegationEpoch[patient][subDelegatee] += 1`) |
| UI mobile | `AccessLogScreen.tsx` | `DelegationScreen.tsx` | Chưa có UI (chỉ có service `delegationService.revokeSubDelegation` + hook `useRevokeSubDelegation` chưa wire vào màn nào) |
| Service mobile | `consentService.revokeConsent` | `delegationService.revokeAuthority` | `delegationService.revokeSubDelegation` |

Nguồn: `contracts/src/ConsentLedger.sol:345,362,468,534`; `mobile/src/services/consent.service.js:218`; `mobile/src/services/delegation.service.js:128,207`.

---

## 3. Phần contract — sơ bộ từng hàm liên quan

### 3.1 `revoke(grantee, inputCidHash)` — patient tự gọi
`contracts/src/ConsentLedger.sol:345-356`

```solidity
function revoke(address grantee, bytes32 inputCidHash) external nonReentrant {
    bytes32 root = _walkToRoot(inputCidHash);                 // chấp nhận BẤT KỲ version trong chain
    bytes32 key = keccak256(abi.encode(msg.sender, grantee, root));
    Consent storage c = _consents[key];
    if (!c.active) revert Unauthorized();
    if (c.patient != msg.sender) revert Unauthorized();        // chỉ chủ hồ sơ
    c.active = false;
    emit ConsentRevoked(msg.sender, grantee, root, uint40(block.timestamp));
}
```

- `_walkToRoot` (`ConsentLedger.sol:191-200`) đi ngược record-chain về **root canonical**, vì consent luôn lưu ở root (medical episode model). Nhờ vậy caller truyền cidHash của **bất kỳ phiên bản** nào cũng revoke đúng key. Đây là lý do mobile/backend cố tình tìm root trước khi gọi.
- `msg.sender` phải là `c.patient` → đây là vì sao biến thể self-pay yêu cầu đúng ví bệnh nhân.

### 3.2 `revokeFor(patient, grantee, inputCidHash)` — sponsor gọi hộ
`contracts/src/ConsentLedger.sol:362-375`

Giống `revoke` nhưng gate bằng `authorizedSponsors[msg.sender]` (`ConsentLedger.sol:363`) thay vì `msg.sender == patient`. Cho phép relayer (sponsor wallet) revoke hộ → gasless cho bệnh nhân. Vẫn kiểm `c.patient == patient`.

### 3.3 `revokeDelegation(delegatee)` — KHÔNG có BySig
`contracts/src/ConsentLedger.sol:468-484`

```solidity
function revokeDelegation(address delegatee) external nonReentrant {
    uint256 data = _delegations[msg.sender][delegatee];
    if (data == 0 || ((data >> ACTIVE_BIT) & 1) == 0) revert NoActiveDelegation();
    _delegations[msg.sender][delegatee] = data & ~(1 << ACTIVE_BIT);   // tắt bit active
    unchecked { delegationEpoch[msg.sender][delegatee] += 1; }          // ← EPOCH BUMP
    emit DelegationRevoked(msg.sender, delegatee);
}
```

- Không có hàm `revokeDelegationBySig` — `msg.sender` chính là patient. Đây là lý do (xác nhận trong code comment `delegation.service.js:119-127`) patient **tự trả gas**.
- **Epoch bump** là cơ chế cascade then chốt (xem §4).

### 3.4 `revokeSubDelegation(patient, subDelegatee)`
`contracts/src/ConsentLedger.sol:534-548`

Chỉ **cha trực tiếp** (`delegationParent[patient][subDelegatee] == msg.sender`, dòng 539) được revoke. Cũng tắt bit active + **bump epoch của subDelegatee** (dòng 545).

### 3.5 Vì sao epoch bump đủ để cascade — `canAccess`
`canAccess`: `contracts/src/ConsentLedger.sol:679-706`; logic epoch/cascade nằm trong `_hasValidNormalConsent`: `contracts/src/ConsentLedger.sol:711-766`

Khi đọc, `canAccess` → `_hasValidNormalConsent`. Nếu consent này phát sinh từ **bulk delegation** (`consentDelegationSource[key] != 0`):

```
delegationEpoch[patient][delegator] != consentDelegatorEpochAtGrant[key]  → return false   (ConsentLedger.sol:742)
```

Tức là tại thời điểm `grantUsingDelegation`, hợp đồng chụp lại epoch hiện tại (`consentDelegatorEpochAtGrant`, dòng 603). Khi patient revoke delegation → epoch tăng → snapshot không khớp nữa → mọi consent con **tự chết** mà không cần ghi lại từng cái. Tiếp đó còn walk ngược chuỗi sub-delegation (dòng 746-762) kiểm `delegationParentEpochAtCreate` cho đa-hop.

Với **per-record delegation** (`recordDelegationSource[key] != 0`, dòng 727-734): khi consent nguồn của bác sĩ A bị revoke/expire/mất `allowDelegate`, consent con cũng `false`.

> Kết luận học thuật: thu hồi delegation là **O(1) on-chain** (một phép cộng epoch), còn việc vô hiệu hàng loạt được dời sang lúc **đọc** (`canAccess`) — không có vòng lặp ghi tốn gas khi revoke.

---

## 4. Sơ đồ luồng — Revoke consent một record (end-to-end)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MOBILE  AccessLogScreen.tsx  (patient nhấn "Thu hồi")                         │
│   handleRevoke / handleRevokeGrantee  (AccessLogScreen.tsx:726, :753)         │
│        │  Alert xác nhận                                                       │
│        ▼                                                                       │
│ consentService.revokeConsent(target, cidHash)   (consent.service.js:218)      │
│   1. gateOrThrow('Xác thực để thu hồi…')  ← biometric MFA (dòng 242)          │
│   2. withSelfPayFallback(                                                      │
│        relayerCall: DELETE /api/records/:cidHash/access/:grantee  (dòng 255)  │
│        selfPayWrite: ConsentLedger.revoke(grantee, cidHash)       (dòng 261)  │
│      )                                                                         │
└───────────┬─────────────────────────────────────────────┬───────────────────┘
            │ (còn quota)                                    │ (402 hết quota)
            ▼                                                ▼
┌─────────────────────────────────┐        ┌──────────────────────────────────┐
│ BACKEND                          │        │ MOBILE tự trả gas                 │
│ DELETE /records/:cid/access/:adr │        │ walletClient.writeContract(       │
│ (record.routes.js:847)           │        │   ConsentLedger.revoke )          │
│  • chỉ owner mới revoke (:858)   │        │ msg.sender = ví patient           │
│  • walk root + gom cả chain(:862)│        │ (selfPayFallback.js:71)           │
│  • relayer.sponsorRevoke(:907)   │        └─────────────────┬────────────────┘
│       → ConsentLedger.revokeFor  │                          │
│  • applyRevoke KeyShare (:946)   │                          │
│       status='revoked', payload='' │                        │
│  • emit 'access_revoked' (:968)  │                          │
└─────────────────┬────────────────┘                          │
                  │ tx confirm                                 │ tx confirm
                  ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ON-CHAIN ConsentLedger:  c.active=false  +  emit ConsentRevoked               │
└─────────────────┬─────────────────────────────────────────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ BACKEND WORKER  consentLedgerSync.handleConsentRevoked (consentLedgerSync:497)│
│  • collectDescendantCidHashes(root) → mọi version trong chain                  │
│  • applyRevoke(patient→grantee) cho từng cid  (dòng 534)  [chắc chắn 100%]     │
│  • cascade: revoke cả KeyShare mà grantee là SENDER (per-record re-share)      │
│             (dòng 549-577)                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ai trả gas / ai đọc được gì trong luồng này

- **Gas**: đường relayer → **sponsor wallet** trả (trừ 1 lượt quota). Hết 100 lượt/tháng → backend trả `402 requiresOwnWallet` (`record.routes.js:913-919`) → mobile bắt và **tự trả gas** từ ví Web3Auth của patient (`selfPayFallback.js:43-73`).
- **Mã hoá**: không có payload mới nào được tạo. Ngược lại, `applyRevoke` **xoá** `encryptedPayload` (đặt `''`) + `status='revoked'` (`keyShareWriter.service.js:401-407`).
- **Sau khi revoke ai đọc được gì**: người bị thu hồi gọi `GET /api/key-share/record/:cidHash` sẽ bị `canAccess=false` → backend trả `403 CONSENT_REVOKED` (`keyShare.routes.js:1337-1342`). Họ không còn `encryptedPayload` để lấy aesKey.

> Lưu ý quan trọng (xác nhận trong code): nếu người bị revoke chính là **người TẠO record** (`createdBy == grantee`), worker **cố tình KHÔNG** xoá KeyShare tự-chia-sẻ của họ (`consentLedgerSync.service.js:511-521`). Lý do: bác sĩ đã từng đọc nội dung thì "không thể bắt quên"; xoá chỉ phá khả năng họ đọc lại ghi chú của chính mình mà không tăng an toàn thực sự.

---

## 5. Luồng — Revoke delegation (uỷ quyền) end-to-end

```
MOBILE  DelegationScreen.tsx
  handleRevoke(item)  (DelegationScreen.tsx:975)   ← cảnh báo "tất cả uỷ quyền con + hồ sơ
        │                                            bác sĩ này chia sẻ sẽ bị vô hiệu" (:978)
        ▼
delegationService.revokeAuthority(delegatee)  (delegation.service.js:128)
  • publicClient.simulateContract(revokeDelegation)         (:140)
  • gateOrThrow('Để thu hồi quyền uỷ quyền…')  ← biometric  (:147)
  • walletClient.writeContract(request)   ← PATIENT TỰ TRẢ GAS, không qua relayer (:148)
  • waitForTransactionReceipt                                (:149)
        ▼
ON-CHAIN  revokeDelegation:  active-bit=0  +  delegationEpoch += 1  +  emit DelegationRevoked
        ▼
BACKEND WORKER  consentLedgerSync.handleDelegationRevoked (consentLedgerSync:281)
  • Delegation row → status='revoked'                        (:290)
  • BFS cascade: mọi delegation con (parentDelegator = delegatee) → status='revoked',
    revokedBy='cascade'  + emit 'delegationUpdated'          (:312-348)
```

Khác biệt cốt lõi so với revoke consent:

- **Không có biến thể BySig** trong contract → `revokeAuthority` gọi thẳng `writeContract`, **không** dùng `withSelfPayFallback`, **không** trừ quota. Patient luôn tự trả gas (một khoản rất nhỏ). Đã ghi rõ trong comment service `delegation.service.js:119-127`.
- Cascade on-chain là **epoch bump** (§3.5). Backend BFS chỉ là **cập nhật cache DB** để UI hiển thị đúng — không phải là nguồn an toàn. Nguồn an toàn vẫn là `canAccess` từ chối do epoch lệch.

---

## 6. Gas sponsorship & quota cho revoke consent

`backend/src/services/relayer.service.js`

```
sponsorRevoke(walletAddress, grantee, cidHash)               (relayer.service.js:476)
  ├─ ensureSponsorWalletConfigured()
  ├─ consumeQuota(address, 'revoke')                          (:480)
  │     → updateMany tăng signaturesThisMonth nếu < 100 (atomic)  (:292-298)
  │     → nếu count==0 ⇒ throw QUOTA_EXHAUSTED (statusCode 429)   (:299-304)
  ├─ sponsorWrite → ConsentLedger.revokeFor(address, grantee, cidHash)  (:482-487)
  └─ waitForTransactionReceipt                                 (:489)
```

- Pool thống nhất **100 chữ ký sponsor/tháng** dùng chung cho mọi sponsor-action (upload, grant, delegate, **revoke**…): `QUOTA_LIMITS.SIGNATURES_PER_MONTH = 100` (`relayer.service.js:21-22`).
- `consumeQuota` **đặt chỗ atomic** (tăng counter chỉ khi còn < 100) để hai request đồng thời ở ranh giới không vượt cap (`relayer.service.js:286-304`). `bumpSignatureCounter` nay là **no-op** (đã gộp vào consumeQuota) (`relayer.service.js:309-313`).
- Khi quota cạn, route revoke trả **402** (không phải 429) với `requiresOwnWallet:true` (`record.routes.js:913-919`) — `isQuotaExhausted` bắt cả 402+requiresOwnWallet lẫn code `QUOTA_EXHAUSTED` (`selfPayFallback.js:25-31`).
- **revokeDelegation KHÔNG đụng quota** — vì không qua relayer (xem §5).

---

## 7. Đánh dấu / xoá KeyShare — hai tầng

| Tầng | Khi nào chạy | Hàm | Tác động lên row |
|---|---|---|---|
| **Best-effort (instant UI)** | Ngay khi mobile gọi revoke; backend route đã xử lý | `applyRevoke` trong `DELETE /records/.../access/...` (`record.routes.js:946`) | `status='revoked'`, `encryptedPayload=''` cho **mọi cid trong chain**, nhóm theo từng sender (`record.routes.js:938-953`) |
| **Chắc chắn (event-driven)** | Khi worker bắt event `ConsentRevoked` từ chain | `handleConsentRevoked` → `applyRevoke` (`consentLedgerSync.service.js:534`) | Như trên + **cascade** revoke các re-share mà grantee là sender (`:549-577`) |

`applyRevoke` (`keyShareWriter.service.js:326-424`) có **timestamp guard**: nếu row mới hơn `sourceTimestamp` thì skip (`:380-399`) — tránh một event revoke cũ (đến trễ từ catch-up queue) ghi đè một share vừa mới cấp lại. Đây là lý do phải truyền `sourceTimestamp` chuẩn (event dùng `timestamp` từ contract, đơn vị giây × 1000 — `consentLedgerSync.service.js:527-532`).

Ngoài ra `DELETE /api/key-share/:id` (`keyShare.routes.js:1554-1586`) cho **người gửi (sender)** tự gỡ một KeyShare riêng lẻ (đặt `status='revoked'` qua `applyStatusFlip`). Mobile gọi nó như bước **dọn off-chain bổ sung** sau khi revoke on-chain (`consent.service.js:269-275`), best-effort, không fatal nếu lỗi.

---

## 8. Những điểm dễ bị hỏi khi bảo vệ (Q&A nhanh)

- **"Vì sao revoke không cần chữ ký EIP-712?"** — `revoke`/`revokeFor` không sửa quyền theo hướng *mở rộng* mà *thu hẹp*; gate đã đủ chặt bằng `c.patient == msg.sender` (self) hoặc `authorizedSponsors` (revokeFor). Grant thì mới cần chữ ký vì relayer cấp quyền hộ.
- **"Revoke delegation tốn gas của ai?"** — Của bệnh nhân, vì không có BySig (contract chỉ có `revokeDelegation` lấy `msg.sender` làm patient — `ConsentLedger.sol:468-469`). Khoản gas rất nhỏ (một SSTORE + một increment).
- **"Nếu backend bị chiếm, kẻ tấn công có revoke bậy được không?"** — Sponsor chỉ `revokeFor` (thu hồi), không cấp quyền cho mình; và mọi truy cập thật vẫn bị `canAccess` on-chain chặn. Việc revoke bậy là DoS, không phải leak — và vẫn để lại event `ConsentRevoked` audit được.
- **"Sau revoke, bác sĩ con (do delegation) còn đọc được không?"** — Không. `canAccess` so `delegationEpoch` hiện tại với snapshot lúc grant; epoch đã +1 nên trả `false` ngay cả khi DB cache chưa kịp cập nhật (`ConsentLedger.sol:742`).
- **"Vì sao có hai chỗ xoá KeyShare?"** — Tầng best-effort cho phản hồi UI tức thì; tầng event-driven đảm bảo nhất quán kể cả khi self-pay (mobile không gọi backend route) — worker vẫn bắt event và dọn (`consentLedgerSync.service.js:497`).

---

## Nguồn đã đọc

- `mobile/src/services/consent.service.js` (revokeConsent, withSelfPayFallback, biometric gate)
- `mobile/src/services/delegation.service.js` (revokeAuthority, revokeSubDelegation — không BySig, patient tự trả gas)
- `mobile/src/screens-v2/AccessLogScreen.tsx` (handleRevoke / handleRevokeGrantee, UI thu hồi consent)
- `mobile/src/screens-v2/RecordDetailScreen.tsx` (grep revoke — màn này chủ yếu là share/grant, không chứa logic revoke)
- `mobile/src/screens-v2/DelegationScreen.tsx` (handleRevoke uỷ quyền)
- `mobile/src/utils/selfPayFallback.js` (isQuotaExhausted, withSelfPayFallback)
- `contracts/src/ConsentLedger.sol` (revoke, revokeFor, revokeDelegation, revokeSubDelegation, canAccess, _hasValidNormalConsent, epoch bump, _walkToRoot)
- `backend/src/routes/record.routes.js` (DELETE /:cidHash/access/:address — root walk, sponsorRevoke, applyRevoke, 402 self-pay)
- `backend/src/routes/keyShare.routes.js` (DELETE /:id sender-revoke, /record/:cidHash gate 403, /:id/claim revalidate)
- `backend/src/services/relayer.service.js` (sponsorRevoke, consumeQuota, QUOTA_LIMITS, bumpSignatureCounter no-op)
- `backend/src/services/keyShareWriter.service.js` (applyRevoke — status='revoked', encryptedPayload='', timestamp guard)
- `backend/src/services/consentLedgerSync.service.js` (handleConsentRevoked, handleDelegationRevoked — cascade cache + authoredCidHashes exclusion)
