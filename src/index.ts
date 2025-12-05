#!/usr/bin/env node
/**
 * TGE Sniper - Multi-Chain Wallet Manager
 * 多鏈 TGE 搶購工具
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { config } from 'dotenv';
import { walletCommand, balanceCommand, snipeCommand } from './cli/commands/index.js';

// 載入環境變數
config();

const program = new Command();

program
    .name('tge')
    .description(chalk.cyan('🎯 TGE Sniper - 多鏈 ICO/TGE 搶購工具'))
    .version('1.0.0');

// 註冊命令
program.addCommand(walletCommand);
program.addCommand(balanceCommand);
program.addCommand(snipeCommand);

// 顯示 banner
console.log(chalk.cyan(`
╔════════════════════════════════════════╗
║     🎯 TGE Sniper v1.0.0              ║
║     Multi-Chain ICO/TGE Tool          ║
╚════════════════════════════════════════╝
`));

// 解析命令
program.parse();
