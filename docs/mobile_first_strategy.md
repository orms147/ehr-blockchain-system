# Chiến lược Mobile-First: Tối ưu cho App, Web là Phụ

Nếu định hướng của bạn là **90% Mobile**, **10% Web (có thì tốt)**, chúng ta sẽ thay đổi hoàn toàn cách tiếp cận:

> **CHIẾN LƯỢC MỚI: Dùng Expo (React Native) làm Nền tảng Chính**
> *   Viết code 1 lần cho Mobile (iOS/Android).
> *   Xuất bản ra Web "miễn phí" nhờ tính năng **Expo Web** (React Native Web).

## 1. Lợi ích của Hướng đi này
*   **Tập trung tuyệt đối:** Bạn chỉ code trên một dự án duy nhất (Expo). Không phải duy trì 2 repo (Next.js + React Native).
*   **Web vẫn chạy tốt:** Expo Web sẽ render giao diện Mobile của bạn lên trình duyệt. Nó trông giống như một "App chạy trên web" (Single Page App), hoàn toàn đủ dùng cho mục đích "phụ".
*   **Tận dụng lại Logic:** 100% logic JS (Crypto, API Service) được tái sử dụng.

## 2. Những Thay đổi Cần làm NGAY LẬP TỨC

### A. Dừng phát triển UI trên Next.js
*   Đừng tốn thời gian chỉnh sửa HTML/CSS trên dự án hiện tại nữa. Nó sẽ không giúp ích gì cho App.
*   Chỉ giữ lại Next.js để tham khảo Logic hoặc làm backend proxy (nếu cần).

### B. Khởi tạo Dự án Expo (Stack mới)
Bạn cần tạo một folder dự án mới:
```bash
npx create-expo-app ehr-mobile --template blank
```
*   **Thư viện UI:** Cài đặt **NativeWind** (hoặc Tamagui) để viết CSS giống hệt Tailwind nhưng chạy được trên Mobile. Điều này giúp bạn tận dụng lại tư duy Tailwind hiện có.
*   **Điều hướng:** Dùng **Expo Router** (cấu trúc file giống hệt Next.js App Router `app/index.tsx`, `app/dashboard/page.tsx`). Rất dễ học vì bạn đã quen Next.js.

### C. Chuyển đổi Web3 (Thách thức lớn nhất)
Trên Mobile không có Extension MetaMask. Bạn phải chuyển sang dùng:
*   **WalletConnect (AppKit):** Đây là chuẩn để App của bạn "gọi" App Ví (MetaMask/Trust Wallet) trên điện thoại lên để ký.
*   **Cấu hình:** Cần setup `projectId` trên WalletConnect Cloud (miễn phí).

## 3. Lộ trình Chuyển đổi (Action Plan)

1.  **Bước 1: Setup Môi trường Mobile (Ngay hôm nay)**
    *   Cài Node.js, Expo Go trên điện thoại.
    *   Tạo repo mới.
    *   Copy toàn bộ thư mục `src/services`, `src/utils` từ dự án cũ sang.

2.  **Bước 2: Dựng lại "Xương sống" (1 tuần)**
    *   Dựng màn hình Login (kết nối Ví qua WalletConnect).
    *   Dựng màn hình Dashboard cơ bản (List hồ sơ).
    *   Đảm bảo gọi được API Backend và Smart Contract từ điện thoại (lưu ý: `localhost` trên điện thoại phải đổi thành IP LAN `192.168.1.x`).

3.  **Bước 3: Tinh chỉnh UI (2 tuần)**
    *   Vẽ lại các Component bằng `<View>`, `<Text>`.
    *   Dùng NativeWind để style nhanh.

4.  **Bước 4: Bật tính năng Web (Cuối cùng)**
    *   Chạy lệnh `npx expo export:web`.
    *   Bùm! Bạn có phiên bản Web chạy được, giao diện y hệt App.

## 4. Kết luận
Đây là con đường **ngắn nhất và hiệu quả nhất** cho mục tiêu "App là chính". Bạn sẽ vất vả đoạn đầu (setup môi trường Mobile), nhưng sau đó sẽ đi rất nhanh vì không phải lo maintenance 2 dự án song song.
