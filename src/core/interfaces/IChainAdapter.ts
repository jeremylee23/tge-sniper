/**
 * 鏈適配器介面
 * 所有區塊鏈適配器必須實作此介面
 */
export interface IChainAdapter {
    /** 鏈識別碼 (e.g., 'ethereum', 'solana') */
    readonly chainId: string;

    /** 鏈顯示名稱 */
    readonly chainName: string;

    /** 是否為 EVM 相容鏈 */
    readonly isEvm: boolean;

    // ========== 錢包操作 ==========

    /** 建立新錢包 */
    createWallet(): Promise<WalletInfo>;

    /** 匯入既有錢包 */
    importWallet(privateKey: string): Promise<WalletInfo>;

    /** 從錢包資訊取得簽名器 */
    getSigner(wallet: WalletInfo): Promise<Signer>;

    /** 查詢原生代幣餘額 */
    getBalance(address: string): Promise<Balance>;

    // ========== 交易操作 ==========

    /** 估算 Gas 費用 */
    estimateGas(tx: TransactionRequest): Promise<GasEstimate>;

    /** 建立未簽名交易 */
    buildTransaction(params: TxBuildParams): Promise<UnsignedTransaction>;

    /** 簽名交易 */
    signTransaction(tx: UnsignedTransaction, signer: Signer): Promise<SignedTransaction>;

    /** 廣播已簽名交易 */
    broadcastTransaction(signedTx: SignedTransaction): Promise<TxResult>;

    /** 廣播至多個 RPC 節點 */
    broadcastToMultipleRpcs(signedTx: SignedTransaction): Promise<TxResult>;

    // ========== 合約操作 ==========

    /** 編碼合約呼叫資料 */
    encodeContractCall(params: ContractCallParams): Promise<string>;

    /** 取得當前 Nonce */
    getNonce(address: string): Promise<number>;
}

// ========== 錢包相關型別 ==========

export interface WalletInfo {
    /** 錢包地址 (EVM) 或公鑰 (Solana) */
    address: string;

    /** 加密後的私鑰 */
    encryptedPrivateKey: string;

    /** 鏈 ID */
    chainId: string;

    /** 錢包別名 */
    alias?: string;

    /** 建立時間 */
    createdAt: Date;
}

export interface Balance {
    /** 餘額 (最小單位) */
    raw: bigint;

    /** 格式化餘額 */
    formatted: string;

    /** 代幣符號 */
    symbol: string;

    /** 小數位數 */
    decimals: number;
}

// ========== 交易相關型別 ==========

export interface TransactionRequest {
    /** 目標地址/合約 */
    to: string;

    /** 發送金額 (最小單位) */
    value?: bigint;

    /** 呼叫資料 */
    data?: string;

    /** Gas 限制 */
    gasLimit?: bigint;

    /** Gas 價格相關 */
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
}

export interface TxBuildParams {
    /** 發送者地址 */
    from: string;

    /** 目標地址 */
    to: string;

    /** 發送金額 */
    value?: string;

    /** 呼叫資料 */
    data?: string;

    /** Gas 優先級 */
    gasPriority?: 'low' | 'normal' | 'high';

    /** 自訂 Nonce */
    nonce?: number;
}

export interface UnsignedTransaction {
    /** 鏈 ID */
    chainId: string;

    /** 序列化的未簽名交易 */
    serialized: string;

    /** 交易雜湊 (預覽) */
    hash?: string;

    /** 原始交易物件 */
    raw: unknown;
}

export interface SignedTransaction {
    /** 鏈 ID */
    chainId: string;

    /** 序列化的已簽名交易 */
    serialized: string;

    /** 交易雜湊 */
    hash: string;

    /** 簽名者地址 */
    from: string;
}

export interface TxResult {
    /** 是否成功 */
    success: boolean;

    /** 交易雜湊 */
    hash?: string;

    /** 錯誤訊息 */
    error?: string;

    /** RPC 節點 */
    rpcUrl?: string;
}

export interface GasEstimate {
    /** 預估 Gas 限制 */
    gasLimit: bigint;

    /** 建議 Gas 價格 */
    gasPrice?: bigint;

    /** EIP-1559: 最大費用 */
    maxFeePerGas?: bigint;

    /** EIP-1559: 優先費用 */
    maxPriorityFeePerGas?: bigint;

    /** 預估總費用 (原生代幣最小單位) */
    estimatedCost: bigint;
}

// ========== 合約相關型別 ==========

export interface ContractCallParams {
    /** 合約地址 */
    contractAddress: string;

    /** 函數簽名 (e.g., "buy(uint256)") */
    functionSignature: string;

    /** 函數參數 */
    args?: unknown[];

    /** ABI (可選，用於複雜編碼) */
    abi?: unknown[];
}

// ========== 簽名器型別 ==========

export interface Signer {
    /** 簽名器類型 */
    type: 'evm' | 'solana';

    /** 地址 */
    address: string;

    /** 簽名方法 */
    sign(data: Uint8Array): Promise<Uint8Array>;

    /** 原始簽名器物件 */
    raw: unknown;
}

// ========== 搶購相關型別 ==========

export interface SnipeParams {
    /** 目標鏈 */
    chainId: string;

    /** 合約地址 */
    contractAddress: string;

    /** 函數簽名 */
    functionSignature: string;

    /** 函數參數 */
    args?: unknown[];

    /** 原始交易資料 (Solana Instruction JSON 或 EVM Calldata) */
    data?: string;

    /** 發送金額 */
    value?: string;

    /** 目標時間 */
    targetTime: Date;

    /** 使用的錢包 (地址列表或 'all') */
    wallets: string[] | 'all';

    /** Gas 優先級 */
    gasPriority?: 'low' | 'normal' | 'high';
}

export interface SnipeTask {
    /** 任務 ID */
    id: string;

    /** 搶購參數 */
    params: SnipeParams;

    /** 預簽名交易列表 */
    signedTransactions: SignedTransaction[];

    /** 任務狀態 */
    status: 'pending' | 'ready' | 'executing' | 'completed' | 'failed';

    /** 執行結果 */
    results?: TxResult[];

    /** 建立時間 */
    createdAt: Date;
}
