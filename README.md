# LINE Cafe Passport

把既有的咖啡足跡、評分、體驗標籤與想去清單整理成個人咖啡護照，提供全部、本月與今年回顧，並由 Gemini 產生只根據統計資料撰寫的短摘要。

這個版本延續 [`line-cafe-group-scheduler`](https://github.com/zonawang/line-cafe-group-scheduler) 的完整 Cafe Bot。

## 使用方式

在 LINE 輸入：

```text
我的咖啡護照
本月咖啡護照
今年咖啡護照
分享我的咖啡護照
```

歡迎訊息與每次完成咖啡足跡後，也會提供「查看咖啡護照」入口。

## 護照內容

每張護照會依所選期間計算：

- 完成的咖啡造訪次數。
- 不重複咖啡廳數量。
- 平均評分與五星體驗次數。
- 最常出現的三個體驗標籤。
- 最常造訪的咖啡廳與次數。
- 最近一次咖啡足跡。
- 目前仍在想去清單，而且收藏後已有造訪紀錄的店家數。

期間以 `Asia/Taipei` 計算，避免 UTC 日期讓月底或跨年紀錄被分到錯誤區間。

## 使用流程

```text
完成咖啡足跡
      ↓
按「查看咖啡護照」
      ↓
選擇全部／本月／今年
      ↓
程式計算可信統計
      ↓
Gemini 根據統計產生短摘要
      ↓
顯示可轉傳的 Flex Message 卡片
```

## 統計規則

### 一人一份護照

護照以 LINE `userId` 讀取該使用者自己的足跡與想去清單。即使指令在群組中送出，也只會在使用者主動要求時顯示該使用者的回顧，不會自動讀取或合併其他成員的資料。

### 同一家店的判斷

店家優先使用標準化後的 Google Maps URI 去重；URI 不存在時才退回店名。重複造訪會增加總次數，但不會增加「不同店家」數量。

### 一次造訪只有一組標籤

同一筆足跡內重複的標籤只計一次，避免異常資料讓某個標籤被重複加分。最常見標籤同票時使用固定順序，讓卡片每次顯示一致。

### 目前收藏後已造訪

現有資料只保存「目前仍在想去清單」的項目，移除收藏後沒有歷史事件。因此護照只計算：

```text
目前仍收藏
    ＋
足跡中的 Maps URI 相同
    ＋
造訪時間晚於收藏時間
```

這不是完整的終身收藏轉換率，畫面也不會把它包裝成完整轉換率。

## Gemini 摘要

數字、標籤與最常去店家都先由程式計算，再把精簡 JSON 交給 Gemini。模型只負責把事實整理成兩句繁體中文回顧，不負責計算統計。

Prompt 明確限制 Gemini 不得猜測：

- 使用者個性。
- 消費金額。
- 未提供的地點。
- 統計中沒有出現的偏好。

輸出會移除 Markdown、合併多餘空白並限制長度。Gemini 暫時失敗時，護照仍會顯示程式產生的確定性摘要，不會讓整張卡片消失。

## 摘要快取

每個期間會依目前可見統計建立 fingerprint：

```text
期間＋次數＋評分＋標籤＋店家＋收藏轉換
                  ↓
             SHA-256 fingerprint
```

fingerprint 沒有改變時，直接使用 Firestore 中的既有摘要；新增足跡、評分或收藏統計改變後才重新請 Gemini 產生。

快取只保存統計 fingerprint、摘要文字與更新時間，不會複製完整足跡。

## 分享與隱私

「分享這張護照」會保留正在查看的期間。例如從本月護照分享，不會突然變成全部紀錄。

分享版不包含 LINE 名稱與頭像。個人聊天室會先顯示說明，再由使用者使用 LINE 的分享／轉傳功能選擇朋友或群組；Bot 不會自行把護照推送給其他人。

## 空狀態與失敗處理

- 指定期間沒有足跡時，引導使用者查看想去清單或傳送位置找店。
- Gemini 無法產生摘要時，使用本機 fallback 文案。
- Firestore 或護照整理暫時失敗時，顯示可重新查看的按鈕。
- 最常去店家存在時，卡片提供 Google Maps 入口。

## 新增程式結構

```text
src/services/passportStatistics.ts  期間、統計、店家與標籤聚合
src/services/passportSummary.ts     Gemini 摘要、清理、fallback 與快取
src/messages/passportMessages.ts    Flex Message、空狀態與分享說明
src/handlers/passportTextHandler.ts 指令分流與資料整合
```

## 環境變數

在既有設定外新增：

```env
GEMINI_PASSPORT_MODEL=gemini-2.5-flash
FIRESTORE_PASSPORTS_COLLECTION=cafe-user-passports
```

護照直接讀取既有的：

```env
FIRESTORE_JOURNEY_USERS_COLLECTION=cafe-user-journeys
FIRESTORE_WISHLIST_USERS_COLLECTION=cafe-user-wishlists
```

本機啟動：

```bash
cp .env.example .env
npm install
npm run dev
```

## 驗證

```bash
npm run typecheck
npm test
```

測試涵蓋台北月份邊界、期間過濾、店家去重、平均評分、標籤排序、最常去店家、收藏與造訪順序、Gemini fallback、輸出清理、fingerprint、Flex Message、空狀態與分享期間。

目前共有 103 項測試。

## 已知限制

- 護照目前最多讀取最近 500 筆已完成足跡與 200 筆現有收藏。
- 已移除的舊收藏沒有歷史資料，無法回算完整收藏轉換。
- 分享使用 LINE 用戶端的分享／轉傳功能，不會由 Bot 越權發送給其他聊天室。
- 模型摘要是回顧文案，不取代程式計算出的數字。
- 月份與年度固定使用台北時區。

## 既有功能

- Gemini + Google Maps Grounding 附近咖啡廳推薦。
- 個人偏好、換一批與工作友善推薦。
- Datetime Picker、Google Calendar 與造訪後回訪。
- 咖啡足跡與想去清單。
- 拍菜單後由 Gemini 推薦可見飲品。
- 群組選店、選時間、改票、決選與群組提醒。
- LINE Rich Menu。

## 官方文件

- [LINE Messaging API：Flex Message](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/)
- [LINE Messaging API：Quick reply](https://developers.line.biz/en/docs/messaging-api/using-quick-reply/)
- [LINE Messaging API：Group chats](https://developers.line.biz/en/docs/messaging-api/group-chats/)
- [Gemini API：Text generation](https://ai.google.dev/gemini-api/docs/text-generation)
- [Cloud Firestore：Transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
