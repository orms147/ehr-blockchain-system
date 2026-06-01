# Sơ đồ Astah — Index

> 18 sơ đồ UML cho Quyển ĐATN EHR (cập nhật 2026-06-01).
> Mỗi sơ đồ có 2 file: `.md` (markdown spec) + `.puml` (PlantUML source).

## Bảng tổng quan (theo nhóm)

### Use Case (5 sơ đồ)

| # | File | Chương | Tóm tắt |
|---|---|---|---|
| 01 | `01-usecase-overview` | 2.5 | **Tổng quan** 4 actor × 15 nhóm UC (high-level) |
| 10 | `10-usecase-patient` | 2.6.1 + Phụ lục B | **Phân rã** Patient: 18 UC + include/extend |
| 11 | `11-usecase-doctor` | 2.6.2 + Phụ lục B | **Phân rã** Doctor: 10 UC + include/extend |
| 12 | `12-usecase-org` | 2.6.3 + Phụ lục B | **Phân rã** Org Admin: 8 UC |
| 13 | `13-usecase-ministry` | 2.6.4 + Phụ lục B | **Phân rã** Ministry: 6 UC + constraints |

### Activity (5 sơ đồ)

| # | File | Chương | Tóm tắt |
|---|---|---|---|
| 14 | `14-activity-create-record` | 4.4.1 | Workflow tạo hồ sơ y tế (parallel TC pre-share) |
| 15 | `15-activity-grant-consent` | 4.4.2 | Workflow cấp quyền (5 decision nodes) |
| 16 | `16-activity-request-access` | 4.4.3 | Workflow yêu cầu truy cập 3 phase (approve/reject alt) |
| 17 | `17-activity-revoke-cascade` | 4.4.4 | Workflow thu hồi cascade (Footgun #1 decision branch) |
| 18 | `18-activity-trusted-contact` | 4.4.5 | Workflow TC emergency (3 phase + background pre-share) |

### Architecture (3 sơ đồ)

| # | File | Chương | Tóm tắt |
|---|---|---|---|
| 02 | `02-component-3-layer` | 4.1 | Mobile / Backend / Blockchain + 4 service bổ trợ |
| 03 | `03-deployment` | 4.1 | 7 deployment node thực tế |
| 04 | `04-class-contracts` | 4.2 | 5 smart contract + relationships |

### Data (1 sơ đồ)

| # | File | Chương | Tóm tắt |
|---|---|---|---|
| 05 | `05-er-prisma` | 4.3 | 10+ Prisma model + FK relationships |

### Sequence (4 sơ đồ)

| # | File | Chương | Tóm tắt |
|---|---|---|---|
| 06 | `06-seq-grant-consent` | 4.4.2 | Sequence flow grant consent (18 step) |
| 07 | `07-seq-request-access` | 4.4.3 | Sequence 3 bước + reject alt |
| 08 | `08-seq-trusted-contact` | 4.4.5 | Sequence TC emergency (đóng góp #3) |
| 09 | `09-seq-revoke-cascade` | 4.4.4 | Sequence revoke cascade (đóng góp #2 + Footgun #1) |

**Tổng**: 18 sơ đồ (chưa kể đặc tả use case sẽ làm sau ở Phụ lục B).

## Quan hệ Use Case ↔ Activity ↔ Sequence

| Flow nghiệp vụ | Use Case | Activity | Sequence |
|---|---|---|---|
| Tạo hồ sơ | UC-P03/P04 (sơ đồ 10) | 14 | — |
| Cấp quyền | UC-P06 (sơ đồ 10) | 15 | 06 |
| Yêu cầu truy cập | UC-D03 + UC-P08/P09 (10,11) | 16 | 07 |
| Thu hồi cascade | UC-P07/P11 (sơ đồ 10) | 17 | 09 |
| Trusted Contact emergency | UC-P13/P14 (sơ đồ 10) | 18 | 08 |

3 góc nhìn cho mỗi flow chính:
- **Use Case**: ai làm gì (actor + capability)
- **Activity**: workflow theo logic (decision/branch/fork)
- **Sequence**: time-ordered message giữa participant

## Cách import vào Astah

### Cách 1 — PXML / PUML qua plugin
Astah có thể import PlantUML qua plugin chính thức (theo cách bạn đã tìm ra).

### Cách 2 — Render PNG online → embed LaTeX
1. https://www.plantuml.com/plantuml/uml
2. Paste content `.puml` → Submit → Download PNG
3. Save vào `figures/XX.png`
4. Embed LaTeX:
   ```latex
   \begin{figure}[h]
       \centering
       \includegraphics[width=\textwidth]{figures/01-usecase-overview.png}
       \caption{Sơ đồ Use Case tổng quát}
       \label{fig:usecase-overview}
   \end{figure}
   ```

### Cách 3 — Vẽ tay trong Astah theo spec `.md`
Astah → New Project → New Diagram → vẽ theo elements liệt kê trong file `.md` tương ứng.

## File chưa làm (defer)

- **Đặc tả Use Case** (Phụ lục B): table chi tiết per UC (Pre-condition / Main flow / Alt flow / Post-condition / file:line). Skeleton đã có ở `Chuong/Phu_luc_B.tex` — fill content sau khi 5 activity diagram được verify.
