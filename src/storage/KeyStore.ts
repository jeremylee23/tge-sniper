/**
 * 加密密鑰儲存
 * 使用 SQLite 儲存加密後的錢包私鑰
 */
import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { IKeyStore, WalletData } from '../core/interfaces/index.js';
import { encrypt, decrypt, serializeEncrypted, deserializeEncrypted } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

export class KeyStore implements IKeyStore {
    private db: Database.Database | null = null;
    private masterPassword: string | null = null;
    private dbPath: string;

    constructor(dbPath: string = './data/tge-sniper.db') {
        this.dbPath = dbPath;
    }

    /**
     * 初始化資料庫
     */
    private async ensureDb(): Promise<Database.Database> {
        if (this.db) return this.db;

        // 確保目錄存在
        await mkdir(dirname(this.dbPath), { recursive: true });

        this.db = new Database(this.dbPath);

        // 建立資料表 (如果是新資料庫)
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS wallets (
        address TEXT PRIMARY KEY,
        encrypted_private_key TEXT NOT NULL,
        chain_id TEXT NOT NULL,
        alias TEXT UNIQUE,
        wallet_group TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

        // 遷移：新增 wallet_group 欄位 (如果不存在)
        try {
            this.db.exec('ALTER TABLE wallets ADD COLUMN wallet_group TEXT');
        } catch {
            // 欄位已存在，忽略
        }

        // 建立索引 (確保欄位存在後才建立)
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_wallets_chain ON wallets(chain_id);
      CREATE INDEX IF NOT EXISTS idx_wallets_group ON wallets(wallet_group);
    `);

        return this.db;
    }

    /**
     * 初始化 (設定主密碼)
     */
    async initialize(masterPassword: string): Promise<void> {
        const db = await this.ensureDb();

        // 檢查是否已初始化
        const existing = db.prepare('SELECT value FROM config WHERE key = ?').get('password_hash');
        if (existing) {
            throw new Error('KeyStore 已初始化，請使用 unlock 解鎖');
        }

        // 儲存密碼驗證用的加密標記
        const marker = await encrypt('TGE_SNIPER_MARKER', masterPassword);
        db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(
            'password_hash',
            serializeEncrypted(marker)
        );

        this.masterPassword = masterPassword;
        logger.success('KeyStore 初始化完成');
    }

    /**
     * 解鎖 (驗證主密碼)
     */
    async unlock(masterPassword: string): Promise<boolean> {
        const db = await this.ensureDb();

        const row = db.prepare('SELECT value FROM config WHERE key = ?').get('password_hash') as
            | { value: string }
            | undefined;

        if (!row) {
            throw new Error('KeyStore 尚未初始化，請先執行 initialize');
        }

        try {
            const marker = deserializeEncrypted(row.value);
            const decrypted = await decrypt(marker, masterPassword);

            if (decrypted === 'TGE_SNIPER_MARKER') {
                this.masterPassword = masterPassword;
                logger.success('KeyStore 解鎖成功');
                return true;
            }
        } catch {
            // 密碼錯誤
        }

        logger.error('密碼錯誤');
        return false;
    }

    /**
     * 鎖定
     */
    lock(): void {
        this.masterPassword = null;
        logger.info('KeyStore 已鎖定');
    }

    /**
     * 檢查是否已解鎖
     */
    isUnlocked(): boolean {
        return this.masterPassword !== null;
    }

    /**
     * 檢查是否已初始化
     */
    async isInitialized(): Promise<boolean> {
        const db = await this.ensureDb();
        const row = db.prepare('SELECT value FROM config WHERE key = ?').get('password_hash');
        return !!row;
    }

    /**
     * 儲存錢包
     */
    async saveWallet(wallet: WalletData): Promise<void> {
        if (!this.masterPassword) {
            throw new Error('KeyStore 未解鎖');
        }

        const db = await this.ensureDb();

        // Solana 地址區分大小寫，EVM 地址轉小寫
        const isEvm = !wallet.chainId.startsWith('solana');
        const normalizedAddress = isEvm ? wallet.address.toLowerCase() : wallet.address;

        // 檢查別名是否已被其他錢包使用
        if (wallet.alias) {
            const existing = db.prepare(
                'SELECT address FROM wallets WHERE alias = ? AND address != ?'
            ).get(wallet.alias, normalizedAddress) as { address: string } | undefined;

            if (existing) {
                throw new Error(`別名 "${wallet.alias}" 已被其他錢包使用`);
            }
        }

        db.prepare(`
      INSERT OR REPLACE INTO wallets (address, encrypted_private_key, chain_id, alias, wallet_group, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
            normalizedAddress,
            wallet.encryptedPrivateKey,
            wallet.chainId,
            wallet.alias || null,
            wallet.group || null,
            wallet.createdAt.toISOString()
        );

        logger.wallet('已儲存錢包', wallet.address);
    }

    /**
     * 取得所有錢包
     */
    async getWallets(chainId?: string, group?: string): Promise<WalletData[]> {
        const db = await this.ensureDb();

        let rows: Array<{
            address: string;
            encrypted_private_key: string;
            chain_id: string;
            alias: string | null;
            wallet_group: string | null;
            created_at: string;
        }>;

        if (chainId && group) {
            rows = db
                .prepare('SELECT * FROM wallets WHERE chain_id = ? AND wallet_group = ? ORDER BY created_at')
                .all(chainId, group) as typeof rows;
        } else if (chainId) {
            rows = db
                .prepare('SELECT * FROM wallets WHERE chain_id = ? ORDER BY created_at')
                .all(chainId) as typeof rows;
        } else if (group) {
            rows = db
                .prepare('SELECT * FROM wallets WHERE wallet_group = ? ORDER BY created_at')
                .all(group) as typeof rows;
        } else {
            rows = db.prepare('SELECT * FROM wallets ORDER BY created_at').all() as typeof rows;
        }

        return rows.map((row) => ({
            address: row.address,
            encryptedPrivateKey: row.encrypted_private_key,
            chainId: row.chain_id,
            alias: row.alias || undefined,
            group: row.wallet_group || undefined,
            createdAt: new Date(row.created_at),
        }));
    }

    /**
     * 取得單一錢包
     */
    async getWallet(address: string): Promise<WalletData | null> {
        const db = await this.ensureDb();

        type WalletRow = {
            address: string;
            encrypted_private_key: string;
            chain_id: string;
            alias: string | null;
            wallet_group: string | null;
            created_at: string;
        };

        // 先用原始地址查詢，找不到再用小寫查詢 (EVM 相容)
        let row = db.prepare('SELECT * FROM wallets WHERE address = ?').get(address) as WalletRow | undefined;
        if (!row) {
            row = db.prepare('SELECT * FROM wallets WHERE address = ?').get(address.toLowerCase()) as WalletRow | undefined;
        }

        if (!row) return null;

        return {
            address: row.address,
            encryptedPrivateKey: row.encrypted_private_key,
            chainId: row.chain_id,
            alias: row.alias || undefined,
            group: row.wallet_group || undefined,
            createdAt: new Date(row.created_at),
        };
    }

    /**
     * 用地址或別名取得錢包
     */
    async getWalletByAddressOrAlias(addressOrAlias: string): Promise<WalletData | null> {
        const db = await this.ensureDb();

        type WalletRow = {
            address: string;
            encrypted_private_key: string;
            chain_id: string;
            alias: string | null;
            wallet_group: string | null;
            created_at: string;
        };

        // 先用原始地址查詢
        let row = db.prepare('SELECT * FROM wallets WHERE address = ?').get(addressOrAlias) as WalletRow | undefined;

        // 找不到再用小寫地址查詢 (EVM 相容)
        if (!row) {
            row = db.prepare('SELECT * FROM wallets WHERE address = ?').get(addressOrAlias.toLowerCase()) as WalletRow | undefined;
        }

        // 如果還是找不到，嘗試用別名搜尋
        if (!row) {
            row = db.prepare('SELECT * FROM wallets WHERE alias = ?').get(addressOrAlias) as WalletRow | undefined;
        }

        if (!row) return null;

        return {
            address: row.address,
            encryptedPrivateKey: row.encrypted_private_key,
            chainId: row.chain_id,
            alias: row.alias || undefined,
            group: row.wallet_group || undefined,
            createdAt: new Date(row.created_at),
        };
    }

    /**
     * 刪除錢包
     */
    async deleteWallet(address: string): Promise<boolean> {
        const db = await this.ensureDb();
        const result = db.prepare('DELETE FROM wallets WHERE address = ?').run(address.toLowerCase());
        return result.changes > 0;
    }

    /**
     * 加密私鑰
     */
    async encryptPrivateKey(privateKey: string): Promise<string> {
        if (!this.masterPassword) {
            throw new Error('KeyStore 未解鎖');
        }
        const encrypted = await encrypt(privateKey, this.masterPassword);
        return serializeEncrypted(encrypted);
    }

    /**
     * 解密私鑰
     */
    async decryptPrivateKey(encryptedKey: string): Promise<string> {
        if (!this.masterPassword) {
            throw new Error('KeyStore 未解鎖');
        }
        const encrypted = deserializeEncrypted(encryptedKey);
        return decrypt(encrypted, this.masterPassword);
    }

    /**
     * 關閉資料庫連線
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// 全域單例
let keyStoreInstance: KeyStore | null = null;

export function getKeyStore(dbPath?: string): KeyStore {
    if (!keyStoreInstance) {
        keyStoreInstance = new KeyStore(dbPath);
    }
    return keyStoreInstance;
}
