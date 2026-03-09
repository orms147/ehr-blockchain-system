# Tóm tắt Quy trình Mã hóa & Bảo mật (Dễ hiểu)

Tài liệu này giải thích cơ chế bảo vệ dữ liệu của hệ thống EHR, trả lời câu hỏi: **"Tại sao Backend bị hack mà dữ liệu vẫn an toàn?"**

## 1. Cách mã hóa hồ sơ (Khi Bệnh nhân Upload)
Hãy tưởng tượng hồ sơ y tế là một **chiếc két sắt**.
Để đóng két sắt này, chúng ta cần một chiếc chìa khóa.

*   **Bước 1:** Hệ thống sinh ra một chiếc chìa khóa ngẫu nhiên (gọi là **Khóa Vàng** - $K_{sym}$).
*   **Bước 2:** Dùng **Khóa Vàng** để khóa chiếc két sắt (Mã hóa file hồ sơ bằng thuật toán ChaCha20).
*   **Bước 3:** Sau khi khóa xong, chiếc két sắt (file mã hóa) được gửi lên kho lưu trữ công cộng (IPFS). Ai cũng có thể thấy két, nhưng không ai mở được nếu thiếu chìa.

=> **Vấn đề:** Giờ làm sao gửi **Khóa Vàng** cho Bác sĩ mà không bị lộ trên đường đi?

## 2. Cách gửi Key (Khi chia sẻ cho Bác sĩ)
Chúng ta không thể gửi trực tiếp **Khóa Vàng**. Chúng ta sẽ dùng một chiếc hộp bảo mật đặc biệt gửi cho Bác sĩ.

*   **Bác sĩ** có một cặp khóa riêng:
    *   **Ổ khóa công khai (Public Key):** Ai cũng biết, dùng để khóa hộp.
    *   **Chìa khóa riêng tư (Private Key):** Chỉ Bác sĩ giữ, dùng để mở hộp.

*   **Quy trình gửi:**
    1.  Bệnh nhân lấy **Ổ khóa công khai** của Bác sĩ.
    2.  Bỏ **Khóa Vàng** vào một chiếc hộp nhỏ.
    3.  Dùng **Ổ khóa công khai** của Bác sĩ để bấm khóa lại.
    4.  Gửi chiếc hộp đã khóa ($EncryptedKey$) lên Server (Backend).

## 3. Cách giải mã Key (Khi Bác sĩ xem hồ sơ)
Khi Bác sĩ đăng nhập vào hệ thống:

1.  Bác sĩ tải chiếc hộp đã khóa từ Server về máy tính của mình (Client-side).
2.  Bác sĩ dùng **Chìa khóa riêng tư** (chỉ nằm trong ví của Bác sĩ) để mở hộp.
3.  Lấy được **Khóa Vàng**.
4.  Dùng **Khóa Vàng** để mở két sắt (file hồ sơ trên IPFS) và xem nội dung.

## 4. Kịch bản: Nếu Backend bị Hack?
Giả sử Hacker tấn công và kiểm soát toàn bộ Server (Backend) và Cơ sở dữ liệu.

*   **Hacker có gì?**
    *   Hacker có các **chiếc két sắt** (trên IPFS) -> Nhưng không có Khóa Vàng để mở.
    *   Hacker có các **chiếc hộp chứa khóa** (KeyShares trên DB) -> Nhưng hộp này đã bị khóa bằng **Ổ khóa công khai** của Bác sĩ.

*   **Hacker thiếu gì?**
    *   Hacker **KHÔNG CÓ** **Chìa khóa riêng tư** của Bác sĩ.
    *   Chìa khóa này nằm trong ví Metamask (hoặc Web3Auth) trên máy tính/điện thoại của Bác sĩ, **chưa bao giờ** được gửi lên Server.

**KẾT LUẬN:**
Nếu không có Chìa khóa riêng tư (Private Key) của người dùng, Hacker giống như kẻ trộm vào nhà kho thấy toàn két sắt và hộp khóa vĩnh cửu, hoàn toàn không thể xem được nội dung bên trong. Đây là cơ chế **Zero-Knowledge Architecture** (Kiến trúc không kiến thức - Server không biết dữ liệu của người dùng).

## 5. Đồng bộ Key trong Chuỗi (Chain Record)
Khi hồ sơ có nhiều phiên bản (Ví dụ: V1 -> V2 -> V3), làm sao đảm bảo các bác sĩ đều đọc được cả chuỗi?

**Kịch bản:**
1.  **Bệnh nhân** có V1 (Khóa $K_1$).
2.  **Bác sĩ A** được cấp quyền xem V1 (Có $K_1$).
3.  **Bác sĩ A** cập nhật hồ sơ -> Tạo ra **V2**.
    *   Hệ thống sinh **Khóa V2 ($K_2$)** ngẫu nhiên.
    *   Bác sĩ A tự động mã hóa $K_2$ gửi cho **Bệnh nhân** (Chủ sở hữu).
    *   Kết quả: Bệnh nhân có {$K_1, K_2$}. Bác sĩ A có {$K_1, K_2$}.

4.  **Bệnh nhân chia sẻ cho Bác sĩ B:**
    *   Bệnh nhân chọn chia sẻ hồ sơ **V2**.
    *   Hệ thống tự động phát hiện V2 thuốc chuỗi {$V_1, V_2$}.
    *   Hệ thống lấy $K_1$ và $K_2$ của Bệnh nhân.
    *   Mã hóa **CẢ HAI** khóa này bằng Public Key của **Bác sĩ B**.
    *   Kết quả: **Bác sĩ B** nhận được cả $K_1$ và $K_2$ -> Xem được toàn bộ lịch sử bệnh án.

Đây là cơ chế **"Chain Synchronization"** (Đồng bộ chuỗi), đảm bảo tính liền mạch của dữ liệu y tế.

## 6. Trường hợp Ủy quyền Tiếp (Re-delegation / Referral)
**Câu hỏi:** Nếu Bệnh nhân share cho Bác sĩ A, sau đó Bác sĩ A muốn share tiếp cho Bác sĩ B (Chuyên khoa khác), thì mã hóa bằng khóa của ai?

**Quy trình:**
1.  **Bác sĩ A đang có:** Khóa Vàng ($K_{sym}$) (đã giải mã được từ Bệnh nhân).
2.  **Bác sĩ A muốn gửi cho Bác sĩ B.**
3.  **Hành động:**
    *   Bác sĩ A lấy **Public Key của Bác sĩ B**.
    *   Bác sĩ A dùng Public Key này để mã hóa **Khóa Vàng**.
    *   Gửi gói tin ($EncryptedKey$) lên Server.

**Nguyên tắc cốt lõi:**
> "Muốn gửi quà cho ai, phải dùng **Ổ khóa công khai (Public Key)** của người đó để khóa hộp quà lại."

Do đó, dù ai là người gửi (Bệnh nhân hay Bác sĩ A), khi người nhận là **Bác sĩ B**, thì luôn phải dùng **Public Key của Bác sĩ B** để mã hóa.

## 7. Tại sao dùng Public Key của B mà Patient/Doctor A vẫn xem được?
Đây là điểm thường gây hiểu nhầm. Bí mật nằm ở chỗ: **Chúng ta KHÔNG mã hóa lại Hồ Sơ**.

**Cấu trúc thực tế:**
*   **Hồ Sơ (File):** Chỉ có 1 bản duy nhất trên IPFS, được khóa bằng **Khóa Vàng ($K_{sym}$)**. Khóa này **KHÔNG ĐỔI**.
*   **Người dùng (User):** Mỗi người sẽ giữ một phiên bản **MÃ HÓA CỦA KHÓA VÀNG** (gọi là `KeyShare`).

**Ví dụ minh họa:**
1.  **Bệnh nhân:** Có một chiếc hộp (Box P) chứa Khóa Vàng. Hộp này khóa bằng Key của Bệnh nhân.
2.  **Bác sĩ A:** Có một chiếc hộp (Box A) chứa Khóa Vàng. Hộp này khóa bằng Key của Bác sĩ A.
3.  **Khi chia sẻ cho Bác sĩ B:**
    *   Hệ thống lấy Khóa Vàng ra.
    *   Tạo một chiếc hộp mới (Box B).
    *   Bỏ Khóa Vàng vào Box B.
    *   Khóa Box B bằng **Public Key của Bác sĩ B**.
    *   Gửi Box B lên Server.

**Kết quả:**
*   Trên Server giờ có 3 chiếc hộp: Box P, Box A, Box B.
*   Cả 3 chiếc hộp đều chứa cùng 1 Khóa Vàng.
*   Bác sĩ B mở Box B -> Lấy Khóa Vàng -> Mở Hồ Sơ.
*   Bác sĩ A vẫn giữ Box A -> Vẫn mở được như bình thường.

=> Việc tạo "hộp quà" cho B không ảnh hưởng gì đến "hộp quà" của A hay Bệnh nhân.
