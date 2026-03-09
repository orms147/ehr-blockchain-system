# Phân tích Chuyển đổi Web App sang Mobile App (EHR System)

Tài liệu này đánh giá mức độ phức tạp khi chuyển đổi hệ thống EHR hiện tại (Next.js/React) sang ứng dụng di động (React Native/Expo).

## 1. Đánh giá Tổng quan: **Độ khó Trung bình (Medium)**
Bạn **KHÔNG** phải viết lại từ đầu. Khoảng **70-80%** mã nguồn hiện tại có thể tái sử dụng trực tiếp.

*   **Logic (Business Logic):** Tái sử dụng 90%.
*   **Giao diện (UI):** Viết lại 80% (Chuyển từ HTML/CSS sang React Native Components).
*   **Thư viện (Libs):** Tương thích tốt (Ethers, NaCl, Axios).

## 2. Chi tiết các thành phần

### A. Logic & Services (Tái sử dụng hoàn toàn)
Toàn bộ thư mục `src/services/` và `src/hooks/` có thể bê sang Mobile gần như nguyên vẹn:
*   `nacl-crypto.js`: Chạy tốt trên Mobile (JS thuần).
*   `record.service.js`, `auth.service.js`: Chạy tốt (Axios hoạt động giống hệt).
*   **Lưu ý nhỏ:** Cần thay thế `localStorage`/`sessionStorage` bằng `AsyncStorage` hoặc `Expo SecureStore` để bảo mật hơn trên điện thoại.

### B. Giao diện (Cần làm lại)
Đây là phần tốn công nhất. React Native không dùng HTML (`<div>`, `<h1>`) mà dùng Native Components (`<View>`, `<Text>`).
*   **Tailwind CSS:** Bạn có thể dùng thư viện **NativeWind** để giữ lại gần như toàn bộ class Tailwind hiện tại (Ví dụ: `className="p-4 bg-white"` vẫn chạy được).
*   **Router:** Thay `Next.js Router` bằng `React Navigation`.

### C. Web3 & Ví (Thay đổi nhỏ)
Trên trình duyệt PC, chúng ta dùng Extension (MetaMask). Trên Mobile, cơ chế khác một chút:
*   **WalletConnect:** Đây là chuẩn để App kết nối với App Ví (MetaMask Mobile, Trust Wallet) trên điện thoại. Bạn sẽ cần cài thêm thư viện `@web3modal/react-native`.
*   **Web3Auth:** Đã có SDK riêng cho React Native (`@web3auth/react-native-sdk`), luồng đăng nhập giữ nguyên.

## 3. Lộ trình triển khai (Dự kiến 2-3 tuần)

1.  **Tuần 1: Setup & Core**
    *   Khởi tạo dự án Expo (React Native).
    *   Cài đặt NativeWind (Tailwind cho Mobile).
    *   Copy thư mục `services`, `utils`.
    *   Viết lại `storage-adapter.js` để map `localStorage` sang `SecureStore`.

2.  **Tuần 2: UI Migration**
    *   Dựng lại các màn hình chính: Login, Dashboard, Record List.
    *   Chuyển đổi thẻ HTML sang `<View>`, `<Text>`.

3.  **Tuần 3: Web3 & Crypto Integration**
    *   Tích hợp WalletConnect để ký giao dịch trên điện thoại.
    *   Test lại luồng mã hóa/giải mã (NaCl) trên môi trường Mobile thật.

## 4. Kết luận
Việc chuyển đổi là **hoàn toàn khả thi** và không quá phức tạp vì bạn đã có nền tảng Logic JS rất mạnh. Thách thức lớn nhất chỉ là ngồi chuyển đổi giao diện (UI) cho phù hợp màn hình nhỏ.
