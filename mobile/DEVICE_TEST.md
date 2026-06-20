# Runbook kiểm thử thiết bị (Emulator + máy thật) — EHR Mobile (ViEH)

> Mục tiêu: chứng minh app chạy E2E thật (login → tạo hồ sơ mã hoá → chia sẻ →
> giải mã → thu hồi → ...). Kết quả checklist §6 chính là **bằng chứng Bảng 4.8**
> trong Quyển (11 use case). Soạn 2026-06-20.

## 0. Hạ tầng đã kiểm (không cần dựng lại)
- `eas.json`: profile **`preview`** = APK / internal distribution → dùng để build APK tải máy thật.
- `app.json`: scheme `erhsystem`, package `com.ehrchain.mobile`, **eas projectId đã link** (`f165f761-...`, owner `bachnh`).
- Workflow **managed** — chưa có thư mục `android/`; lần đầu `npm run android` sẽ tự prebuild native (vài phút).
- Contracts: `forge test` 140/0 + 5 contract verified trên Arbiscan. `backend/.env` đã đầy đủ.
- Type-check: code đang chạy (`src/screens-v2`) sạch type; `src/screens` là **code chết** (0 import) đã loại khỏi type-check.

---

## 1. Điền `mobile/.env` (BẮT BUỘC — nếu không, không login/upload được)
| Biến | Hiện tại | Cần điền |
|---|---|---|
| `EXPO_PUBLIC_WEB3AUTH_CLIENT_ID` | `YOUR_...` ❌ | Client ID từ dashboard.web3auth.io (đúng network Sapphire khớp `src/config/web3authContext.ts`) |
| `EXPO_PUBLIC_PINATA_JWT` | `YOUR_...` ❌ | JWT Pinata scope tối thiểu `pinFileToIPFS` |
| `EXPO_PUBLIC_API_URL` | `10.0.2.2:3001` | Tuỳ thiết bị — xem §2 |
| Địa chỉ contract, RPC, subgraph | ✅ đã sync 2026-06-19 | giữ nguyên |

> ⚠️ `EXPO_PUBLIC_*` được **inline lúc build**. Đổi `.env` ⇒ phải **rebuild** (chạy lại `npm run android` / `eas build`).

## 2. ⚠️ `API_URL` KHÁC NHAU giữa 2 thiết bị (lỗi hay gặp nhất khi test song song)
| Thiết bị | API_URL |
|---|---|
| **Emulator (AVD)** | `http://10.0.2.2:3001` (10.0.2.2 = `localhost` của máy PC nhìn từ emulator) |
| **Máy thật (APK)** | `http://<LAN-IP-của-PC>:3001` — vd `http://192.168.1.12:3001`. Điện thoại + PC **cùng WiFi**. Lấy IP: `ipconfig` → mục IPv4. |

**Test song song 2 máy cùng lúc** ⇒ 2 giá trị API_URL khác nhau, mà mỗi APK chỉ build được 1 giá trị. Hai cách:
- (A) **Khuyên dùng:** deploy backend public tạm (ngrok `ngrok http 3001`, hoặc Render free) → CẢ HAI thiết bị dùng cùng 1 URL public. Đơn giản nhất.
- (B) Build 2 bản: bản emulator (10.0.2.2) + bản APK máy thật (LAN-IP). Phiền hơn.

## 3. ⚠️ Web3Auth: đăng ký TRƯỚC, nếu không đăng nhập mạng xã hội sẽ FAIL
Trên dashboard.web3auth.io → project đang dùng:
1. Thêm **Android package**: `com.ehrchain.mobile`.
2. Thêm **SHA-1 fingerprint** (2 cái KHÁC nhau, đăng ký cả hai):
   - Emulator/dev (debug keystore): `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android` → lấy dòng SHA1.
   - APK qua EAS (keystore EAS quản lý): `eas credentials` → Android → Keystore → xem **SHA-1 Fingerprint**.
3. **Redirect URI**: `erhsystem://auth` (khớp `app.json` scheme + `.env`).

> Đây là nguyên nhân #1 khiến login social báo lỗi trên thiết bị thật mà chạy ổn trên Expo Go. Nhớ làm trước.

## 4. Chạy backend (cho cả 2 thiết bị)
```
cd backend && npm run dev
```
(cần Neon + `.env` — đã đủ). Kiểm tra sống: mở `http://localhost:3001/api/health` → 200.
Nếu test máy thật bằng LAN-IP: cho phép Node qua Windows Firewall (port 3001).

## 5A. Test trên Android Studio Virtual Device (LÀM TRƯỚC)
1. Android Studio → Device Manager → tạo/khởi động 1 AVD **API 34+** (chọn image **có Google Play** để Web3Auth + biometric chạy tốt). Bật vân tay giả lập: Settings → Security → Fingerprint (rồi dùng `adb -e emu finger touch 1` khi app hỏi vân tay).
2. `.env`: `API_URL=http://10.0.2.2:3001`.
3. `cd mobile && npm run android` (lần đầu prebuild ~vài phút). App tự cài + mở trên emulator.
4. Chạy checklist §6.

## 5B. Build APK + test máy thật (sau khi emulator OK)
1. `.env`: `API_URL=http://<LAN-IP>:3001` (hoặc URL public §2A).
2. `eas login` (tài khoản `bachnh`).
3. `eas build -p android --profile preview` → build trên cloud → nhận **link tải `.apk`** (hoặc QR).
4. Tải `.apk` về điện thoại → cài (bật "Cài từ nguồn không xác định").
5. Mở app → chạy lại checklist §6.

---

## 6. ✅ CHECKLIST E2E 11 USE CASE (bằng chứng Bảng 4.8)
Chạy trên CẢ emulator (V) và máy thật (T). Ghi PASS/FAIL + ghi chú. Chụp màn hình các bước chính (dùng cho Hình 4.9/4.10 của Quyển).

| Mã | Use case | Các bước | Kỳ vọng | V | T | Ghi chú |
|---|---|---|---|---|---|---|
| UC001 | Tạo hồ sơ y tế | Login bệnh nhân → CreateRecord → nhập 1 trong 5 loại → lưu | Mã hoá tại máy, upload IPFS ra CID, đăng ký cidHash on-chain; hồ sơ hiện ở Records | ☐ | ☐ | |
| UC002 | Cấp quyền truy cập | RecordDetail → Chia sẻ → nhập ví bác sĩ + thời hạn → vân tay → ký | Ký EIP-712, relayer trả phí, tx tra cứu được trên Arbiscan; bác sĩ nhận KeyShare | ☐ | ☐ | |
| UC003 | Thu hồi quyền | AccessLog → Thu hồi 1 grantee → vân tay | canAccess về false; bác sĩ mất quyền đọc ngay; cascade nếu có chuỗi | ☐ | ☐ | |
| UC004 | Đăng ký người thân tin cậy | TrustedContacts → thêm ví người thân → ký | TC set on-chain; pre-share khoá; (S2) khi TC đọc → patient nhận thông báo + AccessLog | ☐ | ☐ | |
| UC005 | Uỷ quyền toàn quyền | Delegation → uỷ quyền bác sĩ điều trị → ký | Delegation gốc on-chain; nonce dùng chung không replay được | ☐ | ☐ | |
| UC006 | Yêu cầu truy cập của bác sĩ | Bác sĩ: RequestAccess → tạo yêu cầu (tự trả gas) → bệnh nhân duyệt | Đủ 3 loại yêu cầu + nhánh từ chối; duyệt 2 bên, MIN_APPROVAL_DELAY 15s | ☐ | ☐ | |
| UC007 | Đọc và giải mã hồ sơ | Bác sĩ nhận share → mở record | Backend gate canAccess → trả payload → mở NaCl box → tải IPFS → giải mã AES-GCM → hiện FHIR | ☐ | ☐ | |
| UC008 | Tạo phiên bản cập nhật | Bác sĩ (đã verify) → DoctorCreateUpdate cho bệnh nhân | Ghi version mới on-chain không cần bệnh nhân duyệt; khoá version tự chia sẻ ê-kíp | ☐ | ☐ | |
| UC009 | Uỷ quyền lại cho bác sĩ khác | Bác sĩ được uỷ quyền → chia sẻ tiếp | Thời hạn người nhận bị chặn trần theo người chia sẻ | ☐ | ☐ | |
| UC010 | Tạo tổ chức y tế mới | Bộ Y tế → tạo tổ chức | Sự kiện OrganizationCreated; tổ chức xuất hiện danh sách | ☐ | ☐ | |
| UC011 | Xác minh bác sĩ | Tổ chức verify bác sĩ trực thuộc + Bộ Y tế verify độc lập | Cờ verified set on-chain; bác sĩ verified mới đọc được record share đến | ☐ | ☐ | |

**Luồng phụ trợ (cũng nên test):**
- ☐ Đăng nhập ≥2 phương thức Web3Auth (Google + email OTP) trên thiết bị thật.
- ☐ Hộp thoại cam kết dữ liệu sinh trắc (Điều 3 TT 13/2025 / NĐ 13/2023) hiện đúng 3 trạng thái thiết bị (không cảm biến / chưa đăng ký vân tay / đã đăng ký).
- ☐ Huỷ vân tay khi ký → giao dịch DỪNG (không gửi).
- ☐ Mã PIN 6 số dự phòng (thiết bị không cảm biến) thiết lập + dùng được.
- ☐ Cold-start: thoát app → mở lại → Web3Auth không tự restore key → về LoginScreen (đúng thiết kế, không crash).

---

## 7. Sau khi CẢ 2 máy PASS
1. Điền kết quả thật vào **Bảng 4.8** (Quyển §4.4.3) — thay khẳng định cũ "Đạt" bằng kết quả vừa đo.
2. Chụp screenshots → dùng cho **Hình 4.9 / 4.10** (R10 đang chờ ảnh này).
3. Ghi cấu hình máy test (model điện thoại, Android version, emulator API level) — cần cho phần kiểm thử thủ công.
4. **Báo lại** → tôi đồng bộ Quyển (Bảng 4.8) + tiếp R9 (k6) trong cùng phiên backend-live.

## 8. Nếu gặp lỗi — gửi tôi
- Log Metro (terminal `npm run android`) hoặc `adb logcat | grep -iE "ehr|web3auth|error"`.
- Lỗi build EAS: link build page (có log đầy đủ).
- Tôi đọc log → sửa code → bạn rebuild. (Tôi không tự chạy Android được, nhưng debug từ log thì làm tốt.)
