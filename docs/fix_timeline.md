# Lộ trình Sửa lỗi & Chuyển đổi (Timeline)

Bạn đang thắc mắc: **"Fix lỗi bây giờ trên Web cũ, hay chuyển sang Mobile rồi mới fix?"**

**Câu trả lời:**

## Giai đoạn 1: Sửa Lỗi NGAY TRÊN WEB (Tuần này)
**Mục tiêu:** Đảm bảo thư mục `src/services` hoạt động hoàn hảo 100%.

*   **Tại sao lại sửa trên Web cũ?**
    *   **Debug siêu dễ:** Bạn có `Chrome DevTools` và `MetaMask Extension`. Việc check log, kiểm tra `localStorage`, và ký giao dịch nhanh hơn gấp 10 lần so với làm trên điện thoại.
    *   **Tránh "Nợ nần chồng chất":** Mang một logic lỗi sang môi trường mới (Mobile) sẽ khiến bạn rối loạn: "Lỗi này do code cũ hay do môi trường Mobile mới?".

*   **Làm gì:** Sửa hết các lỗi về:
    *   Tính toán phí gas.
    *   Logic mã hóa/giải mã (NaCl).
    *   Gọi API backend bị sai data.

## Giai đoạn 2: Đóng gói & Di cư (Migrate) (Tuần sau)
Sau khi Logic đã ngon lành:
1.  **ĐÓNG BĂNG (Freeze)** dự án Web hiện tại. Không code thêm dòng nào nữa.
2.  **COPY** thư mục `src/services`, `src/utils` sang dự án Expo mới.
3.  Từ giờ phút này, **Code Logic** (JS) và **Giao diện** (UI) sẽ chỉ được phát triển trên Mobile.

## Giai đoạn 3: Phát triển Mobile (Tuần sau nữa)
*   Dựng UI mới bằng React Native.
*   Tích hợp WalletConnect.

---
**Tóm lại:**
> Hãy dành **1-2 ngày tới** để fix sạch trơn các **Lỗi Logic** trên bản Web hiện tại. Đừng đụng vào CSS/Giao diện. Sau đó mới tính chuyện chuyển nhà sang Mobile.
