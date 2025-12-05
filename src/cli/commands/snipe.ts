/**
 * 搶購命令 - TGE Sniper 核心功能
 */
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { getKeyStore } from '../../storage/KeyStore.js';
import { EvmAdapter, EVM_CHAINS } from '../../adapters/evm/EvmAdapter.js';
import { SolanaAdapter, SOLANA_NETWORKS } from '../../adapters/solana/SolanaAdapter.js';
import { PreSigner } from '../../core/sniper/PreSigner.js';
import { TimerTrigger } from '../../core/sniper/TimerTrigger.js';
import { Broadcaster } from '../../core/sniper/Broadcaster.js';
import { logger } from '../../utils/logger.js';
import type { IChainAdapter, SnipeParams } from '../../core/interfaces/index.js';

function getAdapters(): Map<string, IChainAdapter> {
    const adapters = new Map<string, IChainAdapter>();

    for (const chainId of Object.keys(EVM_CHAINS)) {
        adapters.set(chainId, new EvmAdapter(chainId));
    }

    for (const chainId of Object.keys(SOLANA_NETWORKS)) {
        adapters.set(chainId, new SolanaAdapter(chainId));
    }

    return adapters;
}

export const snipeCommand = new Command('snipe')
    .description('🎯 TGE 搶購')
    .requiredOption('-c, --chain <chain>', '區塊鏈 (ethereum, base, solana...)')
    .requiredOption('--contract <address>', '目標合約地址')
    .option('-f, --function <signature>', '函數簽名 (e.g., "buy(uint256)")')
    .option('--args <args>', '函數參數 (JSON 格式)')
    .option('--data <data>', '原始交易資料 (Solana Instruction JSON 或 EVM Calldata)')
    .option('-v, --value <amount>', '發送金額 (ETH/SOL)')
    .option('-t, --time <datetime>', '目標時間 (ISO 格式或 +秒數)')
    .option('-w, --wallets <addresses>', '使用的錢包地址 (逗號分隔或 "all")')
    .option('-g, --gas-priority <level>', 'Gas 優先級 (low/normal/high)', 'high')
    .option('--early <ms>', '提前發送毫秒數', '100')
    .option('--dry-run', '模擬執行 (不實際發送)')
    .option('--simulate', '發送前先模擬交易，確認會成功')
    .action(async (options) => {
        const keyStore = getKeyStore();

        // 確保解鎖
        if (!await keyStore.isInitialized()) {
            logger.error('請先執行 tge wallet init');
            return;
        }

        if (!keyStore.isUnlocked()) {
            const { password } = await inquirer.prompt([
                {
                    type: 'password',
                    name: 'password',
                    message: '輸入主密碼:',
                    mask: '*',
                },
            ]);

            const success = await keyStore.unlock(password);
            if (!success) {
                logger.error('密碼錯誤');
                return;
            }
        }

        // 解析參數
        const chainId = options.chain as string;
        const contractAddress = options.contract as string;
        const functionSignature = options.function as string | undefined;
        const args = options.args ? JSON.parse(options.args) : undefined;
        const data = options.data as string | undefined;
        const value = options.value as string | undefined;
        const gasPriority = options.gasPriority as 'low' | 'normal' | 'high';
        const earlyMs = parseInt(options.early, 10);

        // 解析目標時間
        let targetTime: Date;
        if (options.time) {
            if (options.time.startsWith('+')) {
                // 相對時間 (e.g., +30 = 30秒後)
                const seconds = parseInt(options.time.slice(1), 10);
                targetTime = new Date(Date.now() + seconds * 1000);
            } else {
                targetTime = new Date(options.time);
            }
        } else {
            // 互動式輸入時間
            const { timeInput } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'timeInput',
                    message: '輸入目標時間 (ISO 格式或 +秒數):',
                    default: '+30',
                },
            ]);

            if (timeInput.startsWith('+')) {
                const seconds = parseInt(timeInput.slice(1), 10);
                targetTime = new Date(Date.now() + seconds * 1000);
            } else {
                targetTime = new Date(timeInput);
            }
        }

        // 解析錢包
        let wallets: string[] | 'all';
        if (options.wallets === 'all' || !options.wallets) {
            wallets = 'all';
        } else {
            wallets = options.wallets.split(',').map((s: string) => s.trim());
        }

        const snipeParams: SnipeParams = {
            chainId,
            contractAddress,
            functionSignature: functionSignature || '',
            args,
            data,
            value,
            targetTime,
            wallets,
            gasPriority,
        };

        // 顯示任務摘要
        console.log(chalk.cyan('\n🎯 搶購任務設定\n'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(`  鏈:       ${chalk.blue(chainId)}`);
        console.log(`  合約:     ${chalk.yellow(contractAddress)}`);
        if (functionSignature) {
            console.log(`  函數:     ${chalk.magenta(functionSignature)}`);
        }
        if (args) {
            console.log(`  參數:     ${chalk.gray(JSON.stringify(args))}`);
        }
        if (value) {
            console.log(`  金額:     ${chalk.green(value)}`);
        }
        console.log(`  時間:     ${chalk.red(targetTime.toISOString())}`);
        console.log(`  錢包:     ${chalk.cyan(wallets === 'all' ? '全部' : wallets.join(', '))}`);
        console.log(`  Gas:      ${chalk.yellow(gasPriority)}`);
        console.log(`  提前:     ${chalk.gray(earlyMs + 'ms')}`);
        console.log(chalk.gray('─'.repeat(60)));

        if (options.dryRun) {
            console.log(chalk.yellow('\n⚠️ 模擬模式，不會實際發送交易\n'));
            return;
        }

        // 確認執行
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: '確認開始搶購任務？',
                default: true,
            },
        ]);

        if (!confirm) {
            console.log(chalk.gray('已取消'));
            return;
        }

        // 初始化組件
        const adapters = getAdapters();
        const preSigner = new PreSigner(adapters);
        const timer = new TimerTrigger();
        const broadcaster = new Broadcaster(adapters);

        // 同步時間
        console.log(chalk.cyan('\n⏱️ 同步時間...\n'));
        await timer.syncTime();

        // 預簽名
        console.log(chalk.cyan('\n✍️ 預簽名交易...\n'));
        const spinner = ora('準備中...').start();

        let prepared;
        try {
            prepared = await preSigner.prepare(snipeParams);
            spinner.succeed(`${prepared.signedTransactions.length} 筆交易已準備就緒`);
        } catch (error) {
            spinner.fail((error as Error).message);
            return;
        }

        // 如果啟用模擬，先模擬交易
        if (options.simulate) {
            console.log(chalk.cyan('\n🔍 模擬交易中...\n'));
            const simSpinner = ora('模擬中...').start();

            const adapter = adapters.get(chainId);
            if (adapter && 'simulateTransaction' in adapter) {
                let allSuccess = true;
                for (const tx of prepared.signedTransactions) {
                    const simResult = await (adapter as any).simulateTransaction(tx);
                    if (!simResult.success) {
                        simSpinner.fail(`模擬失敗: ${simResult.error}`);
                        if (simResult.logs) {
                            console.log(chalk.gray('日誌:'), simResult.logs.slice(-5).join('\n'));
                        }
                        allSuccess = false;
                        break;
                    }
                }

                if (!allSuccess) {
                    console.log(chalk.red('\n⚠️ 交易模擬失敗，已中止發送'));
                    console.log(chalk.yellow('提示: 可能是餘額不足、未開始、或不在白名單內'));
                    return;
                }

                simSpinner.succeed('模擬成功! 交易預計會成功');
            } else {
                simSpinner.warn('此鏈不支援模擬，跳過');
            }
        }

        // 設定計時器
        console.log(chalk.cyan('\n⏳ 等待目標時間...\n'));

        timer.scheduleAt(
            targetTime,
            async () => {
                // 極速廣播
                const results = await broadcaster.blitz(chainId, prepared.signedTransactions);

                // 統計結果
                const successCount = results.filter((r) => r.bestResult.success).length;
                const failCount = results.length - successCount;

                console.log(chalk.cyan('\n📊 搶購結果\n'));
                console.log(chalk.gray('─'.repeat(60)));
                console.log(`  成功: ${chalk.green(successCount)}`);
                console.log(`  失敗: ${chalk.red(failCount)}`);
                console.log(chalk.gray('─'.repeat(60)));

                // 顯示詳細結果
                for (const result of results) {
                    if (result.bestResult.success) {
                        console.log(
                            chalk.green('✓'),
                            chalk.gray(result.wallet.slice(0, 10) + '...'),
                            chalk.cyan(result.bestResult.hash?.slice(0, 20) + '...')
                        );
                    } else {
                        console.log(
                            chalk.red('✗'),
                            chalk.gray(result.wallet.slice(0, 10) + '...'),
                            chalk.red(result.bestResult.error)
                        );
                    }
                }

                console.log();
            },
            earlyMs
        );

        // 保持程式運行
        console.log(chalk.gray('按 Ctrl+C 取消...\n'));
    });
