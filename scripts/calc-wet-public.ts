import { PublicKey } from '@solana/web3.js';

// =========== WET Public Sale 新合約 ===========
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// 🆕 新 Presale Program ID!
const PRESALE_PROGRAM = new PublicKey('wtfdJKwQG9A4ayuouBEip6Hoi1DcsAAHVxeHmG5HG7E');

// Public 階段 Presale Account
const PUBLIC_PRESALE = new PublicKey('254E1AjUAbsvQcoV4pTybrey7soK1LM9SErKipLVgKXk');

// 預設錢包
const DEFAULT_WALLET = '3XhByuyUGqiQZUveZrm14p39MxqLJadmCDTcCHiwchoS';

async function main() {
    const walletArg = process.argv[2] || DEFAULT_WALLET;
    const USER_WALLET = new PublicKey(walletArg);

    console.log('═══════════════════════════════════════════════════════');
    console.log('          WET Public Sale - 帳戶計算器');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('📌 Presale Program:', PRESALE_PROGRAM.toBase58());
    console.log('📌 Presale Account:', PUBLIC_PRESALE.toBase58());
    console.log('👛 用戶錢包:', USER_WALLET.toBase58());

    // 1. 計算 USDC Token Account
    const [usdcTokenAccount] = PublicKey.findProgramAddressSync(
        [USER_WALLET.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log('\n📦 USDC Token Account:', usdcTokenAccount.toBase58());

    // 2. 計算 Escrow PDA (使用新 Program)
    const [escrow] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), PUBLIC_PRESALE.toBuffer(), USER_WALLET.toBuffer()],
        PRESALE_PROGRAM
    );
    console.log('🔐 Escrow:', escrow.toBase58());

    // 找 Quote Vault (presale 的 USDC 存放帳戶)
    const [quoteVault] = PublicKey.findProgramAddressSync(
        [USER_WALLET.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // 組裝完整的 買入 instruction JSON
    // 注意: data 欄位需要根據實際合約來調整，這裡假設與舊合約相同
    // 金額: 500 USDC = 500_000_000 (6 decimals)
    const amount500USDC = [0, 101, 205, 29, 0, 0, 0, 0]; // 500_000_000 in little-endian
    const amount100USDC = [0, 225, 245, 5, 0, 0, 0, 0];  // 100_000_000 in little-endian

    // Discriminator 可能不同，需要從實際交易中獲取
    // 假設買入指令的 discriminator 是 [242, 35, 198, 137, 82, 225, 242, 182]
    const buyDiscriminator = [242, 35, 198, 137, 82, 225, 242, 182];

    console.log('\n📋 完整搶購指令 (500 USDC):');
    console.log('─────────────────────────────────────────────────────────');

    const instruction = {
        programId: PRESALE_PROGRAM.toBase58(),
        keys: [
            { pubkey: PUBLIC_PRESALE.toBase58(), isSigner: false, isWritable: true },
            { pubkey: 'G1CGGeb3RyTdg4KwaFLSYSqMmvt6QEZadgCaxUoqtWRB', isSigner: false, isWritable: true }, // Quote Vault (需確認)
            { pubkey: USDC_MINT.toBase58(), isSigner: false, isWritable: true },
            { pubkey: escrow.toBase58(), isSigner: false, isWritable: true },
            { pubkey: usdcTokenAccount.toBase58(), isSigner: false, isWritable: true },
            { pubkey: USER_WALLET.toBase58(), isSigner: true, isWritable: true },
            { pubkey: TOKEN_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
            { pubkey: '4Xgt6XKZiowAGNdPWngVAwpYbSwAmbBnRBPtCFXhrypc', isSigner: false, isWritable: false }, // Merkle (需確認)
            { pubkey: PRESALE_PROGRAM.toBase58(), isSigner: false, isWritable: false },
        ],
        data: [...buyDiscriminator, ...amount500USDC, 0, 0, 0, 0] // 後面可能還有其他參數
    };

    console.log(JSON.stringify(instruction, null, 2));

    console.log('\n\n⚠️  重要提醒:');
    console.log('─────────────────────────────────────────────────────────');
    console.log('上述 instruction 是基於舊合約結構的推測。');
    console.log('新合約可能有不同的指令結構！');
    console.log('\n建議: 使用瀏覽器攔截腳本獲取正確的交易資料，');
    console.log('然後用 snipe 命令發送。');

    console.log('\n\n📝 搶購命令範本:');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`npm run cli -- snipe \\
  --chain solana \\
  --contract ${PRESALE_PROGRAM.toBase58()} \\
  --data '<把從瀏覽器攔截到的 JSON 貼這裡>' \\
  --wallets all \\
  --time "2025-12-08T15:30:00Z" \\
  --gas-priority high \\
  --early 100`);
}

main().catch(console.error);
