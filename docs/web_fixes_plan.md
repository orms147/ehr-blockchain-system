# Kế hoạch Thực hiện: Sửa Lỗi Web & Nâng cấp UX

Tài liệu này chi tiết hóa các bước để giải quyết 9 vấn đề/yêu cầu bạn đã nêu. Mục tiêu là hoàn thiện trải nghiệm người dùng trên Web trước khi chuyển sang Mobile.

## 1. Kiểm tra Cấp quyền Trùng lặp (Duplicate Grant Prevention)
**Vấn đề:** Bệnh nhân cấp quyền lại cho bác sĩ đã có quyền -> Tốn phí gas vô ích.
**Giải pháp:**
*   Trong `ShareKeyModal.jsx`, khi chọn Bác sĩ hoặc nhập địa chỉ ví:
    *   Gọi `recordService.getAccessList(cidHash)`.
    *   Kiểm tra xem địa chỉ ví bác sĩ có trong danh sách trả về hay không.
    *   Nếu có: Hiển thị cảnh báo "Bác sĩ này đã có quyền truy cập. Bạn có muốn gia hạn?".
    *   Ẩn nút "Share" hoặc chuyển thành nút "Extend Access" (Gia hạn).

## 2. Hệ thống Thông báo (Notifications - Chuông)
**Vấn đề:** Thiếu thông báo thời gian thực khi có quyền mới hoặc yêu cầu mới.
**Giải pháp:**
*   **Frontend:**
    *   Tạo `NotificationContext` để quản lý trạng thái thông báo toàn cục.
    *   Thêm icon **Chuông (Bell)** vào `Navbar.tsx`.
    *   Logic: Polling API mỗi 30s (đơn giản nhất) hoặc dùng WebSocket (nếu server hỗ trợ). Với Web3, polling backend API là an toàn nhất.
    *   API cần gọi: `/api/notifications/unread-count`.
*   **Backend:**
    *   Cần API trả về danh sách thông báo (Yêu cầu mới, KeyShare mới).

## 3. Vai trò Kép (Doctor as Patient)
**Vấn đề:** Bác sĩ muốn đóng vai bệnh nhân để đi khám (Role Switching).
**Giải pháp:**
*   **Logic:**
    *   Update `frontend/src/app/register/page.tsx`: Cho phép đăng ký thêm role nếu đã có role kia. Không hiển thị lỗi "Already registered" mà hiển thị "Switch Role".
    *   Sử dụng `useAuthRoles.js` để lưu mảng `available: ['doctor', 'patient']`.
*   **UI:**
    *   Thêm nút **"Chuyển Vai Trò" (Switch Role)** vào Dropdown ở Avatar (Navbar) hoặc Sidebar.

## 4. Sửa Lỗi UI Dashboard Bác sĩ
**Vấn đề:** Nút Refresh hỏng, Timer không hiện, nút Ẩn đặt sai chỗ.
**Giải pháp:**
*   **Refresh Button:** Kiểm tra `DoctorOutgoingRequestsTab.tsx`. Đảm bảo `loading` state được reset đúng sau khi fetch xong.
*   **Timer (Thời gian còn lại):** Kiểm tra logic tính toán `diffMs` trong `DoctorSharedRecordsTab.tsx`. Đảm bảo `expiresAt` từ backend trả về đúng format ISO. Hiển thị đếm ngược thời gian thực (real-time countdown) dùng `setInterval`.
*   **Nút Ẩn (Hide/Archive):** Di chuyển nút `EyeOff` (Ẩn) vào trong Card hoặc menu 3 chấm (...) cho gọn gàng, đồng bộ với giao diện Patient.

## 5. Làm rõ Yêu cầu Truy cập (Wait, doctors want WHAT?)
**Vấn đề:** Bệnh nhân nhận yêu cầu truy cập nhưng không biết bác sĩ muốn xem hồ sơ nào (chỉ hiện CID).
**Giải pháp:**
*   **Frontend:** Trong `AccessRequestList.jsx`, nếu `request.recordTitle` bị null:
    *   Gọi `recordService.getRecord(request.cidHash)` để lấy metadata (Title) từ IPFS/Server.
    *   Hiển thị Title rõ ràng: "Xin xem hồ sơ: **Chụp X-Quang Phổi**".

## 6. Thông báo Thành công (Success Toasts)
**Vấn đề:** Người dùng không biết đã share/request thành công chưa.
**Giải pháp:**
*   Thêm `toast.success()` vào block `checkTransaction()` hoặc `onSuccess` callback của các hàm `handleShare`, `handleRequest`.

## 7. Phân Tích An Toàn: Chuyển Vai Trò (Safety Analysis)
**Vấn đề:** Người dùng lo ngại "Nếu tôi là Bệnh nhân nhưng cũng có role Bác sĩ, liệu khi xem Dashboard Bệnh nhân có bị lẫn lộn dữ liệu truy cập của Bác sĩ không?"

**Trả lời: KHÔNG.** Hệ thống cách ly hoàn toàn dữ liệu dựa trên VIEW (Màn hình), không chỉ dựa trên Ví:

*   **View Bệnh Nhân (`/dashboard/patient`):**
    *   Chỉ gọi API `/api/records/my`: Chỉ trả về hồ sơ do **chính bạn tạo**.
    *   Tuyệt đối không gọi API lấy hồ sơ được chia sẻ.
*   **View Bác Sĩ (`/dashboard/doctor`):**
    *   Chỉ gọi API `/api/records/shared`: Chỉ trả về hồ sơ **người khác chia sẻ cho bạn**.
    *   Tuyệt đối không hiển thị hồ sơ cá nhân của bạn ở đây.

**Cơ chế Bảo vệ:**
*   Dù bạn dùng chung 1 ví cho 2 vai trò, Backend tách biệt rõ ràng 2 nguồn dữ liệu này.
*   Khi bạn đang ở Dashboard Bệnh nhân, dù có ai đó chia sẻ hồ sơ cho bạn (với tư cách Bác sĩ), nó cũng **không hiện lên** làm rối màn hình. Nó chỉ hiện khi bạn **Chủ động chuyển sang vai trò Bác sĩ**.

---

## Các Bước Triển khai (Timeline)

### Ngày 1: Core Logic
1.  [ ] **Fix Duplicate Grant:** `ShareKeyModal.jsx`.
2.  [ ] **Role Switching:** `RegisterPage` + `Navbar` update.

### Ngày 2: UI & UX
3.  [ ] **Access Request Detail:** Hiển thị Title hồ sơ.
4.  [ ] **Doctor UI Polish:** Fix Timer, Hide Button, Refresh Button.
5.  [ ] **Add Bell Notification:** `Navbar` Integration.

Hãy duyệt kế hoạch này để mình bắt đầu code (ưu tiên Ngày 1 trước).
