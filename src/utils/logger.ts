/**
 * 日誌工具
 */
import chalk from 'chalk';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

let currentLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
    currentLevel = level;
}

function formatTime(): string {
    return new Date().toISOString().slice(11, 23);
}

export const logger = {
    debug(message: string, ...args: unknown[]): void {
        if (currentLevel <= LogLevel.DEBUG) {
            console.log(chalk.gray(`[${formatTime()}] DEBUG:`), message, ...args);
        }
    },

    info(message: string, ...args: unknown[]): void {
        if (currentLevel <= LogLevel.INFO) {
            console.log(chalk.blue(`[${formatTime()}] INFO:`), message, ...args);
        }
    },

    success(message: string, ...args: unknown[]): void {
        if (currentLevel <= LogLevel.INFO) {
            console.log(chalk.green(`[${formatTime()}] ✓`), message, ...args);
        }
    },

    warn(message: string, ...args: unknown[]): void {
        if (currentLevel <= LogLevel.WARN) {
            console.log(chalk.yellow(`[${formatTime()}] WARN:`), message, ...args);
        }
    },

    error(message: string, ...args: unknown[]): void {
        if (currentLevel <= LogLevel.ERROR) {
            console.error(chalk.red(`[${formatTime()}] ERROR:`), message, ...args);
        }
    },

    // 交易相關日誌 (永遠顯示)
    tx(action: string, hash: string, status: 'pending' | 'success' | 'failed'): void {
        const statusIcon = {
            pending: chalk.yellow('⏳'),
            success: chalk.green('✓'),
            failed: chalk.red('✗'),
        }[status];
        console.log(`${statusIcon} ${action}: ${chalk.cyan(hash)}`);
    },

    // 錢包相關日誌
    wallet(action: string, address: string): void {
        console.log(chalk.magenta('👛'), action, chalk.cyan(address));
    },

    // 搶購計時日誌
    snipe(message: string): void {
        console.log(chalk.yellow('🎯'), message);
    },
};
