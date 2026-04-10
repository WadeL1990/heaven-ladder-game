# 爬梯圖：去天國的路（兒童主日學互動網頁遊戲）

可愛卡通風格的爬梯圖（鬼腳圖）小遊戲：
- 「🗺️ 換一張新地圖」：隨機生成新路徑
- 「🚶 出發！走走看」：在同一張地圖上重玩走路動畫
- 天國固定在正中間，終點數量固定為奇數（預設 5）

## 專案結構
heaven-ladder-game/
├─ index.html
├─ README.md
└─ src/
├─ style.css
└─ app.js

## 本地端執行方式（推薦）
### 方法 A：VSCode Live Server
1. 安裝 VSCode 擴充：Live Server
2. 右鍵 `index.html` → Open with Live Server

### 方法 B：用 Python 開簡易伺服器
在專案根目錄執行：
```bash
python -m http.server 5500