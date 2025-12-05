# 使用說明

## 目錄

- [安裝與設定](#安裝與設定)
- [錢包管理](#錢包管理)
- [搶購操作](#搶購操作)
- [進階設定](#進階設定)

---

## 安裝與設定

### 系統需求

- Node.js >= 18.0.0
- npm 或 yarn

### 安裝步驟

```bash
# 1. 安裝依賴
npm install

# 2. 複製環境變數範本
cp .env.example .env

# 3. 編輯 .env 設定 RPC URLs (可選)
```

### RPC 設定

在 `.env` 中設定自訂 RPC URLs：

```env
# 多個 URL 用逗號分隔
ETH_RPC_URLS=https://your-rpc-1.com,https://your-rpc-2.com
```

---

## 錢包管理

### 初始化

首次使用必須初始化 KeyStore：

```bash
npm run cli wallet init
# 設定主密碼 (請牢記，無法找回)
```

### 建立錢包

```bash
# 建立單一錢包
npm run cli wallet create --chain ethereum

# 批次建立 10 個錢包
npm run cli wallet create --chain ethereum --count 10

# 指定別名
npm run cli wallet create --chain base --alias "sniper"
```

### 匯入錢包

```bash
npm run cli wallet import --chain ethereum
# 提示輸入私鑰
```

### 查看錢包

```bash
# 列出所有
npm run cli wallet list

# 按鏈篩選
npm run cli wallet list --chain solana
```

### 查詢餘額

```bash
# 查詢所有錢包餘額
npm run cli balance --all

# 查詢特定地址
npm run cli balance --address 0x123... --chain ethereum
```

---

## 搶購操作

### 基本流程

```
1. 準備錢包 (確保有足夠餘額)
2. 取得合約地址與函數簽名
3. 設定搶購參數
4. 執行預簽名
5. 等待時間觸發
6. 自動廣播交易
```

### 完整命令

```bash
npm run cli snipe \
  --chain ethereum \
  --contract 0x1234567890abcdef... \
  --function "buy(uint256)" \
  --args "[\"1000000000000000000\"]" \
  --value 0.1 \
  --time "2024-01-15T14:00:00Z" \
  --wallets all \
  --gas-priority high \
  --early 100
```

### 參數說明

| 參數 | 必要 | 說明 |
|------|------|------|
| `--chain` | ✅ | 目標區塊鏈 |
| `--contract` | ✅ | 合約地址 |
| `--function` | ❌ | 函數簽名 |
| `--args` | ❌ | 函數參數 (JSON) |
| `--value` | ❌ | 發送金額 (ETH/SOL) |
| `--time` | ❌ | 目標時間 |
| `--wallets` | ❌ | 錢包 (逗號分隔或 "all") |
| `--gas-priority` | ❌ | low/normal/high |
| `--early` | ❌ | 提前發送毫秒數 |
| `--dry-run` | ❌ | 模擬執行 |

### 時間格式

```bash
# ISO 格式
--time "2024-01-15T14:00:00Z"

# 相對時間 (30秒後)
--time +30

# 省略則互動式輸入
```

### 範例場景

#### EVM TGE 搶購

```bash
npm run cli snipe \
  --chain base \
  --contract 0xABC... \
  --function "contribute()" \
  --value 0.5 \
  --time "2024-01-15T14:00:00Z" \
  --gas-priority high
```

#### 測試網測試

```bash
npm run cli snipe \
  --chain sepolia \
  --contract 0xTEST... \
  --time +30 \
  --dry-run
```

---

## 進階設定

### Gas 策略

```bash
# 低優先 (省錢但可能慢)
--gas-priority low

# 正常
--gas-priority normal

# 高優先 (搶購推薦)
--gas-priority high
```

### 提前發送

補償網路延遲，建議 50-200ms：

```bash
--early 100
```

### 環境變數

```env
# 預設 Gas 設定
DEFAULT_PRIORITY_FEE=2
HIGH_PRIORITY_FEE=10

# 提前發送 (ms)
EARLY_SEND_MS=100

# 最大重試
MAX_RETRY=3
```

---

## 常見問題

### Q: 密碼忘記怎麼辦？
A: 無法找回，需刪除 `data/` 目錄重新初始化。私鑰將遺失！

### Q: 交易失敗但仍扣 Gas？
A: 這是區塊鏈特性，無法避免。建議先在測試網測試。

### Q: 如何提高成功率？
A: 
1. 使用 `--gas-priority high`
2. 設定多個 RPC URLs
3. 適當調整 `--early` 參數
