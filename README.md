# 剛好系列-課堂任務通（Cloudflare 版）

原本的 Google Apps Script（GAS）+ Google 試算表 + Google Drive 版本，已改寫為 **Cloudflare Workers + Durable Objects（內建 SQLite）** 架構：

- 原有功能全部保留：課堂／分類／任務管理、7 種任務（連結、PDF 電子書畫記、分享檔案、YouTube 影片測驗、圖文回應、手繪、自動閱卷測驗）、學生總名單與課堂指派、免密碼登入、批改總覽與批次批改、作品藝廊（班級公開／完全公開／分享連結 QR Code）、按讚留言、教師預覽模式……
- **所有上傳的圖片與檔案都以 base64 文字存放在資料庫**，不再需要 Google Drive。
- PDF 上傳後**每一頁轉成圖片**；所有上傳圖片統一壓縮為**最大寬度 900px、JPEG 品質 85%**。
- **新增「💾 空間管理」後台**：以長條圖顯示每個課程佔用多少空間（以 1GB 為上限），可刪除課程，刪除前可先下載備份檔，日後再匯入還原。
- **新增任務「📝 分享 Markdown 文件」**：老師上傳 `.md` 檔或貼上 Markdown 語法，學生看到排版好的內容，可**下載成圖片（PNG）或 PDF**（長文件自動分頁，盡量不把一行字切開）。
  - 支援語法：標題、粗體／斜體（已修正中文「**「水」**」這類緊貼全形標點時不生效的問題）、清單、待辦清單、表格、引用、程式碼、連結、圖片、刪除線、`==螢光標記==`、上標 `x^2^`、下標 `H~2~O`、註腳 `[^1]`、**數學公式**（`$行內$`、`$$區塊$$`，KaTeX）、**Mermaid 流程圖**（```` ```mermaid ````）、以及 `<details>`、`<kbd>` 等常用 HTML 標籤。
- **新增任務「🌐 分享 HTML 網頁＋截圖回傳」**：老師上傳 `.html` 檔或貼上 HTML 語法，學生在安全沙盒中瀏覽網頁，右下角「📸 截圖回傳」可選**整頁截圖**或**目前畫面截圖**，確認後回傳；教師端以縮圖牆呈現並評分（與手繪繪圖板相同）。
  - 已針對**淡入淡出等動畫**做最佳化：截圖前自動捲動整頁觸發「捲動才出現」的效果、把動畫快轉到結束狀態、截圖時凍結動畫，並強制顯示仍透明的淡入元素，避免文字截不到。

## 專案結構（依功能拆成模組，方便分別修改）

```
cloudflare-班級課堂互動任務平台/
├── wrangler.jsonc                # Cloudflare 部署設定（使用 new_sqlite_classes，相容免費方案）
├── package.json                  # 專案依賴與指令
├── src/                          # ── 後端 ──
│   ├── index.ts                  # Worker 主入口：/api/* 與 /f/* 轉給資料庫，其餘交給靜態網頁
│   ├── durable_object.ts         # Durable Object：驗證教師身分後分派到各模組
│   ├── lib/
│   │   ├── db.ts                 # SQLite 存取工具、模組路由型別
│   │   ├── schema.ts             # 資料表結構
│   │   └── utils.ts              # 共用小工具（產生 ID、時間、CSV 解析…）
│   └── modules/                  # 一個功能一個檔案
│       ├── index.ts              # 路由註冊表（新增模組在這裡登記）
│       ├── auth.ts               # 系統設定、教師登入
│       ├── files.ts              # 檔案（base64）存取、/f/ 下載、清理未使用檔案
│       ├── classes.ts            # 課堂
│       ├── categories.ts         # 分類頁籤
│       ├── tasks.ts              # 任務（任務類型清單 TASK_TYPES）
│       ├── quiz.ts               # 測驗題庫
│       ├── students.ts           # 學生總名單、課堂名單
│       ├── submissions.ts        # 學生提交與批改（各任務類型的提交方式 SUBMIT_HANDLERS）
│       ├── annotations.ts        # PDF 畫記
│       ├── gallery.ts            # 作品藝廊、按讚留言
│       ├── bundles.ts            # 載入加速用的整合 API
│       └── storage.ts            # 空間管理、備份、匯入
├── public/                       # ── 前端 ──
│   ├── index.html                # 頁面骨架，依序載入下列模組
│   ├── css/app.css               # 日系無印風樣式、Markdown 排版樣式
│   └── js/
│       ├── tailwind.config.js    # 大地色調色盤
│       ├── core/                 # 共用工具（API、Modal、Toast、圖片壓縮）、狀態快取、函式庫按需載入
│       ├── pages/                # 首頁、作品藝廊
│       ├── teacher/              # 教師後台：儀表板、課堂、任務編輯、題庫、批改、學生、設定、空間管理…
│       ├── student/              # 學生登入、學生儀表板
│       ├── tasks/                # 學生端任務畫面，一種任務一個檔案（link、pdf-reader、drawing、markdown、html-share…）
│       └── app.js                # 啟動程式
├── Code.gs                       # （舊）GAS 原始碼，僅供對照，部署不會用到
└── Index.html                    # （舊）GAS 前端，僅供對照，部署不會用到
```

### 之後要新增一種互動任務？

1. 後端 `src/modules/tasks.ts`：在 `TASK_TYPES` 加上新代號。
2. 後端 `src/modules/submissions.ts`：在 `SUBMIT_HANDLERS` 加上學生提交時要存什麼。
3. 前端 `public/js/tasks/`：新增一個檔案寫學生端畫面，並在 `public/index.html` 加一行 `<script>`。
4. 前端 `public/js/teacher/content.js` 的 `TASK_TYPE_META`、`task-editor.js` 的設定表單，以及 `tasks/dispatch.js` 的分派，各加上新類型。

---

# 部署到 Cloudflare（用指令，最推薦）

> 事前準備：電腦需先安裝 [Node.js](https://nodejs.org/)（選 LTS 版本，一路按「下一步」安裝即可），並擁有一個免費的 [Cloudflare 帳號](https://dash.cloudflare.com/sign-up)。

### 步驟 1：在本資料夾打開命令視窗

1. 用檔案總管打開 `cloudflare-班級課堂互動任務平台`（看得到 `wrangler.jsonc` 那一層）。
2. 點一下上方的**網址列**，把內容改成 `cmd` 後按 Enter，就會在這個資料夾開啟命令提示字元。

### 步驟 2：登入 Cloudflare

輸入：

```bash
npx wrangler login
```

- 第一次執行會問 `Need to install the following packages ... Ok to proceed? (y)`，輸入 `y` 按 Enter。
- 瀏覽器會自動打開 Cloudflare 授權頁面，按 **Allow（允許）**。
- 看到 `Successfully logged in` 就完成了，可以關掉該網頁。

### 步驟 3：部署

輸入：

```bash
npx wrangler deploy
```

- 如果是第一次使用 Cloudflare Workers，會請你設定一個 **workers.dev 子網域**（例如輸入 `mrchang`），這會成為網址的一部分，之後不能隨意更改，請取一個好記的英文名稱。
- 完成後會顯示網址，例如：

  ```
  https://classroom-task-hub.[你的子網域].workers.dev
  ```

**這就是你的專屬應用程式網址！** 使用者直接用這個網址即可進入。

> 💡 網址前半段來自 `wrangler.jsonc` 裡的 `"name"`，想改名可以在部署前修改這一行（只能用英文小寫、數字和 `-`）。

### 步驟 4：資料庫設定？——已經自動完成了！

`wrangler.jsonc` 已經寫好資料庫設定並採用 Cloudflare 免費方案專用的 `new_sqlite_classes` 規格，`npx wrangler deploy` 時 Cloudflare 會**自動建立**內建 SQLite 的 Durable Object 資料庫與繫結，不需要另外到後台建立或貼任何設定。

想確認的話：
1. 登入 <https://dash.cloudflare.com/>
2. 左側選單點 **Workers & Pages**（運算 → Workers & Pages）
3. 點進專案名稱，在「繫結 / Bindings」區域會看到 Durable Object 設定，資料庫已自動生成。

---

## 開始使用

1. 打開網址 → 右上角「🧑‍🏫 教師入口」→ 第一次進入會請你**設定教師密碼**（請立刻設定，第一個設定的人就是管理者）。
2. 「👥 學生總名單」新增學生（可批次貼上「姓名,密碼」）→「＋ 建立新課堂」。
3. 課堂「設定與 QR」分頁有學生加入用的 QR Code（網址帶 `?code=課堂代碼`）。

## 空間管理（新功能）

教師儀表板右上角「💾 空間管理」：

| 功能 | 說明 |
| --- | --- |
| 總用量長條 | 整個資料庫已用多少／1GB，每個課程以不同顏色分段顯示 |
| 各課程明細 | 每個課程的「圖片與檔案」與「文字資料」各佔多少、佔 1GB 的百分比 |
| ⬇ 備份 | 下載該課程的完整備份檔（`.json`，含所有圖片、繳交作品、評分、畫記、按讚留言） |
| 刪除 | 可選「先備份，再刪除」或「直接刪除」；學生總名單不受影響 |
| ⬆ 匯入備份檔 | 選擇先前下載的 `.json` 即可還原課程（課程仍存在時不會重複匯入；加入代碼若已被占用會自動換新；學生若已存在會自動對應） |
| 🧹 清理未使用的檔案 | 刪除沒有被任何任務或作品使用的檔案（例如重新上傳 PDF 後被取代的舊頁面） |

## 更新程式

修改程式後，在同一個命令視窗再執行一次 `npx wrangler deploy` 即可，**資料庫內容不會被清除**。

## 常見問題

- **重新整理頁面後教師要重新登入？** 與原版相同，教師登入狀態只保存在目前頁面。
- **分享 HTML 的網頁能存取平台資料嗎？** 不能。網頁在獨立的沙盒中執行，無法讀取平台頁面、登入狀態或其他學生資料；截圖由沙盒內的程式完成後再傳回。
- **HTML 截圖有哪些限制？** 網頁中嵌入的 YouTube／其他網站（iframe）不會出現在截圖中；外部圖片若對方網站不允許跨網域讀取，會顯示為空白。Markdown 與 HTML 內容上限分別為 2MB、5MB。
- **分享檔案只能預覽 PDF／圖片／影音／純文字？** 是的。原版借用 Google Drive 預覽 Word／Excel 等格式，Cloudflare 版這類檔案請按「下載檔案」開啟。分享檔案單檔上限 20MB。
- **空間快滿了怎麼辦？** 到「💾 空間管理」把已結束的課程先備份再刪除，需要時再匯入。
- **舊的 GAS 資料能搬過來嗎？** 本版本是全新資料庫，舊的試算表資料不會自動搬移。
