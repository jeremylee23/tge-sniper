/**
 * 餘額查詢命令
 */
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getKeyStore } from '../../storage/KeyStore.js';
import { EvmAdapter, EVM_CHAINS } from '../../adapters/evm/EvmAdapter.js';
import { SolanaAdapter, SOLANA_NETWORKS } from '../../adapters/solana/SolanaAdapter.js';
import type { IChainAdapter, Balance } from '../../core/interfaces/index.js';

function getAdapter(chainId: string): IChainAdapter {
    if (EVM_CHAINS[chainId]) {
        return new EvmAdapter(chainId);
    }
    if (SOLANA_NETWORKS[chainId]) {
        return new SolanaAdapter(chainId);
    }
    throw new Error(`不支援的鏈: ${chainId}`);
}

export const balanceCommand = new Command('balance')
    .description('查詢錢包餘額')
    .option('-a, --address <address>', '指定錢包地址')
    .option('-c, --chain <chain>', '指定區塊鏈')
    .option('--all', '查詢所有錢包')
    .action(async (options) => {
        const keyStore = getKeyStore();

        if (options.address && options.chain) {
            // 查詢單一地址
            const adapter = getAdapter(options.chain);
            const spinner = ora(`查詢 ${options.address.slice(0, 10)}... 餘額`).start();

            try {
                const balance = await adapter.getBalance(options.address);
                spinner.stop();
                printBalance(options.address, options.chain, balance);
            } catch (error) {
                spinner.fail((error as Error).message);
            }
            return;
        }

        if (options.all || !options.address) {
            // 查詢所有錢包
            const wallets = await keyStore.getWallets(options.chain);

            if (wallets.length === 0) {
                console.log(chalk.yellow('\n沒有錢包\n'));
                return;
            }

            console.log(chalk.cyan(`\n💰 錢包餘額 (${wallets.length} 個)\n`));
            console.log(chalk.gray('─'.repeat(90)));

            // 按鏈分組
            const walletsByChain = new Map<string, typeof wallets>();
            for (const wallet of wallets) {
                const chainWallets = walletsByChain.get(wallet.chainId) || [];
                chainWallets.push(wallet);
                walletsByChain.set(wallet.chainId, chainWallets);
            }

            for (const [chainId, chainWallets] of walletsByChain) {
                console.log(chalk.blue(`\n[${chainId}]`));

                const adapter = getAdapter(chainId);

                for (const wallet of chainWallets) {
                    const spinner = ora({
                        text: `${wallet.address.slice(0, 10)}...`,
                        spinner: 'dots',
                    }).start();

                    try {
                        const balance = await adapter.getBalance(wallet.address);
                        spinner.stop();

                        const alias = wallet.alias ? chalk.magenta(`[${wallet.alias}]`) : '';
                        const balanceStr = formatBalance(balance);

                        console.log(
                            `  ${chalk.yellow(wallet.address)}`,
                            alias,
                            chalk.green(balanceStr)
                        );
                    } catch (error) {
                        spinner.stop();
                        console.log(
                            `  ${chalk.yellow(wallet.address)}`,
                            chalk.red(`錯誤: ${(error as Error).message}`)
                        );
                    }
                }
            }

            console.log(chalk.gray('\n' + '─'.repeat(90)));
            console.log();
        }
    });

function printBalance(address: string, chain: string, balance: Balance): void {
    console.log(chalk.cyan('\n💰 餘額查詢結果\n'));
    console.log(`  鏈:     ${chalk.blue(chain)}`);
    console.log(`  地址:   ${chalk.yellow(address)}`);
    console.log(`  餘額:   ${chalk.green(formatBalance(balance))}`);
    console.log();
}

function formatBalance(balance: Balance): string {
    const value = parseFloat(balance.formatted);
    if (value === 0) {
        return `0 ${balance.symbol}`;
    }
    if (value < 0.0001) {
        return `< 0.0001 ${balance.symbol}`;
    }
    return `${value.toFixed(4)} ${balance.symbol}`;
}
