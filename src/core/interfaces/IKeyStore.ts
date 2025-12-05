/**
 * 密鑰儲存介面
 */
export interface IKeyStore {
    /** 初始化 (設定主密碼) */
    initialize(masterPassword: string): Promise<void>;

    /** 解鎖 (驗證主密碼) */
    unlock(masterPassword: string): Promise<boolean>;

    /** 鎖定 */
    lock(): void;

    /** 儲存錢包 */
    saveWallet(wallet: WalletData): Promise<void>;

    /** 取得所有錢包 */
    getWallets(chainId?: string): Promise<WalletData[]>;

    /** 取得單一錢包 */
    getWallet(address: string): Promise<WalletData | null>;

    /** 刪除錢包 */
    deleteWallet(address: string): Promise<boolean>;

    /** 解密私鑰 */
    decryptPrivateKey(encryptedKey: string): Promise<string>;

    /** 加密私鑰 */
    encryptPrivateKey(privateKey: string): Promise<string>;

    /** 檢查是否已初始化 */
    isInitialized(): Promise<boolean>;

    /** 檢查是否已解鎖 */
    isUnlocked(): boolean;
}

export interface WalletData {
    address: string;
    encryptedPrivateKey: string;
    chainId: string;
    alias?: string;
    group?: string;
    createdAt: Date;
}
