/**
 * 加密工具模組
 * 使用 AES-256-GCM 加密私鑰
 */
import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

// 加密參數
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const SCRYPT_N = 16384; // CPU/memory cost
const SCRYPT_R = 8;     // Block size
const SCRYPT_P = 1;     // Parallelization

export interface EncryptedData {
    /** 加密後的資料 (hex) */
    ciphertext: string;
    /** 初始向量 (hex) */
    iv: string;
    /** 鹽值 (hex) */
    salt: string;
    /** 認證標籤 (hex) */
    tag: string;
}

/**
 * 從密碼派生加密金鑰
 */
async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
        });
    });
}

/**
 * 加密資料
 * @param plaintext 明文
 * @param password 密碼
 * @returns 加密後的資料
 */
export async function encrypt(plaintext: string, password: string): Promise<EncryptedData> {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = await deriveKey(password, salt);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
        ciphertext,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        tag: tag.toString('hex'),
    };
}

/**
 * 解密資料
 * @param encryptedData 加密後的資料
 * @param password 密碼
 * @returns 明文
 */
export async function decrypt(encryptedData: EncryptedData, password: string): Promise<string> {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');
    const key = await deriveKey(password, salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let plaintext = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
}

/**
 * 序列化加密資料為字串 (便於儲存)
 */
export function serializeEncrypted(data: EncryptedData): string {
    return JSON.stringify(data);
}

/**
 * 反序列化加密資料
 */
export function deserializeEncrypted(serialized: string): EncryptedData {
    return JSON.parse(serialized) as EncryptedData;
}

/**
 * 產生隨機 ID
 */
export function generateId(): string {
    return randomBytes(16).toString('hex');
}
