# 使用說明

## 目錄

- [安裝與設定](#安裝與設定)
- [錢包管理](#錢包管理)
- [搶購操作](#搶購操作)
- [Solana TGE 搶購](#solana-tge-搶購)
- [進階設定](#進階設定)

---

## 安裝與設定

### 系統需求

- Node.js >= 18.0.0
- npm 或 yarn

### 安裝步驟

```bash
# 1. Clone 專案
git clone https://github.com/jeremylee23/tge-sniper.git
cd tge-sniper

# 2. 安裝依賴
npm install

# 3. 複製環境變數範本
cp .env.example .env
```

---

## 錢包管理

### 初始化 (首次使用)

```bash
npm run cli -- wallet init
# 設定主密碼 (請牢記，無法找回)
```

### 建立錢包

```bash
# Solana 錢包
npm run cli -- wallet create solana

# EVM 錢包 (Ethereum, Base, Arbitrum...)
npm run cli -- wallet create ethereum

# 批次建立 5 個
npm run cli -- wallet create solana -n 5
```

### 查看錢包

```bash
# 列出所有
npm run cli -- wallet list

# 按鏈篩選
npm run cli -- wallet list solana
```

### 匯出私鑰

```bash
npm run cli -- wallet export -a <錢包地址>
```

---

## 搶購操作

### 基本流程

```
1. 準備錢包 (確保有足夠餘額)
2. 取得合約參數 (見下方說明)
3. 執行搶購命令
4. 輸入密碼
5. 系統預簽名後等待時間觸發
6. 自動廣播交易
```

### 參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `--chain` | ✅ | 目標區塊鏈 (solana, ethereum...) |
| `--contract` | ✅ | 合約/Program 地址 |
| `--data` | ❌ | 原始交易資料 (Solana Instruction JSON) |
| `--function` | ❌ | EVM 函數簽名 |
| `--args` | ❌ | EVM 函數參數 (JSON) |
| `--value` | ❌ | 發送金額 (ETH/SOL) |
| `--time` | ❌ | 目標時間 (ISO 格式或 +秒數) |
| `--wallets` | ❌ | 錢包 (見下方說明) |
| `--gas-priority` | ❌ | low/normal/high |
| `--simulate` | ❌ | 發送前先模擬交易 |
| `--dry-run` | ❌ | 只顯示設定，不發送 |
| `--password` | ❌ | 主密碼 (用於自動化腳本) |
| `--no-confirm` | ❌ | 跳過確認提示 (用於自動化腳本) |

### 錢包指定方式

```bash
# 使用所有該鏈的錢包
--wallets all

# 用 alias 名稱指定
--wallets main,sniper,bot1

# 用 group 名稱指定 (加 @group: 前綴)
--wallets @group:snipers

# 混合使用
--wallets main,@group:bots,3XhByuyUGq...

# 用完整地址
--wallets 3XhByuyUGqiQZUveZrm14p39MxqLJadmCDTcCHiwchoS
```

### 時間格式

```bash
# ISO 格式 (UTC)
--time "2025-12-09T12:00:00Z"

# 相對時間 (30秒後)
--time +30

# 立即發送
--time +0
```

---

## Solana TGE 搶購

### 步驟 1: 計算帳戶地址

每個項目需要計算用戶的 Escrow 和 Token Account：

```bash
npx tsx scripts/calc-accounts.ts
```

輸出會包含完整的 `keys` JSON。

如果換項目或錢包：
```bash
npx tsx scripts/calc-accounts.ts <PRESALE地址> <錢包地址>
```

### 步驟 2: 組裝搶購命令

```bash
npm run cli -- snipe \
  --chain solana \
  --contract <ProgramID> \
  --data '<完整的 Instruction JSON>' \
  --wallets all \
  --time "2025-12-09T12:00:00Z"
```

### 完整範例 (WET 項目)

```bash
npm run cli -- snipe \
  --chain solana \
  --contract presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj \
  --data '{"programId":"presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj","keys":[{"pubkey":"8DcLpDaStJ35nkG789TqR2eExZRR9VbbJzZKwLHdo14T","isSigner":false,"isWritable":true},{"pubkey":"G1CGGeb3RyTdg4KwaFLSYSqMmvt6QEZadgCaxUoqtWRB","isSigner":false,"isWritable":true},{"pubkey":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","isSigner":false,"isWritable":true},{"pubkey":"<YOUR_ESCROW>","isSigner":false,"isWritable":true},{"pubkey":"<YOUR_USDC_TOKEN_ACCOUNT>","isSigner":false,"isWritable":true},{"pubkey":"<YOUR_WALLET>","isSigner":true,"isWritable":true},{"pubkey":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","isSigner":false,"isWritable":false},{"pubkey":"4Xgt6XKZiowAGNdPWngVAwpYbSwAmbBnRBPtCFXhrypc","isSigner":false,"isWritable":false},{"pubkey":"presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj","isSigner":false,"isWritable":false}],"data":[242,35,198,137,82,225,242,182,64,66,15,0,0,0,0,0,0,0,0,0]}' \
  --wallets all \
  --time +0
```

### 金額設定 (data 欄位)

金額編碼在 `data` 陣列的第 9-16 個位元組：

| USDC | data 後半段 |
|------|-------------|
| 1 | `64,66,15,0,0,0,0,0` |
| 10 | `128,150,152,0,0,0,0,0` |
| 100 | `0,225,245,5,0,0,0,0` |
| 1000 | `0,202,154,59,0,0,0,0` |

---

## 進階設定

### Gas 策略 (Priority Fee)

Solana 支援 Priority Fee，提高交易優先級：

```bash
--gas-priority low    # 預設，省錢
--gas-priority normal # 稍微緊急
--gas-priority high   # 搶購推薦！
```

| 優先級 | Priority Fee | 額外成本約 |
|--------|-------------|-----------|
| low | 1,000 microLamports | ~$0.0002 |
| normal | 10,000 microLamports | ~$0.002 |
| high | 100,000 microLamports | ~$0.02 |

**搶購時務必加 `--gas-priority high`！**

> ⚠️ **注意**: 「廣播成功」不等於「交易成功」！  
> 錢包需要有足夠的 SOL (Gas) + USDC (購買金額) 才能真正成交。

### 提前發送

補償網路延遲，建議 50-200ms：

```bash
--early 100
```

---

## 常見問題

### Q: 密碼忘記怎麼辦？
A: 無法找回，需刪除 `data/` 目錄重新初始化。私鑰將遺失！

### Q: 交易失敗但仍扣 Gas？
A: 這是區塊鏈特性，Solana Gas 約 $0.001，EVM 較高。

### Q: 如何獲取合約參數？
A: 
1. 從區塊瀏覽器分析歷史交易
2. 使用瀏覽器攔截腳本 (見下方)

### Q: 瀏覽器攔截腳本

在前端網頁的 Console 貼上：

```javascript
(function() {
    if (!window.solana) return console.log('❌ 沒有錢包');
    const orig = window.solana.signTransaction;
    window.solana.signTransaction = async function(tx) {
        tx.instructions.forEach((ix, i) => {
            console.log(`指令 #${i+1}:`);
            console.log(JSON.stringify({
                programId: ix.programId.toString(),
                keys: ix.keys.map(k => ({
                    pubkey: k.pubkey.toString(),
                    isSigner: k.isSigner,
                    isWritable: k.isWritable
                })),
                data: Array.from(ix.data)
            }));
        });
        return orig.call(this, tx);
    };
    console.log('✅ 攔截器已啟動');
})();
```

然後在網頁上執行操作，Console 會顯示完整的 Instruction JSON。

---

## 自動化腳本

### 完全自動搶購

使用 `--password` 和 `--no-confirm` 參數可實現完全自動化：

```bash
npm run cli -- snipe \
  --chain solana \
  --contract <合約地址> \
  --data '<交易 JSON>' \
  --wallets all \
  --time +0 \
  --gas-priority high \
  --password "你的密碼" \
  --no-confirm
```

### 監控腳本範例

參考 `scripts/auto-snipe-wet.ts`，包含：
- API 狀態監控
- 時間變更警報（音效 + 語音）
- 自動執行搶購

```bash
# 執行監控
npx tsx scripts/auto-snipe-wet.ts
```

### ⚠️ 安全提醒

- `--password` 會在命令歷史中留下記錄
- 建議使用後執行 `history -c` 清除歷史
- 或使用環境變數避免密碼外洩
