#!/usr/bin/env npx tsx
/**
 * WET Public Sale 自動監控 + 搶購腳本
 * 監控 API 狀態，一旦開售立即執行搶購
 * 支援聲音警報！
 */

import { spawn, exec } from 'child_process';

// ==================== 通知設定 ====================
// 啟動後會播放系統音效 + 語音提醒
async function playAlarm(message: string): Promise<void> {
    // 1. 播放系統音效 (連續 5 次)
    for (let i = 0; i < 5; i++) {
        exec('afplay /System/Library/Sounds/Glass.aiff');
        await sleep(300);
    }

    // 2. 語音播報 (國語 - 美佳)
    exec(`say -v Meijia "${message}"`);

    // 3. 系統通知
    exec(`osascript -e 'display notification "${message}" with title "🚨 WET 搶購警報" sound name "Ping"'`);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const API_URL = 'https://dtf-api.unknownlabs.io/launch/wet/live';
const CHECK_INTERVAL = 2000; // 每 2 秒檢查一次

// 搶購指令 (10 USDC)
const SNIPE_COMMAND = `npm run cli -- snipe \
  --chain solana \
  --contract wtfdJKwQG9A4ayuouBEip6Hoi1DcsAAHVxeHmG5HG7E \
  --data '{"programId":"wtfdJKwQG9A4ayuouBEip6Hoi1DcsAAHVxeHmG5HG7E","keys":[{"pubkey":"254E1AjUAbsvQcoV4pTybrey7soK1LM9SErKipLVgKXk","isSigner":false,"isWritable":true},{"pubkey":"G1CGGeb3RyTdg4KwaFLSYSqMmvt6QEZadgCaxUoqtWRB","isSigner":false,"isWritable":true},{"pubkey":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","isSigner":false,"isWritable":true},{"pubkey":"7Y1xFU1PSxnEcsXGYyLEZKx82R8LwLAxsyYg88v7nDLQ","isSigner":false,"isWritable":true},{"pubkey":"HqdDfnrEw8tdfnZUyDe3zHSJNWyMGBHpSqfXqbsRu6Hn","isSigner":false,"isWritable":true},{"pubkey":"3XhByuyUGqiQZUveZrm14p39MxqLJadmCDTcCHiwchoS","isSigner":true,"isWritable":true},{"pubkey":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","isSigner":false,"isWritable":false},{"pubkey":"4Xgt6XKZiowAGNdPWngVAwpYbSwAmbBnRBPtCFXhrypc","isSigner":false,"isWritable":false},{"pubkey":"wtfdJKwQG9A4ayuouBEip6Hoi1DcsAAHVxeHmG5HG7E","isSigner":false,"isWritable":false}],"data":[242,35,198,137,82,225,242,182,128,150,152,0,0,0,0,0,0,0,0,0]}' \
  --wallets all \
  --time +0 \
  --gas-priority high`;

interface Phase {
    displayName: string;
    startsAt: string;
    amountRaised: string;
    participantsCount: number;
    isFinished: boolean;
}

interface APIResponse {
    success: boolean;
    data: {
        phases: Phase[];
    };
}

let lastStartsAt = '';
let sniped = false;

async function checkStatus(): Promise<void> {
    try {
        const response = await fetch(API_URL);
        const json: APIResponse = await response.json();

        if (!json.success) {
            console.log('❌ API 錯誤');
            return;
        }

        const publicPhase = json.data.phases.find(p => p.displayName === 'Public');
        if (!publicPhase) {
            console.log('❌ 找不到 Public 階段');
            return;
        }

        const startsAt = new Date(publicPhase.startsAt);
        const now = new Date();
        const diff = startsAt.getTime() - now.getTime();
        const diffSeconds = Math.floor(diff / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const remainingSeconds = diffSeconds % 60;

        // 檢查時間是否又改變
        if (lastStartsAt && lastStartsAt !== publicPhase.startsAt) {
            console.log('\n⚠️  開售時間已變更！');
            console.log(`   舊: ${lastStartsAt}`);
            console.log(`   新: ${publicPhase.startsAt}`);
            // 🔔 時間變更警報！
            await playAlarm('注意！開售時間已經變更！請立即檢查！');
        }
        lastStartsAt = publicPhase.startsAt;

        // 顯示狀態
        const timestamp = now.toLocaleTimeString('zh-TW', { hour12: false });
        console.log(`[${timestamp}] 🔍 Public: 參與 ${publicPhase.participantsCount} 人, 募集 $${publicPhase.amountRaised}, 開售 ${diffMinutes}:${remainingSeconds.toString().padStart(2, '0')} 後`);

        // 判斷是否開始
        const hasStarted = diff <= 0 || parseInt(publicPhase.amountRaised) > 0;

        if (hasStarted && !sniped) {
            // 🔔🔔🔔 開售警報！
            await playAlarm('開售了！開售了！趕快搶購！');
            console.log('\n🚀🚀🚀 開售了！立即搶購！🚀🚀🚀\n');
            sniped = true;

            // 使用 spawn 執行搶購（互動模式，讓用戶輸入密碼）
            console.log('執行指令...\n');
            const child = spawn('npm', [
                'run', 'cli', '--', 'snipe',
                '--chain', 'solana',
                '--contract', 'wtfdJKwQG9A4ayuouBEip6Hoi1DcsAAHVxeHmG5HG7E',
                '--data', '{"programId":"wtfdJKwQG9A4ayuouBEip6Hoi1DcsAAHVxeHmG5HG7E","keys":[{"pubkey":"254E1AjUAbsvQcoV4pTybrey7soK1LM9SErKipLVgKXk","isSigner":false,"isWritable":true},{"pubkey":"G1CGGeb3RyTdg4KwaFLSYSqMmvt6QEZadgCaxUoqtWRB","isSigner":false,"isWritable":true},{"pubkey":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","isSigner":false,"isWritable":true},{"pubkey":"7Y1xFU1PSxnEcsXGYyLEZKx82R8LwLAxsyYg88v7nDLQ","isSigner":false,"isWritable":true},{"pubkey":"HqdDfnrEw8tdfnZUyDe3zHSJNWyMGBHpSqfXqbsRu6Hn","isSigner":false,"isWritable":true},{"pubkey":"3XhByuyUGqiQZUveZrm14p39MxqLJadmCDTcCHiwchoS","isSigner":true,"isWritable":true},{"pubkey":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","isSigner":false,"isWritable":false},{"pubkey":"4Xgt6XKZiowAGNdPWngVAwpYbSwAmbBnRBPtCFXhrypc","isSigner":false,"isWritable":false},{"pubkey":"wtfdJKwQG9A4ayuouBEip6Hoi1DcsAAHVxeHmG5HG7E","isSigner":false,"isWritable":false}],"data":[242,35,198,137,82,225,242,182,128,150,152,0,0,0,0,0,0,0,0,0]}',
                '--wallets', 'all',
                '--time', '+0',
                '--gas-priority', 'high'
            ], {
                cwd: '/Users/jeremylee/workspace/science',
                stdio: 'inherit' // 讓用戶可以看到輸出和輸入密碼
            });

            child.on('close', (code) => {
                console.log(`\n✅ 搶購指令完成，退出碼: ${code}`);
                process.exit(code || 0);
            });
        }

    } catch (error) {
        console.error('❌ 檢查失敗:', error);
    }
}

async function main(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════');
    console.log('         WET Public Sale 自動監控 + 搶購');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 每 2 秒檢查一次 API');
    console.log('🎯 偵測到開售後自動執行搶購');
    console.log('💰 購買金額: 10 USDC');
    console.log('═══════════════════════════════════════════════════════\n');

    // 立即檢查一次
    await checkStatus();

    // 定期檢查
    setInterval(checkStatus, CHECK_INTERVAL);
}

main().catch(console.error);
