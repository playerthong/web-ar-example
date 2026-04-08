# 🌐 Web AR Demo

Web-based Augmented Reality demo chạy trên **Android** và **iOS** browser.  
Sử dụng **A-Frame** + **AR.js** (marker-based tracking).

## 🚀 Cách chạy

### Local (máy tính)
```bash
# Dùng Python
python3 -m http.server 8080

# Hoặc dùng Node.js
npx -y http-server . -p 8080 -c-1 --cors
```

Truy cập: `http://localhost:8080`

### Trên điện thoại
⚠️ **Camera trên mobile cần HTTPS**. Có 2 cách:

#### Cách 1: Dùng ngrok (nhanh nhất)
```bash
ngrok http 8080
```
Mở link `https://xxxx.ngrok.io` trên điện thoại.

#### Cách 2: Deploy lên GitHub Pages / Netlify / Vercel
Upload 3 file (`index.html`, `styles.css`, `app.js`) lên hosting có HTTPS.

## 📱 Cách sử dụng

1. Mở web trên browser (Chrome Android / Safari iOS)
2. Nhấn **"Bắt đầu AR"**
3. Cho phép truy cập Camera
4. In hoặc hiển thị **Hiro Marker** trên một thiết bị khác (nhấn "Xem Marker để test")
5. Hướng camera vào marker → Object 3D sẽ xuất hiện!

## 🎮 Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 💎 3 Models | Crystal, Nested Cubes, Solar System |
| 🔄 Đổi Model | Nhấn nút "Đổi Model" |
| ⏯ Animation | Bật/tắt animation |
| 📸 Screenshot | Chụp ảnh AR |
| 📱 Cross-platform | Android Chrome + iOS Safari |

## 🛠 Tech Stack

- **A-Frame 1.4.2** — WebXR/3D framework
- **AR.js** — Marker-based AR tracking
- **Vanilla CSS** — Glassmorphism dark theme
- **No build tools** — Chạy trực tiếp, không cần npm install

## 📂 Cấu trúc

```
web-ar-example/
├── index.html    # Landing page + AR HUD
├── styles.css    # Dark theme styling
├── app.js        # AR logic + model switching
└── README.md
```
