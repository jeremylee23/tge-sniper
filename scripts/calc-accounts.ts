import { PublicKey } from '@solana/web3.js';

// 常量
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const PRESALE_PROGRAM = new PublicKey('presSVxnf9UU8jMxhgSMqaRwNiT36qeBdNeTRKjTdbj');

// 預設值 (WET 項目)
const DEFAULT_PRESALE = '8DcLpDaStJ35nkG789TqR2eExZRR9VbbJzZKwLHdo14T';
const DEFAULT_WALLET = '3XhByuyUGqiQZUveZrm14p39MxqLJadmCDTcCHiwchoS';

async function main() {
    // 從命令列參數讀取，或使用預設值
    const presaleArg = process.argv[2] || DEFAULT_PRESALE;
    const walletArg = process.argv[3] || DEFAULT_WALLET;

    const PRESALE = new PublicKey(presaleArg);
    const USER_WALLET = new PublicKey(walletArg);

    console.log('🔑 計算用戶帳戶地址...\n');
    console.log('Presale:', PRESALE.toBase58());
    console.log('用戶錢包:', USER_WALLET.toBase58());

    // 1. 計算 USDC Token Account (Associated Token Account)
    const [usdcTokenAccount] = PublicKey.findProgramAddressSync(
        [USER_WALLET.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC_MINT.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    console.log('\n📦 USDC Token Account:', usdcTokenAccount.toBase58());

    // 2. 計算 Escrow PDA
    const [escrow] = PublicKey.findProgramAddressSync(
        [Buffer.from('escrow'), PRESALE.toBuffer(), USER_WALLET.toBuffer()],
        PRESALE_PROGRAM
    );
    console.log('🔐 Escrow:', escrow.toBase58());

    // 輸出完整的 JSON
    console.log('\n📋 完整的 keys JSON:\n');
    const keys = [
        { pubkey: PRESALE.toBase58(), isSigner: false, isWritable: true },
        { pubkey: 'G1CGGeb3RyTdg4KwaFLSYSqMmvt6QEZadgCaxUoqtWRB', isSigner: false, isWritable: true },
        { pubkey: USDC_MINT.toBase58(), isSigner: false, isWritable: true },
        { pubkey: escrow.toBase58(), isSigner: false, isWritable: true },
        { pubkey: usdcTokenAccount.toBase58(), isSigner: false, isWritable: true },
        { pubkey: USER_WALLET.toBase58(), isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
        { pubkey: '4Xgt6XKZiowAGNdPWngVAwpYbSwAmbBnRBPtCFXhrypc', isSigner: false, isWritable: false },
        { pubkey: PRESALE_PROGRAM.toBase58(), isSigner: false, isWritable: false },
    ];

    console.log(JSON.stringify(keys, null, 2));
}

main().catch(console.error);

