/**
 * Solana 鏈適配器
 */
import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
    sendAndConfirmRawTransaction,
    type TransactionInstruction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import type {
    IChainAdapter,
    WalletInfo,
    Balance,
    TransactionRequest,
    TxBuildParams,
    UnsignedTransaction,
    SignedTransaction,
    TxResult,
    GasEstimate,
    ContractCallParams,
    Signer,
} from '../../core/interfaces/index.js';
import { getKeyStore } from '../../storage/KeyStore.js';
import { logger } from '../../utils/logger.js';
import bs58 from 'bs58';

// Solana 網路配置
export interface SolanaNetworkConfig {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
}

export const SOLANA_NETWORKS: Record<string, SolanaNetworkConfig> = {
    solana: {
        chainId: 'solana',
        chainName: 'Solana Mainnet',
        rpcUrls: ['https://api.mainnet-beta.solana.com'],
    },
    'solana-devnet': {
        chainId: 'solana-devnet',
        chainName: 'Solana Devnet',
        rpcUrls: ['https://api.devnet.solana.com'],
    },
};

export class SolanaAdapter implements IChainAdapter {
    readonly chainId: string;
    readonly chainName: string;
    readonly isEvm = false;

    private config: SolanaNetworkConfig;
    private connections: Connection[];
    private currentConnectionIndex = 0;

    constructor(chainId: string = 'solana', customRpcUrls?: string[]) {
        const config = SOLANA_NETWORKS[chainId];
        if (!config) {
            throw new Error(`不支援的 Solana 網路: ${chainId}`);
        }

        this.config = config;
        this.chainId = chainId;
        this.chainName = config.chainName;

        const rpcUrls = customRpcUrls || config.rpcUrls;
        this.connections = rpcUrls.map((url) => new Connection(url, 'confirmed'));
    }

    private getConnection(): Connection {
        const connection = this.connections[this.currentConnectionIndex];
        if (!connection) {
            throw new Error('沒有可用的 RPC 節點');
        }
        return connection;
    }

    private switchConnection(): void {
        this.currentConnectionIndex = (this.currentConnectionIndex + 1) % this.connections.length;
        logger.warn(`切換 Solana RPC: ${this.currentConnectionIndex + 1}/${this.connections.length}`);
    }

    private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
        let lastError: Error | undefined;

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;
                logger.warn(`Solana RPC 請求失敗 (${i + 1}/${maxRetries}): ${lastError.message}`);
                this.switchConnection();
            }
        }

        throw lastError;
    }

    // ========== 錢包操作 ==========

    async createWallet(): Promise<WalletInfo> {
        const keypair = Keypair.generate();
        const keyStore = getKeyStore();

        // 將私鑰編碼為 base58
        const privateKeyBase58 = bs58.encode(keypair.secretKey);
        const encryptedPrivateKey = await keyStore.encryptPrivateKey(privateKeyBase58);

        return {
            address: keypair.publicKey.toBase58(),
            encryptedPrivateKey,
            chainId: this.chainId,
            createdAt: new Date(),
        };
    }

    async importWallet(privateKey: string): Promise<WalletInfo> {
        let keypair: Keypair;

        try {
            // 支援 base58 或 array 格式
            if (privateKey.startsWith('[')) {
                const secretKey = new Uint8Array(JSON.parse(privateKey));
                keypair = Keypair.fromSecretKey(secretKey);
            } else {
                const secretKey = bs58.decode(privateKey);
                keypair = Keypair.fromSecretKey(secretKey);
            }
        } catch {
            throw new Error('無效的 Solana 私鑰格式');
        }

        const keyStore = getKeyStore();
        const privateKeyBase58 = bs58.encode(keypair.secretKey);
        const encryptedPrivateKey = await keyStore.encryptPrivateKey(privateKeyBase58);

        return {
            address: keypair.publicKey.toBase58(),
            encryptedPrivateKey,
            chainId: this.chainId,
            createdAt: new Date(),
        };
    }

    async getSigner(wallet: WalletInfo): Promise<Signer> {
        const keyStore = getKeyStore();
        const privateKeyBase58 = await keyStore.decryptPrivateKey(wallet.encryptedPrivateKey);
        const secretKey = bs58.decode(privateKeyBase58);
        const keypair = Keypair.fromSecretKey(secretKey);

        return {
            type: 'solana',
            address: wallet.address,
            sign: async (data: Uint8Array) => {
                // Solana 使用 nacl 簽名
                const { sign } = await import('tweetnacl');
                return sign.detached(data, keypair.secretKey);
            },
            raw: keypair,
        };
    }

    async getBalance(address: string): Promise<Balance> {
        const publicKey = new PublicKey(address);
        const balance = await this.withRetry(() => this.getConnection().getBalance(publicKey));

        return {
            raw: BigInt(balance),
            formatted: (balance / LAMPORTS_PER_SOL).toFixed(9),
            symbol: 'SOL',
            decimals: 9,
        };
    }

    // ========== 交易操作 ==========

    async estimateGas(_tx: TransactionRequest): Promise<GasEstimate> {
        // Solana 使用固定的交易費用模型
        // 基本費用約 5000 lamports
        const baseFee = 5000n;

        return {
            gasLimit: baseFee,
            estimatedCost: baseFee,
        };
    }

    async buildTransaction(params: TxBuildParams): Promise<UnsignedTransaction> {
        const connection = this.getConnection();
        const fromPubkey = new PublicKey(params.from);
        const toPubkey = new PublicKey(params.to);

        // 取得最新區塊雜湊
        const { blockhash, lastValidBlockHeight } = await this.withRetry(() =>
            connection.getLatestBlockhash()
        );

        const transaction = new Transaction();
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = fromPubkey;

        // 如果有指定金額，新增轉帳指令
        if (params.value) {
            const lamports = Math.floor(parseFloat(params.value) * LAMPORTS_PER_SOL);
            transaction.add(
                SystemProgram.transfer({
                    fromPubkey,
                    toPubkey,
                    lamports,
                })
            );
        }

        // 如果有自訂資料 (Program 呼叫)，需要額外處理
        if (params.data) {
            // 解析 JSON 並轉換為 TransactionInstruction
            const parsed = JSON.parse(params.data) as {
                programId: string;
                keys: Array<{
                    pubkey: string;
                    isSigner: boolean;
                    isWritable: boolean;
                }>;
                data: number[];
            };

            const instruction: TransactionInstruction = {
                programId: new PublicKey(parsed.programId),
                keys: parsed.keys.map((k) => ({
                    pubkey: new PublicKey(k.pubkey),
                    isSigner: k.isSigner,
                    isWritable: k.isWritable,
                })),
                data: Buffer.from(parsed.data),
            };

            transaction.add(instruction);
        }

        return {
            chainId: this.chainId,
            serialized: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
            raw: transaction,
        };
    }

    async signTransaction(tx: UnsignedTransaction, signer: Signer): Promise<SignedTransaction> {
        const keypair = signer.raw as Keypair;
        const transaction = tx.raw as Transaction;

        transaction.sign(keypair);

        const signature = transaction.signature;
        if (!signature) {
            throw new Error('交易簽名失敗');
        }

        return {
            chainId: this.chainId,
            serialized: transaction.serialize().toString('base64'),
            hash: bs58.encode(signature),
            from: signer.address,
        };
    }

    async broadcastTransaction(signedTx: SignedTransaction): Promise<TxResult> {
        try {
            const connection = this.getConnection();
            const rawTransaction = Buffer.from(signedTx.serialized, 'base64');

            const signature = await this.withRetry(() =>
                sendAndConfirmRawTransaction(connection, rawTransaction, {
                    skipPreflight: true,
                })
            );

            logger.tx('廣播 Solana 交易', signature, 'success');

            return {
                success: true,
                hash: signature,
            };
        } catch (error) {
            const err = error as Error;
            return {
                success: false,
                error: err.message,
            };
        }
    }

    /**
     * 模擬交易 - 在發送前確認交易會成功
     */
    async simulateTransaction(signedTx: SignedTransaction): Promise<{ success: boolean; error?: string; logs?: string[] }> {
        try {
            const connection = this.getConnection();
            const rawTransaction = Buffer.from(signedTx.serialized, 'base64');
            const transaction = Transaction.from(rawTransaction);

            const result = await connection.simulateTransaction(transaction);

            if (result.value.err) {
                return {
                    success: false,
                    error: JSON.stringify(result.value.err),
                    logs: result.value.logs || undefined,
                };
            }

            return {
                success: true,
                logs: result.value.logs || undefined,
            };
        } catch (error) {
            const err = error as Error;
            return {
                success: false,
                error: err.message,
            };
        }
    }

    async broadcastToMultipleRpcs(signedTx: SignedTransaction): Promise<TxResult> {
        const rawTransaction = Buffer.from(signedTx.serialized, 'base64');

        const results = await Promise.allSettled(
            this.connections.map(async (connection) => {
                const signature = await connection.sendRawTransaction(rawTransaction, {
                    skipPreflight: true,
                });
                return { success: true, hash: signature };
            })
        );

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success) {
                logger.tx('Solana 多節點廣播成功', result.value.hash, 'success');
                return result.value;
            }
        }

        return {
            success: false,
            error: '所有 Solana RPC 節點廣播失敗',
        };
    }

    // ========== 合約操作 ==========

    async encodeContractCall(_params: ContractCallParams): Promise<string> {
        // Solana Program 呼叫需要特定的 instruction 格式
        // 這裡返回空字串，實際呼叫需要在 CLI 層組裝
        throw new Error('Solana Program 呼叫需要使用專用的 instruction builder');
    }

    async getNonce(_address: string): Promise<number> {
        // Solana 不使用傳統的 nonce
        // 使用 blockhash 作為重放保護
        return 0;
    }

    static getSupportedChains(): string[] {
        return Object.keys(SOLANA_NETWORKS);
    }
}
