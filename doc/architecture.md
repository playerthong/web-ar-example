# Web AR Project Documentation

## 1. Tổng quan dự án

Dự án này là một ứng dụng Web-based Augmented Reality (Web AR) cung cấp trải nghiệm thực tế ảo tăng cường ngay trên trình duyệt web, không cần cài đặt thêm ứng dụng native.
Ứng dụng sử dụng công nghệ nhận diện *marker-based* (hiện tại là "Hiro marker") để định vị và hiển thị các mô hình 3D (GLB/glTF) kết hợp animation.

**Các tính năng cốt lõi:**
- Hiển thị mô hình 3D (.glb).
- Phát skeletal animations nhúng sẵn từ model.
- CTA (Call-To-Action) tương tác: Hiện thẻ khuyến mãi sau khi animation chạy đủ một số lần vòng lặp (cấu hình được). Thẻ này cho phép chuyển hướng tới trang đích (Facebook/Website).
- UX/UI Splash Screen: Animation Loading đẹp mắt với glassmorphism style. Cấp quyền camera theo chuẩn iOS/Android chống lỗi auto-play.
- Cross-platform: Chạy trên trình duyệt của iOS (Safari) và Android (Chrome).

---

## 2. Công nghệ sử dụng (Tech Stack)

Đây là một kiến trúc tĩnh (static flow) thuần túy chạy trực tiếp, hoàn toàn Serverless và Zero-Build-Tools.

### 2.1. Thư viện chính (Core Libraries)
1. **A-Frame (v1.4.2):** Framework web nền tảng mạnh mẽ dùng xây dựng không gian 3D/VR/AR qua HTML tags (`<a-scene>`, `<a-entity>`). Dựa trên nền tảng Three.js.
2. **AR.js:** Thư viện AR nhẹ trên web. Ứng dụng này dùng module Marker-tracking của AR.js phân tích luồng webcam và tính toán ma trận xoay/vị trí đưa mô hình đè lên Marker.
3. **A-Frame Extras (v7.2.0):** Cung cấp các addon bổ sung. Module `animation-mixer` tại đây được dùng để tự động loop và render skeletal animations từ tệp `.glb`.
4. **qrcodejs (v1.0.0):** Thư viện sinh QR code phía client, không cần server. Được nạp từ CDN (`cdnjs`) và dùng để render QR code từ `APP_CONFIG.WEB_URL` trực tiếp vào DOM khi user mở Marker Modal lần đầu.

### 2.2. Kiến trúc tĩnh (Static Web)
- **HTML5:** Định nghĩa UI HUD, Popup CTA.
- **Vanilla CSS3:** Sử dụng linh hoạt các thuộc tính hiện đại (`backdrop-filter: blur`, CSS variables, keyframe animations, flexbox) để tạo giao diện UI HUD và Splash screen sang trọng.
- **Vanilla JS (ES6):** Điều khiển luồng của model AR, quản lý biến thái vòng lặp và điều khiển hiển thị component con.

### 2.3. Tệp tĩnh (Assets)
- **3D Models:** Định dạng `glTF-Binary` (`.glb`), là tiêu chuẩn nén mới cho Web3D (nhẹ hơn, load một file bao hàm texture/mesh/animation).
- **Marker:** "Hiro marker" tích hợp sẵn của AR.js dùng cho công nghệ Computer Vision phát hiện góc cảnh.

---

## 3. Kiến trúc luồng hệ thống (System Flow)

1. **Khởi động (Splash Screen):**
   - Không nạp `AR.js` ngay để tránh trình duyệt bung khung xin quyền Camera khi trang web vừa mới hiện (ảnh hưởng tới UX cực đoan ở mobile).
   - Splash Loading UI hiện trước để trình bày tính năng ứng dụng.
   - **[Autoscan mode]** Nếu URL có param `?autoscan=true`, hàm `startAR()` được gọi tự động ngay trong `DOMContentLoaded` — bỏ qua màn splash, thẳng vào AR. Xem chi tiết tại mục 3a.
2. **Kích hoạt Start AR (User Action):**
   - Sự kiện bấm tự động fetch Script động `A-frame`, `AR.js`, `A-Frame Extras`.
   - Cấp phát thẻ DOM `<a-scene>` chèn vào HTML, kích sóng camera theo policy bảo mật của iOS (phải có sự kiện touch action).
3. **Tracking & Rendering:**
   - Khi luồng Camera được nạp, component bắt đầu duyệt phân tích "Hiro Marker".
   - Lúc `markerFound` (bắt được), biến `loopCount` reset = 0.
4. **Animation & Điều hướng CTA:**
   - Khi mô hình hiện lên, `animation-mixer` điều khiển animation.
   - Hàm JS theo dõi sự kiện hook `animation-loop` từ model. Đếm tiến trình.
   - Khi tiến trình đạt mốc được định nghĩa (`APP_CONFIG.ANIMATION_LOOP_COUNT`). Giao diện **CTA Overlay** (Pop-up kêu gọi hành động) sẽ bắn sự kiện `showCTA()` lên đè màn hình AR. User có thể bấm redirect qua web/Facebook.
   - Nếu User lỡ bấm ẩn popup hoặc marker mất/bắt lại, biến đếm logic lại reset quy trình trên từ đầu.

### 3a. Autoscan Flow (`?autoscan=true`)

Đây là luồng dành cho user đến từ QR code (đã có `WEB_URL` encode sẵn param này):

```
Scan QR code
    └─> Mở trình duyệt với URL?autoscan=true
            └─> DOMContentLoaded → startAR() tự động
                    └─> Fetch AR libraries → Inject <a-scene> → Camera bật
```

**Hành vi theo từng platform:**
- **Android Chrome:** Hoạt động hoàn toàn tự động. Browser hiện permission dialog mà không cần gesture trước.
- **iOS Safari (lần đầu):** Có thể bị block nếu chưa grant quyền camera cho domain. Cần vào Settings → Safari → Camera → Allow. Từ lần 2 trở đi hoạt động tự động.
- **iOS Safari (đã grant):** Hoạt động tự động như Android.

> **Lý do không dùng tap-overlay:** Browser security policy chặn `getUserMedia` khi không có user gesture chỉ với các site *chưa được grant permission*. Với site đã được grant (trường hợp phổ biến khi user scan QR lần 2+), gọi thẳng `startAR()` là hợp lệ và camera bật ngay.

---

## 4. Cấu hình biến môi trường (Environment Configs)

File `config.js` quyết định tham số kinh doanh chính của ứng dụng mà không cần hiểu logic mã Code:

```javascript
const APP_CONFIG = {
  // URL public của web app — dùng để generate QR code trong Marker Modal
  // Nên append ?autoscan=true để kích hoạt autoscan khi user scan QR
  WEB_URL: 'https://your-app.web.app?autoscan=true',

  // Số lần vòng lặp animation để trigger ra Pop-up CTA
  ANIMATION_LOOP_COUNT: 8,

  // Link đích đến khi User ấn vào nút xem ưu đãi
  CTA_LINK: 'https://www.facebook.com/quyen.tanluong',

  // Các tuỳ chỉnh ngôn ngữ Text trong Pop-up
  CTA_TITLE: 'Ưu đãi đặc biệt!',
  CTA_MESSAGE: 'Khám phá ngay các chương trình khuyến mãi hấp dẫn dành riêng cho bạn!',
  CTA_BUTTON_TEXT: 'Khám phá ngay',
};
```

| Tham số | Mô tả |
|---|---|
| `WEB_URL` | URL đầy đủ của app, được encode vào QR code. Nên có `?autoscan=true` để tạo trải nghiệm mượt khi scan. |
| `ANIMATION_LOOP_COUNT` | Số vòng animation phải chạy trước khi CTA hiện. Càng nhỏ → CTA ra càng sớm. |
| `CTA_LINK` | Trang đích khi bấm nút CTA. |
| `CTA_TITLE` / `CTA_MESSAGE` / `CTA_BUTTON_TEXT` | Nội dung văn bản hiển thị trong CTA popup. |

---

## 5. Cấu trúc Source Code (Project Structure)

```text
/web-ar-example
│
├── config.js               // (1) File cấu hình App CTA & Logic
├── index.html              // (2) Markup UI Pop-Up, Splash, và AR HUD
├── styles.css              // (3) Stylesheet Glassmorphism
├── app.js                  // (4) JavaScript Logic, Dynamic injection scene
├── README.md               // Hướng dẫn cài đặt/chạy app local/deploy
│
├── /doc                    // Chứa các tệp tài liệu dự án (File này)
│   └── architecture.md
│
└── /models                 // Chứa file Models 3D (.glb animated, .obj static)
    ├── brainstem.glb       // Robot skeleton (animated)
    ├── cesiumman.glb       // Nhân vật đi bộ (animated)
    ├── fox.glb             // Cáo chạy (animated)
    └── umbrella_obj.obj    // Ô dù static (không có animation)
```

---

## 6. Ghi chú Bảo trì & Tối ưu

- **Tại sao lại nạp Scripts Dynamic (Tĩnh sang Động) trong JS?**
  A-Frame `<a-scene>` có tính năng tải auto-execute, nếu nạp thẻ ở `head` HTML, Camera sẽ bị trình duyệt chặn ở iOS (do tự nạp mà không phải qua gesture). Injection script chỉ khi click "Bắt đầu AR" khắc phục hoàn toàn lỗi này.

- **Thay đổi AR model:**
  Có thể copy file `.glb` mới vào `/models`. Sửa mảng `modelConfigs` tại `app.js`, cấp thông số `scale`, `position`, `type` cho hợp với mô hình thực tế.
  - Model `.glb`: set `type: 'glb'`, `animated: true`, `animClip: '*'`
  - Model `.obj`: set `type: 'obj'`, `animated: false` — không hỗ trợ skeletal animation, CTA loop counter sẽ không kích hoạt

- **QR Code trong Marker Modal:**
  QR code được generate lazy (lần đầu mở modal) bằng `qrcodejs`, encode `APP_CONFIG.WEB_URL`. Dùng `correctLevel: QRCode.CorrectLevel.L` (error correction thấp nhất) cho phép render nhỏ (~120px) mà vẫn scan được tốt. URL càng ngắn thì QR càng đơn giản, càng dễ scan ở kích thước nhỏ.
  > **Lưu ý:** QR code và Hiro marker được tách riêng biệt trong modal — **không** chồng lên nhau vì QR code sẽ phá pattern nhận diện của AR.js nếu đè lên vùng trắng.

- **Autoscan (`?autoscan=true`):**
  Param này được đọc trong `DOMContentLoaded`. Khi có, `startAR()` tự gọi không cần gesture. Để tận dụng tối đa, `WEB_URL` trong `config.js` nên luôn kèm param này. Xem chi tiết tại mục 3a.

- **Khuyến mãi/Sự kiện Marketing:**
  Hoàn toàn điều khiển qua `config.js`. Số loop đếm càng ít, popup chạy ra càng sớm tới người tiêu dùng. Ngược lại, có thể setup Loop ở `config.js` to để ép user xem Model trước.
