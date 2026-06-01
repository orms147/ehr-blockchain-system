# Sơ đồ Astah — Index

> 9 sơ đồ UML/ER cho Quyển ĐATN EHR.
> Mỗi sơ đồ có 2 file: `.md` (markdown spec — vẽ tay trong Astah) + `.puml` (PlantUML source — Astah plugin hoặc plantuml.com/online).

## Bảng tổng quan

| # | Loại | Tên file | Chương | Tóm tắt |
|---|---|---|---|---|
| 01 | Use Case | `01-use-case.md` + `.puml` | 2.5 + Phụ lục B | 5 actor × 47 use case đầy đủ |
| 02 | Component | `02-component-3-layer.md` + `.puml` | 4.1 | Mobile / Backend / Blockchain + 4 service bổ trợ |
| 03 | Deployment | `03-deployment.md` + `.puml` | 4.1 | Hardware/service deployment thực tế |
| 04 | Class | `04-class-contracts.md` + `.puml` | 4.2 | 5 smart contract + relationships |
| 05 | ER | `05-er-prisma.md` + `.puml` | 4.3 | 10+ Prisma model + FK relationships |
| 06 | Sequence | `06-seq-grant-consent.md` + `.puml` | 4.4.2 | Flow cấp quyền — 18 step trace |
| 07 | Sequence | `07-seq-request-access.md` + `.puml` | 4.4.3 | Flow yêu cầu truy cập 3 bước + reject alt |
| 08 | Sequence | `08-seq-trusted-contact.md` + `.puml` | 4.4.5 | Flow Người thân tin cậy (đóng góp #3) |
| 09 | Sequence | `09-seq-revoke-cascade.md` + `.puml` | 4.4.4 | Flow thu hồi cascade (đóng góp #2 + Footgun #1) |

## Cách import vào Astah

### Cách 1 — Vẽ tay theo spec markdown (recommended cho user mới Astah)
1. Mở Astah → File → New Project
2. Đọc file `.md` tương ứng — copy elements + relationships
3. Vẽ theo layout gợi ý ở cuối mỗi file `.md`

### Cách 2 — PlantUML plugin (Astah Pro)
1. Cài Astah PlantUML plugin (Tools → Plugin)
2. Import → PlantUML File → chọn file `.puml`
3. Astah tự render UML elements

### Cách 3 — Render PNG online (nếu chỉ cần ảnh)
1. Copy nội dung file `.puml`
2. Paste vào https://plantuml.com/online hoặc https://www.planttext.com
3. Download PNG → embed LaTeX qua `\includegraphics`

## Embed vào LaTeX

Sau khi có PNG (vd `01-use-case.png`), copy vào folder `figures/` cùng level với `quyen.tex`:

```latex
\begin{figure}[h]
    \centering
    \includegraphics[width=0.9\textwidth]{figures/01-use-case.png}
    \caption{Sơ đồ Use Case tổng quát của hệ thống}
    \label{fig:usecase}
\end{figure}
```

## Render hàng loạt PlantUML (Bash, nếu user cài PlantUML CLI)

```bash
cd "Bao Cao/figures"
plantuml *.puml   # generate *.png cho tất cả
```

Nếu chưa cài PlantUML CLI:
- Windows: `scoop install plantuml` hoặc download jar từ plantuml.com/download
- Cần Java 8+

## Lưu ý chất lượng

- Tất cả use case + step trace **bám sát code thực tế** — KHÔNG bịa
- Mỗi sơ đồ có **file:line citation** ở cuối `.md`
- Khi vẽ trong Astah, có thể đơn giản hoá (vd: gộp 5 use case của Ministry thành 1 package "Ministry Actions") nhưng phải giữ nguyên semantic
- Nếu sửa code (vd contract mới), update sơ đồ tương ứng để khớp
