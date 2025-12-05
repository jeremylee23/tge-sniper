# 🎯 TGE Sniper

多鏈 ICO/TGE 搶購工具，支援 EVM 鏈與 Solana。

## 功能特色

- **預簽名模式** - 提前準備好簽名交易，時間到直接廣播
- **精準計時** - 毫秒級觸發，支援時間同步
- **多 RPC 廣播** - 同時向多個節點發送，提高成功率
- **多鏈支援** - Ethereum, Base, Arbitrum, Polygon, BSC, Solana
- **多錢包管理** - 批次建立與管理多個錢包

## 快速開始

### 安裝

```bash
# 安裝依賴
npm install

# 複製環境變數範本
cp .env.example .env
```

### 初始化

```bash
# 初始化 KeyStore (首次使用)
npm run cli wallet init

# 建立錢包
npm run cli wallet create --chain ethereum --count 5

# 查看錢包列表
npm run cli wallet list
```

### 執行搶購

```bash
# 完整命令
npm run cli snipe \
  --chain ethereum \
  --contract 0x1234...abcd \
  --function "buy(uint256)" \
  --args "[1000000000000000000]" \
  --value 0.1 \
  --time "2024-01-15T14:00:00Z" \
  --wallets all \
  --gas-priority high

# 或使用相對時間 (30秒後)
npm run cli snipe --chain ethereum --contract 0x... --time +30
```

## 命令參考

| 命令 | 說明 |
|------|------|
| `wallet init` | 初始化 KeyStore |
| `wallet create` | 建立新錢包 |
| `wallet import` | 匯入既有錢包 |
| `wallet list` | 列出所有錢包 |
| `wallet export` | 匯出私鑰 |
| `wallet chains` | 列出支援的鏈 |
| `balance` | 查詢餘額 |
| `snipe` | 執行搶購 |

## 支援的區塊鏈

### EVM 鏈
- Ethereum Mainnet / Sepolia
- Base
- Arbitrum One
- Polygon
- BSC

### Solana
- Mainnet
- Devnet

## 詳細文件

- [使用說明](docs/USAGE.md) - 完整功能說明
- [安全指南](docs/SECURITY.md) - 安全性最佳實踐

## ⚠️ 風險警告

- 此工具涉及真實加密貨幣交易
- 搶購可能失敗並損失 Gas 費用
- 請先在測試網充分測試
- 使用者需自行承擔操作風險

## License

MIT
