# Chiến lược Phát triển: Sửa Lỗi và Ưu tiên Web vs. Mobile

Tài liệu này trả lời hai câu hỏi chiến lược của bạn về việc phát triển song song Web và Mobile.

## 1. Nên Sửa Lỗi (Fix Bugs) Trên Web Trước Hay Chuyển Sang App Luôn?

Câu trả lời phụ thuộc vào **Loại lỗi (Bug Type)**:

### A. Lỗi Logic (Nghiệp vụ, Xử lý dữ liệu, API, Web3) -> **SỬA NGAY TỪ BÂY GIỜ**
*   **Ví dụ:** Lỗi tính sai phí gas, lỗi không giải mã được key, lỗi update hồ sơ bị mất dữ liệu.
*   **Lý do:** Phần Logic này (các file trong `src/services`, `src/hooks`) sẽ được **COPY nguyên xi** sang Mobile App.
*   **Hậu quả:** Nếu bạn không sửa trên Web, sang Mobile bạn sẽ gặp y hệt lỗi đó. Lúc này bạn phải sửa ở cả 2 nơi (gấp đôi công sức), hoặc tệ hơn là code bị lệch pha nhau.

### B. Lỗi Giao diện (CSS, HTML, Responsive) -> **CÓ THỂ BỎ QUA**
*   **Ví dụ:** Nút bị lệch, màu sai, vỡ layout trên màn hình nhỏ.
*   **Lý do:** Mobile App (React Native) dùng hệ thống UI hoàn toàn khác (`View`, `Text`, Flexbox) chứ không dùng HTML/CSS của Web. Đằng nào bạn cũng phải **viết lại toàn bộ giao diện** cho Mobile.
*   **Hậu quả:** Sửa CSS trên Web chỉ tốn thời gian mà không giúp ích gì cho bản Mobile.

**Kết luận:** Hãy tập trung sửa hết các lỗi Logic (Backend/Smart Contract/JS Service) cho thật ổn định trên Web trước. Đừng lo về CSS lỗi vặt.

---

## 2. Web vs. Mobile: Nên Ưu tiên cái nào hay làm song song?

Việc phát triển song song (Parallel Development) là **RẤT KHÓ** cho một team nhỏ hoặc cá nhân. Nó đòi hỏi kiến trúc dự án phức tạp (Monorepo) để chia sẻ code.

### Phương án Khuyến nghị: "Web First, Mobile Companion" (Tốt nhất cho Đồ án)

1.  **Giai đoạn 1: Hoàn thiện Web App (Core)**
    *   Tập trung 100% nguồn lực để làm Web chạy hoàn hảo mọi tính năng (Upload, Share, Revoke, Admin).
    *   Web dễ debug hơn, dễ demo cho GVHD hơn (MetaMask Extension ổn định hơn nhiều so với Mobile Wallet Linking).
    *   Đảm bảo Smart Contract và Backend logic là "Chuẩn không cần chỉnh".

2.  **Giai đoạn 2: Tách Logic ra thư viện chung (Shared Library)**
    *   Gom các file `src/services`, `src/utils`, `src/hooks` (những file không chứa JSX/HTML) vào một thư mục riêng.
    *   Đây là "Bộ não" của ứng dụng.

3.  **Giai đoạn 3: Xây dựng Mobile App (Lite Version)**
    *   Dùng React Native (Expo) dựng App.
    *   Import "Bộ não" ở trên vào.
    *   Chỉ làm các tính năng quan trọng nhất trên Mobile trước: **Xem hồ sơ (Patient)**, **Chấp nhận yêu cầu (Doctor)**. Các tính năng quản trị phức tạp (Admin) cứ để trên Web.

### Tại sao không nên làm Mobile First?
*   **Debug khó:** Debug lỗi Crypto/Web3 trên điện thoại cực kỳ vất vả (phải link ví qua lại, log khó xem).
*   **Store Review:** Đưa app lên Store (AppStore/CH Play) mất thời gian duyệt.
*   **Giới hạn hiển thị:** Làm Admin Dashboard trên điện thoại rất tù túng.

**Tóm lại:**
Hãy coi **Web App là "Trụ sở chính"** (đầy đủ mọi thứ, nơi phát triển logic), còn **Mobile App là "Chi nhánh"** (gọn nhẹ, tiện lợi, thừa hưởng logic từ trụ sở).
