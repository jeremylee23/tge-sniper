/**
 * 預簽名引擎
 * 提前準備好簽名交易，等待觸發時直接廣播
 */
import type {
    IChainAdapter,
    SnipeParams,
    SignedTransaction,
    WalletInfo,
    Signer,
} from '../interfaces/index.js';
import { getKeyStore } from '../../storage/KeyStore.js';
import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/crypto.js';

export interface PreparedSnipe {
    id: string;
    params: SnipeParams;
    signedTransactions: SignedTransaction[];
    wallets: WalletInfo[];
    createdAt: Date;
}

export class PreSigner {
    private adapters: Map<string, IChainAdapter>;

    constructor(adapters: Map<string, IChainAdapter>) {
        this.adapters = adapters;
    }

    /**
     * 準備搶購任務
     * 預先簽名所有錢包的交易
     */
    async prepare(params: SnipeParams): Promise<PreparedSnipe> {
        const adapter = this.adapters.get(params.chainId);
        if (!adapter) {
            throw new Error(`不支援的鏈: ${params.chainId}`);
        }

        const keyStore = getKeyStore();
        if (!keyStore.isUnlocked()) {
            throw new Error('KeyStore 未解鎖');
        }

        // 取得要使用的錢包
        const allWallets = await keyStore.getWallets(params.chainId);
        let wallets: WalletInfo[];

        if (params.wallets === 'all') {
            wallets = allWallets.map(w => ({
                address: w.address,
                encryptedPrivateKey: w.encryptedPrivateKey,
                chainId: w.chainId,
                alias: w.alias,
                createdAt: w.createdAt,
            }));
        } else {
            // 支援 address, alias, 或 @group 格式
            const walletSelectors = params.wallets;

            wallets = allWallets
                .filter((w) => {
                    for (const selector of walletSelectors) {
                        // @group:xxx 格式
                        if (selector.startsWith('@group:')) {
                            const groupName = selector.slice(7);
                            if (w.group === groupName) return true;
                        }
                        // 地址匹配
                        else if (w.address === selector || w.address.toLowerCase() === selector.toLowerCase()) {
                            return true;
                        }
                        // alias 匹配
                        else if (w.alias && w.alias === selector) {
                            return true;
                        }
                    }
                    return false;
                })
                .map(w => ({
                    address: w.address,
                    encryptedPrivateKey: w.encryptedPrivateKey,
                    chainId: w.chainId,
                    alias: w.alias,
                    createdAt: w.createdAt,
                }));
        }

        if (wallets.length === 0) {
            throw new Error('沒有可用的錢包');
        }

        logger.snipe(`準備簽名 ${wallets.length} 個錢包的交易...`);

        // 準備交易資料
        let callData: string | undefined = params.data;

        // 如果沒有提供原始資料但有函數簽名，則嘗試編碼
        if (!callData && params.functionSignature) {
            callData = await adapter.encodeContractCall({
                contractAddress: params.contractAddress,
                functionSignature: params.functionSignature,
                args: params.args,
            });
        }

        // 並行簽名所有錢包的交易
        const signedTransactions: SignedTransaction[] = [];
        const signingPromises = wallets.map(async (wallet, index) => {
            try {
                // 取得 signer
                const signer: Signer = await adapter.getSigner(wallet);

                // 建立交易
                const unsignedTx = await adapter.buildTransaction({
                    from: wallet.address,
                    to: params.contractAddress,
                    value: params.value,
                    data: callData,
                    gasPriority: params.gasPriority,
                });

                // 簽名
                const signedTx = await adapter.signTransaction(unsignedTx, signer);

                logger.success(`錢包 ${index + 1}/${wallets.length} 簽名完成: ${wallet.address.slice(0, 10)}...`);

                return signedTx;
            } catch (error) {
                logger.error(`錢包 ${wallet.address} 簽名失敗: ${(error as Error).message}`);
                return null;
            }
        });

        const results = await Promise.all(signingPromises);
        for (const result of results) {
            if (result) {
                signedTransactions.push(result);
            }
        }

        if (signedTransactions.length === 0) {
            throw new Error('所有錢包簽名失敗');
        }

        const prepared: PreparedSnipe = {
            id: generateId(),
            params,
            signedTransactions,
            wallets,
            createdAt: new Date(),
        };

        logger.snipe(`✅ ${signedTransactions.length} 筆交易已預簽名，等待觸發`);

        return prepared;
    }
}
