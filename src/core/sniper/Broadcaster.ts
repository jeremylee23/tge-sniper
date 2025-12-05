/**
 * 多節點廣播器
 * 同時向多個 RPC 節點發送交易，提高成功率
 */
import type { IChainAdapter, SignedTransaction, TxResult } from '../interfaces/index.js';
import { logger } from '../../utils/logger.js';

export interface BroadcastResult {
    wallet: string;
    results: TxResult[];
    bestResult: TxResult;
}

export class Broadcaster {
    private adapters: Map<string, IChainAdapter>;
    private maxConcurrent: number;

    constructor(adapters: Map<string, IChainAdapter>, maxConcurrent: number = 10) {
        this.adapters = adapters;
        this.maxConcurrent = maxConcurrent;
    }

    /**
     * 廣播單一交易到多個節點
     */
    async broadcastSingle(
        chainId: string,
        signedTx: SignedTransaction
    ): Promise<TxResult> {
        const adapter = this.adapters.get(chainId);
        if (!adapter) {
            return { success: false, error: `不支援的鏈: ${chainId}` };
        }

        return adapter.broadcastToMultipleRpcs(signedTx);
    }

    /**
     * 並發廣播多筆交易
     * 所有交易同時發送，最大化速度
     */
    async broadcastAll(
        chainId: string,
        signedTransactions: SignedTransaction[]
    ): Promise<BroadcastResult[]> {
        const adapter = this.adapters.get(chainId);
        if (!adapter) {
            throw new Error(`不支援的鏈: ${chainId}`);
        }

        logger.snipe(`開始廣播 ${signedTransactions.length} 筆交易...`);
        const startTime = Date.now();

        // 分批處理以避免過載
        const results: BroadcastResult[] = [];

        for (let i = 0; i < signedTransactions.length; i += this.maxConcurrent) {
            const batch = signedTransactions.slice(i, i + this.maxConcurrent);

            const batchPromises = batch.map(async (signedTx) => {
                const result = await adapter.broadcastToMultipleRpcs(signedTx);
                return {
                    wallet: signedTx.from,
                    results: [result],
                    bestResult: result,
                };
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        const elapsed = Date.now() - startTime;
        const successCount = results.filter((r) => r.bestResult.success).length;

        logger.snipe(`✅ 廣播完成: ${successCount}/${results.length} 成功，耗時 ${elapsed}ms`);

        return results;
    }

    /**
     * 極速模式：所有交易同時發送（無等待）
     * 用於搶購場景
     */
    async blitz(
        chainId: string,
        signedTransactions: SignedTransaction[]
    ): Promise<BroadcastResult[]> {
        const adapter = this.adapters.get(chainId);
        if (!adapter) {
            throw new Error(`不支援的鏈: ${chainId}`);
        }

        logger.snipe(`⚡ 極速模式：同時發送 ${signedTransactions.length} 筆交易`);
        const startTime = Date.now();

        // 所有交易同時發送，不等待
        const promises = signedTransactions.map(async (signedTx) => {
            try {
                const result = await adapter.broadcastToMultipleRpcs(signedTx);
                return {
                    wallet: signedTx.from,
                    results: [result],
                    bestResult: result,
                };
            } catch (error) {
                return {
                    wallet: signedTx.from,
                    results: [{ success: false, error: (error as Error).message }],
                    bestResult: { success: false, error: (error as Error).message },
                };
            }
        });

        const results = await Promise.all(promises);
        const elapsed = Date.now() - startTime;
        const successCount = results.filter((r) => r.bestResult.success).length;

        logger.snipe(`⚡ 極速廣播完成: ${successCount}/${results.length} 成功，耗時 ${elapsed}ms`);

        // 輸出詳細結果
        for (const result of results) {
            if (result.bestResult.success) {
                logger.tx('成功', result.bestResult.hash || '', 'success');
            } else {
                logger.tx(`失敗 (${result.wallet.slice(0, 10)}...)`, result.bestResult.error || '', 'failed');
            }
        }

        return results;
    }
}
