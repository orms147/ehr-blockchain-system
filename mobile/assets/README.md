# App Icon Assets — ViEH Hướng C "Dấu son + nhịp"

Master SVG: [`vi-seal-logo.svg`](./vi-seal-logo.svg).

Khi build APK / IPA, Expo/EAS đọc các PNG sau từ [`app.json`](../app.json):

| File | Dùng cho | Kích thước |
|---|---|---|
| `icon.png` | iOS app icon + fallback Android | 1024×1024 |
| `splash-icon.png` | Splash screen (resizeMode=contain) | 1024×1024 (icon center) |
| `android-icon-foreground.png` | Adaptive icon foreground layer (V + pulse, nền trong suốt) | 432×432 trong safe-zone 264×264 |
| `android-icon-background.png` | Adaptive icon background layer (cinnabar gradient solid) | 432×432 |
| `android-icon-monochrome.png` | Themed icon Android 13+ (V silhouette trên nền trong suốt) | 432×432 |
| `favicon.png` | Web (chỉ dùng nếu publish web) | 48×48 |

## Export workflow — 3 cách

### Cách 1 — Inkscape CLI (recommended, lossless)

```bash
# Cài Inkscape (1.2+) + Fraunces font (Google Fonts)
# Windows: choco install inkscape
# macOS:   brew install inkscape

cd mobile/assets

# 1. icon.png + splash-icon.png — full squircle gradient + V + pulse
inkscape vi-seal-logo.svg --export-type=png --export-filename=icon.png --export-width=1024
cp icon.png splash-icon.png

# 2. android-icon-background.png — chỉ cinnabar gradient (KHÔNG V, KHÔNG pulse)
#    Edit vi-seal-logo.svg → xoá nhóm <text> và <g transform> → save as vi-seal-bg.svg
inkscape vi-seal-bg.svg --export-type=png --export-filename=android-icon-background.png --export-width=432

# 3. android-icon-foreground.png — chỉ V + pulse, transparent bg
#    Edit vi-seal-logo.svg → xoá <rect fill=url(#cinnabar)> và <rect fill=url(#glow)>
#    + xoá <rect> frame border → save as vi-seal-fg.svg
inkscape vi-seal-fg.svg --export-type=png --export-filename=android-icon-foreground.png --export-width=432

# 4. android-icon-monochrome.png — chỉ V silhouette, color #FFFFFF, transparent bg
#    Edit vi-seal-fg.svg → đổi fill V thành #FFFFFF, xoá pulse → save as vi-seal-mono.svg
inkscape vi-seal-mono.svg --export-type=png --export-filename=android-icon-monochrome.png --export-width=432

# 5. favicon.png
inkscape vi-seal-logo.svg --export-type=png --export-filename=favicon.png --export-width=48
```

### Cách 2 — Online (không cài Inkscape)

1. Lên https://www.figma.com (free) hoặc https://cloudconvert.com/svg-to-png
2. Upload `vi-seal-logo.svg` (cài Fraunces từ Google Fonts trong Figma trước khi render text)
3. Export PNG ở các kích thước trên

### Cách 3 — Tránh font issue: convert `<text>` thành `<path>`

Nếu tool không có Fraunces font sẽ fallback Times Roman → chữ V trông khác.

1. Mở `vi-seal-logo.svg` trong Inkscape
2. Object > Object to Path (Shift+Ctrl+C) trên chữ V
3. Save As `vi-seal-logo-path.svg` — file mới không phụ thuộc font
4. Tất cả tool đều render chính xác

## Cảnh báo trước khi build APK production

Sau khi regen PNG, verify [`app.json`](../app.json):

```json
"splash": {
    "image": "./assets/splash-icon.png",
    "resizeMode": "contain",
    "backgroundColor": "#0F1419"   // <-- đã đổi sang dark surface
},
"android": {
    "adaptiveIcon": {
        "backgroundColor": "#D45A3F",   // <-- cinnabar (thay #E6F4FE cũ)
        "foregroundImage": "./assets/android-icon-foreground.png",
        "backgroundImage": "./assets/android-icon-background.png",
        "monochromeImage": "./assets/android-icon-monochrome.png"
    }
}
```

Sau đó:

```bash
cd mobile
eas build --platform android --profile production
```

## Bảng màu logo (tham chiếu)

| Token | Hex | Vai trò |
|---|---|---|
| `--cinnabar-top` | `#DB6346` | Gradient start (top-left) |
| `--cinnabar-mid` | `#D45A3F` | Gradient mid (chính) |
| `--cinnabar-deep` | `#B84628` | Gradient end (bottom-right) |
| `--paper` | `#FAF7F1` | Chữ V |
| `--paper-soft` | `rgba(255,255,255,0.30)` | Frame border |
| `--jade-pulse` | `#CFE3D6` | Nhịp ECG |
| `--ink-bg` | `#0F1419` | Splash background |

## Liên quan

- React Native render: [`src/components-v2/ViSealLogo.tsx`](../src/components-v2/ViSealLogo.tsx)
- HTML mockup gốc: `ViEH App Logo.html` (root repo, gitignored sau khi extract)
