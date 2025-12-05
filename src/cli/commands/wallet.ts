/**
 * 錢包管理命令
 */
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { getKeyStore } from '../../storage/KeyStore.js';
import { EvmAdapter, EVM_CHAINS } from '../../adapters/evm/EvmAdapter.js';
import { SolanaAdapter, SOLANA_NETWORKS } from '../../adapters/solana/SolanaAdapter.js';
import { logger } from '../../utils/logger.js';
import type { IChainAdapter } from '../../core/interfaces/index.js';

function getAdapter(chainId: string): IChainAdapter {
    if (EVM_CHAINS[chainId]) {
        return new EvmAdapter(chainId);
    }
    if (SOLANA_NETWORKS[chainId]) {
        return new SolanaAdapter(chainId);
    }
    throw new Error(`不支援的鏈: ${chainId}`);
}

function getSupportedChains(): string[] {
    return [...Object.keys(EVM_CHAINS), ...Object.keys(SOLANA_NETWORKS)];
}

export const walletCommand = new Command('wallet')
    .description('錢包管理')
    .addCommand(
        new Command('init')
            .description('初始化 KeyStore (首次使用)')
            .action(async () => {
                const keyStore = getKeyStore();

                if (await keyStore.isInitialized()) {
                    logger.warn('KeyStore 已初始化');
                    return;
                }

                const { password, confirm } = await inquirer.prompt([
                    {
                        type: 'password',
                        name: 'password',
                        message: '設定主密碼:',
                        mask: '*',
                    },
                    {
                        type: 'password',
                        name: 'confirm',
                        message: '確認密碼:',
                        mask: '*',
                    },
                ]);

                if (password !== confirm) {
                    logger.error('密碼不一致');
                    return;
                }

                await keyStore.initialize(password);
            })
    )
    .addCommand(
        new Command('unlock')
            .description('解鎖 KeyStore')
            .action(async () => {
                const keyStore = getKeyStore();

                if (!await keyStore.isInitialized()) {
                    logger.error('請先執行 wallet init');
                    return;
                }

                if (keyStore.isUnlocked()) {
                    logger.info('KeyStore 已解鎖');
                    return;
                }

                const { password } = await inquirer.prompt([
                    {
                        type: 'password',
                        name: 'password',
                        message: '輸入主密碼:',
                        mask: '*',
                    },
                ]);

                await keyStore.unlock(password);
            })
    )
    .addCommand(
        new Command('create')
            .description('建立新錢包')
            .argument('[chain]', '區塊鏈 (ethereum, solana, base...)', 'ethereum')
            .option('-c, --chain <chain>', '區塊鏈 (可用 -c 或直接指定)')
            .option('-n, --count <count>', '建立數量', '1')
            .option('-a, --alias <alias>', '錢包別名')
            .option('-g, --group <group>', '錢包群組')
            .action(async (chainArg, options) => {
                const keyStore = getKeyStore();
                await ensureUnlocked(keyStore);

                // 優先使用 --chain 選項，否則使用位置參數
                const chain = (options.chain || chainArg) as string;
                const count = parseInt(options.count, 10);
                const group = options.group as string | undefined;

                console.log(chalk.cyan(`\n🔧 在 ${chain} 建立 ${count} 個錢包${group ? ` (群組: ${group})` : ''}...\n`));

                const adapter = getAdapter(chain);

                for (let i = 0; i < count; i++) {
                    const wallet = await adapter.createWallet();
                    const alias = options.alias
                        ? (count > 1 ? `${options.alias}-${i + 1}` : options.alias)
                        : undefined;

                    try {
                        await keyStore.saveWallet({
                            address: wallet.address,
                            encryptedPrivateKey: wallet.encryptedPrivateKey,
                            chainId: wallet.chainId,
                            alias,
                            group,
                            createdAt: wallet.createdAt,
                        });

                        const aliasDisplay = alias ? chalk.magenta(`[${alias}]`) : '';
                        const groupDisplay = group ? chalk.blue(`(${group})`) : '';
                        console.log(chalk.green('✓'), `錢包 ${i + 1}:`, aliasDisplay, groupDisplay, chalk.yellow(wallet.address));
                    } catch (error) {
                        console.log(chalk.red('✗'), `錢包 ${i + 1}: ${(error as Error).message}`);
                    }
                }

                console.log(chalk.green(`\n✅ 完成\n`));
            })
    )
    .addCommand(
        new Command('import')
            .description('匯入錢包')
            .option('-c, --chain <chain>', '區塊鏈', 'ethereum')
            .option('-a, --alias <alias>', '錢包別名')
            .action(async (options) => {
                const keyStore = getKeyStore();
                await ensureUnlocked(keyStore);

                const { privateKey } = await inquirer.prompt([
                    {
                        type: 'password',
                        name: 'privateKey',
                        message: '輸入私鑰:',
                        mask: '*',
                    },
                ]);

                const adapter = getAdapter(options.chain);
                const wallet = await adapter.importWallet(privateKey);
                wallet.alias = options.alias;

                await keyStore.saveWallet({
                    address: wallet.address,
                    encryptedPrivateKey: wallet.encryptedPrivateKey,
                    chainId: wallet.chainId,
                    alias: wallet.alias,
                    createdAt: wallet.createdAt,
                });

                console.log(chalk.green('\n✅ 錢包匯入成功:'), chalk.yellow(wallet.address), '\n');
            })
    )
    .addCommand(
        new Command('list')
            .description('列出所有錢包')
            .argument('[chain]', '篩選區塊鏈 (ethereum, solana...)')
            .option('-c, --chain <chain>', '篩選區塊鏈')
            .option('-g, --group <group>', '篩選群組')
            .action(async (chainArg, options) => {
                const keyStore = getKeyStore();
                const chain = options.chain || chainArg;
                const group = options.group as string | undefined;
                const wallets = await keyStore.getWallets(chain, group);

                if (wallets.length === 0) {
                    console.log(chalk.yellow('\n沒有錢包\n'));
                    return;
                }

                const filterInfo = [chain, group].filter(Boolean).join(', ');
                console.log(chalk.cyan(`\n📋 錢包列表 (${wallets.length} 個)${filterInfo ? ` - 篩選: ${filterInfo}` : ''}\n`));
                console.log(chalk.gray('-'.repeat(90)));

                for (const wallet of wallets) {
                    const alias = wallet.alias ? chalk.magenta(`[${wallet.alias}]`) : '';
                    const groupDisplay = wallet.group ? chalk.blue(`(${wallet.group})`) : '';
                    console.log(
                        chalk.blue(`[${wallet.chainId}]`),
                        alias,
                        groupDisplay,
                        chalk.yellow(wallet.address)
                    );
                }

                console.log(chalk.gray('-'.repeat(90)));
                console.log();
            })
    )
    .addCommand(
        new Command('export')
            .description('匯出錢包私鑰')
            .requiredOption('-a, --address <address>', '錢包地址')
            .action(async (options) => {
                const keyStore = getKeyStore();
                await ensureUnlocked(keyStore);

                const wallet = await keyStore.getWallet(options.address);
                if (!wallet) {
                    logger.error('找不到錢包');
                    return;
                }

                const { confirm } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: chalk.red('⚠️ 警告: 匯出私鑰有安全風險，確定要繼續嗎？'),
                        default: false,
                    },
                ]);

                if (!confirm) return;

                const privateKey = await keyStore.decryptPrivateKey(wallet.encryptedPrivateKey);
                console.log(chalk.yellow('\n私鑰:'), privateKey, '\n');
                console.log(chalk.red('⚠️ 請妥善保管，不要分享給任何人\n'));
            })
    )
    .addCommand(
        new Command('delete')
            .description('刪除錢包')
            .requiredOption('-a, --address <address>', '錢包地址')
            .action(async (options) => {
                const keyStore = getKeyStore();

                const { confirm } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: chalk.red(`確定要刪除錢包 ${options.address} 嗎？`),
                        default: false,
                    },
                ]);

                if (!confirm) return;

                const deleted = await keyStore.deleteWallet(options.address);
                if (deleted) {
                    logger.success('錢包已刪除');
                } else {
                    logger.error('找不到錢包');
                }
            })
    )
    .addCommand(
        new Command('rename')
            .description('修改錢包別名')
            .argument('<addressOrAlias>', '錢包地址或現有別名')
            .argument('<newAlias>', '新別名')
            .action(async (addressOrAlias, newAlias) => {
                const keyStore = getKeyStore();
                await ensureUnlocked(keyStore);

                const wallet = await keyStore.getWalletByAddressOrAlias(addressOrAlias);

                if (!wallet) {
                    logger.error('找不到錢包');
                    return;
                }

                wallet.alias = newAlias;
                await keyStore.saveWallet(wallet);
                logger.success(`別名已更新為: ${newAlias}`);
            })
    )
    .addCommand(
        new Command('chains')
            .description('列出支援的區塊鏈')
            .action(() => {
                console.log(chalk.cyan('\n支援的區塊鏈:\n'));

                console.log(chalk.blue('EVM 鏈:'));
                for (const [id, config] of Object.entries(EVM_CHAINS)) {
                    console.log(`  ${chalk.yellow(id.padEnd(15))} ${config.chainName}`);
                }

                console.log(chalk.blue('\nSolana:'));
                for (const [id, config] of Object.entries(SOLANA_NETWORKS)) {
                    console.log(`  ${chalk.yellow(id.padEnd(15))} ${config.chainName}`);
                }
                console.log();
            })
    );

async function ensureUnlocked(keyStore: ReturnType<typeof getKeyStore>): Promise<void> {
    if (!await keyStore.isInitialized()) {
        throw new Error('請先執行 tge wallet init');
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
            throw new Error('密碼錯誤');
        }
    }
}
