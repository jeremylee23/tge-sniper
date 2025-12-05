/**
 * EVM 鏈適配器
 * 支援 Ethereum, BSC, Polygon, Arbitrum, Base 等 EVM 相容鏈
 */
import {
    ethers,
    Wallet,
    JsonRpcProvider,
    Interface,
    parseEther,
    formatEther,
    Transaction,
    type TransactionRequest as EthersTransactionRequest,
} from 'ethers';
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

// EVM 鏈配置
export interface EvmChainConfig {
    chainId: string;
    chainName: string;
    nativeCurrency: {
        symbol: string;
        decimals: number;
    };
    rpcUrls: string[];
    blockExplorerUrl?: string;
}

// 預設支援的鏈
export const EVM_CHAINS: Record<string, EvmChainConfig> = {
    ethereum: {
        chainId: 'ethereum',
        chainName: 'Ethereum Mainnet',
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
    },
    sepolia: {
        chainId: 'sepolia',
        chainName: 'Ethereum Sepolia',
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.sepolia.org', 'https://sepolia.drpc.org'],
    },
    base: {
        chainId: 'base',
        chainName: 'Base Mainnet',
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.base.org', 'https://base.llamarpc.com'],
    },
    arbitrum: {
        chainId: 'arbitrum',
        chainName: 'Arbitrum One',
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
    },
    polygon: {
        chainId: 'polygon',
        chainName: 'Polygon',
        nativeCurrency: { symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://polygon-rpc.com', 'https://rpc.ankr.com/polygon'],
    },
    bsc: {
        chainId: 'bsc',
        chainName: 'BNB Smart Chain',
        nativeCurrency: { symbol: 'BNB', decimals: 18 },
        rpcUrls: ['https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc'],
    },
};

export class EvmAdapter implements IChainAdapter {
    readonly chainId: string;
    readonly chainName: string;
    readonly isEvm = true;

    private config: EvmChainConfig;
    private providers: JsonRpcProvider[];
    private currentProviderIndex = 0;

    constructor(chainId: string, customRpcUrls?: string[]) {
        const config = EVM_CHAINS[chainId];
        if (!config) {
            throw new Error(`不支援的 EVM 鏈: ${chainId}`);
        }

        this.config = config;
        this.chainId = chainId;
        this.chainName = config.chainName;

        // 初始化 RPC providers
        const rpcUrls = customRpcUrls || config.rpcUrls;
        this.providers = rpcUrls.map((url) => new JsonRpcProvider(url));
    }

    /**
     * 取得當前 provider (支援故障轉移)
     */
    private getProvider(): JsonRpcProvider {
        const provider = this.providers[this.currentProviderIndex];
        if (!provider) {
            throw new Error('沒有可用的 RPC 節點');
        }
        return provider;
    }

    /**
     * 切換到下一個 provider
     */
    private switchProvider(): void {
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
        logger.warn(`切換 RPC 節點: ${this.currentProviderIndex + 1}/${this.providers.length}`);
    }

    /**
     * 執行 RPC 請求 (帶重試)
     */
    private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
        let lastError: Error | undefined;

        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;
                logger.warn(`RPC 請求失敗 (${i + 1}/${maxRetries}): ${lastError.message}`);
                this.switchProvider();
            }
        }

        throw lastError;
    }

    // ========== 錢包操作 ==========

    async createWallet(): Promise<WalletInfo> {
        const wallet = Wallet.createRandom();
        const keyStore = getKeyStore();

        const encryptedPrivateKey = await keyStore.encryptPrivateKey(wallet.privateKey);

        return {
            address: wallet.address,
            encryptedPrivateKey,
            chainId: this.chainId,
            createdAt: new Date(),
        };
    }

    async importWallet(privateKey: string): Promise<WalletInfo> {
        // 驗證私鑰格式
        let wallet: Wallet;
        try {
            wallet = new Wallet(privateKey);
        } catch {
            throw new Error('無效的私鑰格式');
        }

        const keyStore = getKeyStore();
        const encryptedPrivateKey = await keyStore.encryptPrivateKey(privateKey);

        return {
            address: wallet.address,
            encryptedPrivateKey,
            chainId: this.chainId,
            createdAt: new Date(),
        };
    }

    async getSigner(wallet: WalletInfo): Promise<Signer> {
        const keyStore = getKeyStore();
        const privateKey = await keyStore.decryptPrivateKey(wallet.encryptedPrivateKey);
        const ethersWallet = new Wallet(privateKey, this.getProvider());

        return {
            type: 'evm',
            address: wallet.address,
            sign: async (data: Uint8Array) => {
                const signature = await ethersWallet.signMessage(data);
                return ethers.getBytes(signature);
            },
            raw: ethersWallet,
        };
    }

    async getBalance(address: string): Promise<Balance> {
        const balance = await this.withRetry(() => this.getProvider().getBalance(address));

        return {
            raw: balance,
            formatted: formatEther(balance),
            symbol: this.config.nativeCurrency.symbol,
            decimals: this.config.nativeCurrency.decimals,
        };
    }

    // ========== 交易操作 ==========

    async estimateGas(tx: TransactionRequest | EthersTransactionRequest): Promise<GasEstimate> {
        const provider = this.getProvider();

        const [gasLimit, feeData] = await Promise.all([
            this.withRetry(() => provider.estimateGas(tx as EthersTransactionRequest)),
            this.withRetry(() => provider.getFeeData()),
        ]);

        // 增加 20% 緩衝
        const adjustedGasLimit = (gasLimit * 120n) / 100n;

        const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || 0n;
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 0n;

        return {
            gasLimit: adjustedGasLimit,
            maxFeePerGas,
            maxPriorityFeePerGas,
            estimatedCost: adjustedGasLimit * maxFeePerGas,
        };
    }

    async buildTransaction(params: TxBuildParams): Promise<UnsignedTransaction> {
        const provider = this.getProvider();

        // 取得 nonce
        const nonce =
            params.nonce ?? (await this.withRetry(() => provider.getTransactionCount(params.from)));

        // 取得 fee data
        const feeData = await this.withRetry(() => provider.getFeeData());

        // 計算優先費用
        let priorityFee = feeData.maxPriorityFeePerGas || parseEther('0.000000002'); // 2 Gwei default
        if (params.gasPriority === 'high') {
            priorityFee = priorityFee * 3n;
        } else if (params.gasPriority === 'low') {
            priorityFee = priorityFee / 2n;
        }

        const tx: EthersTransactionRequest = {
            to: params.to,
            value: params.value ? parseEther(params.value) : 0n,
            data: params.data || '0x',
            nonce,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: priorityFee,
            chainId: await this.getNetworkChainId(),
        };

        // 估算 gas
        const gasEstimate = await this.estimateGas(tx);
        tx.gasLimit = gasEstimate.gasLimit;

        return {
            chainId: this.chainId,
            serialized: JSON.stringify(tx, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
            raw: tx,
        };
    }

    async signTransaction(tx: UnsignedTransaction, signer: Signer): Promise<SignedTransaction> {
        const ethersWallet = signer.raw as Wallet;
        const txRequest = JSON.parse(tx.serialized, (_, v) => {
            // 還原 bigint
            if (typeof v === 'string' && /^\d+$/.test(v) && v.length > 15) {
                return BigInt(v);
            }
            return v;
        }) as EthersTransactionRequest;

        const signedTx = await ethersWallet.signTransaction(txRequest);
        const parsed = Transaction.from(signedTx);

        return {
            chainId: this.chainId,
            serialized: signedTx,
            hash: parsed.hash || '',
            from: signer.address,
        };
    }

    async broadcastTransaction(signedTx: SignedTransaction): Promise<TxResult> {
        try {
            const provider = this.getProvider();
            const txResponse = await this.withRetry(() => provider.broadcastTransaction(signedTx.serialized));

            logger.tx('廣播交易', txResponse.hash, 'pending');

            return {
                success: true,
                hash: txResponse.hash,
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
        // 同時向所有 RPC 節點廣播
        const results = await Promise.allSettled(
            this.providers.map(async (provider, index) => {
                try {
                    const txResponse = await provider.broadcastTransaction(signedTx.serialized);
                    return { success: true, hash: txResponse.hash, rpcIndex: index };
                } catch (error) {
                    return { success: false, error: (error as Error).message, rpcIndex: index };
                }
            })
        );

        // 找到第一個成功的結果
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success) {
                logger.tx('多節點廣播成功', result.value.hash!, 'success');
                return {
                    success: true,
                    hash: result.value.hash,
                };
            }
        }

        // 全部失敗
        const errors = results
            .filter((r) => r.status === 'rejected' || !r.value.success)
            .map((r) => (r.status === 'rejected' ? r.reason : r.value.error))
            .join('; ');

        return {
            success: false,
            error: `所有 RPC 節點廣播失敗: ${errors}`,
        };
    }

    // ========== 合約操作 ==========

    async encodeContractCall(params: ContractCallParams): Promise<string> {
        // 解析函數簽名
        const iface = new Interface([`function ${params.functionSignature}`]);
        const functionName = params.functionSignature.split('(')[0];

        if (!functionName) {
            throw new Error('無效的函數簽名');
        }

        return iface.encodeFunctionData(functionName, params.args || []);
    }

    async getNonce(address: string): Promise<number> {
        return this.withRetry(() => this.getProvider().getTransactionCount(address));
    }

    // ========== 輔助方法 ==========

    private async getNetworkChainId(): Promise<bigint> {
        const network = await this.withRetry(() => this.getProvider().getNetwork());
        return network.chainId;
    }

    /**
     * 取得支援的鏈列表
     */
    static getSupportedChains(): string[] {
        return Object.keys(EVM_CHAINS);
    }
}
