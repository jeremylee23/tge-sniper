/**
 * 精準計時器
 * 毫秒級觸發，支援 NTP 時間同步
 */
import { logger } from '../../utils/logger.js';

export interface TimerCallback {
    (): Promise<void> | void;
}

export class TimerTrigger {
    private scheduledTimer: NodeJS.Timeout | null = null;
    private timeOffset: number = 0; // 與伺服器時間的偏移量 (ms)

    /**
     * 同步時間 (使用 HTTP 頭)
     * 返回本地時間與伺服器時間的偏移量
     */
    async syncTime(): Promise<number> {
        // 多個時間源備用
        const timeServers = [
            'https://www.google.com',
            'https://www.cloudflare.com',
            'https://worldtimeapi.org/api/ip',
        ];

        for (const serverUrl of timeServers) {
            try {
                const startTime = Date.now();
                const response = await fetch(serverUrl, {
                    method: 'HEAD',
                    signal: AbortSignal.timeout(3000)
                });
                const endTime = Date.now();

                // 估算網路延遲
                const latency = (endTime - startTime) / 2;

                // 從響應頭取得伺服器時間
                const dateHeader = response.headers.get('date');
                if (dateHeader) {
                    const serverTime = new Date(dateHeader).getTime() + latency;
                    this.timeOffset = serverTime - Date.now();
                    logger.info(`時間同步完成，偏移量: ${this.timeOffset}ms`);
                    return this.timeOffset;
                }
            } catch {
                // 嘗試下一個伺服器
                continue;
            }
        }

        logger.warn('時間同步失敗，使用本地時間');
        return 0;
    }

    /**
     * 取得校正後的當前時間
     */
    getCalibratedTime(): Date {
        return new Date(Date.now() + this.timeOffset);
    }

    /**
     * 計算距離目標時間的毫秒數
     */
    getMillisecondsUntil(targetTime: Date): number {
        const calibratedNow = this.getCalibratedTime().getTime();
        return targetTime.getTime() - calibratedNow;
    }

    /**
     * 在指定時間觸發回調
     * @param targetTime 目標時間
     * @param callback 回調函數
     * @param earlyMs 提前觸發的毫秒數 (補償網路延遲)
     */
    scheduleAt(targetTime: Date, callback: TimerCallback, earlyMs: number = 100): void {
        this.cancel(); // 取消之前的排程

        const msUntilTarget = this.getMillisecondsUntil(targetTime) - earlyMs;

        if (msUntilTarget <= 0) {
            logger.warn('目標時間已過或即將到來，立即執行');
            void callback();
            return;
        }

        logger.snipe(`⏱️ 已排程，將在 ${(msUntilTarget / 1000).toFixed(2)} 秒後觸發`);

        // 倒數顯示
        this.startCountdown(msUntilTarget);

        this.scheduledTimer = setTimeout(() => {
            logger.snipe('🚀 觸發！');
            void callback();
        }, msUntilTarget);
    }

    /**
     * 倒數計時顯示
     */
    private startCountdown(msRemaining: number): void {
        const intervals = [60000, 30000, 10000, 5000, 3000, 2000, 1000];

        for (const interval of intervals) {
            if (msRemaining > interval) {
                setTimeout(() => {
                    const remaining = this.getMillisecondsUntil(new Date(Date.now() + this.timeOffset + interval));
                    if (remaining > 0) {
                        logger.snipe(`⏳ ${(remaining / 1000).toFixed(1)} 秒...`);
                    }
                }, msRemaining - interval);
            }
        }
    }

    /**
     * 取消排程
     */
    cancel(): void {
        if (this.scheduledTimer) {
            clearTimeout(this.scheduledTimer);
            this.scheduledTimer = null;
            logger.info('計時器已取消');
        }
    }

    /**
     * 精確等待
     */
    static async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
