#!/usr/bin/env node

import "dotenv/config";

import { Command } from "commander";
import { getAddress, getBalance } from "./actions/wallet.js";
import { transfer } from "./actions/transfer.js";
import { swapOrBridge } from "./actions/swapBridge.js";
import { mintNft } from "./actions/mintNft.js";
import { executeCustomTx } from "./actions/customTx.js";

const program = new Command();

program
  .name("web3-ops")
  .description("CLI Utility for EVM Web3 operations as an OpenClaw Agent Skill")
  .version("1.0.0");

// 1. Get Wallet Address
program
  .command("address")
  .description("Dapatkan alamat wallet Anda")
  .option("-c, --chain <chain>", "Jaringan blockchain (misal: ethereum, arbitrum, base, dll.)", "ethereum")
  .action((options) => {
    getAddress(options.chain);
  });

// 2. Get Balance
program
  .command("balance")
  .description("Cek saldo native koin atau token ERC-20")
  .requiredOption("-c, --chain <chain>", "Jaringan blockchain (misal: arbitrum, base, dll.)")
  .option("-t, --token <tokenAddress>", "Alamat kontrak token ERC-20 (opsional, kosongkan untuk native koin)")
  .action((options) => {
    getBalance(options.chain, options.token);
  });

// 3. Transfer Koin/Token
program
  .command("transfer")
  .description("Kirim koin native atau token ERC-20 ke alamat lain")
  .requiredOption("-c, --chain <chain>", "Jaringan blockchain")
  .requiredOption("-to, --to <address>", "Alamat dompet penerima")
  .requiredOption("-a, --amount <amount>", "Jumlah koin/token yang akan dikirim (dalam unit normal, misal: 0.05)")
  .option("-t, --token <tokenAddress>", "Alamat kontrak token ERC-20 (opsional)")
  .action((options) => {
    transfer(options.chain, options.to, options.amount, options.token);
  });

// 4. Swap Token (Pada chain yang sama)
program
  .command("swap")
  .description("Lakukan swap token (misal: ETH ke USDC) di jaringan yang sama")
  .requiredOption("-c, --chain <chain>", "Jaringan blockchain")
  .requiredOption("-f, --fromToken <symbolOrAddress>", "Token asal (misal: ETH, USDC, atau alamat kontrak)")
  .requiredOption("-t, --toToken <symbolOrAddress>", "Token tujuan (misal: USDC, WETH, atau alamat kontrak)")
  .requiredOption("-a, --amount <amount>", "Jumlah token asal yang akan ditukar")
  .option("-m, --mode <mode>", "Mode pemilihan rute: 'auto' atau 'manual'", "auto")
  .option("-p, --provider <provider>", "Provider untuk manual swap: 'lifi', 'relay', 'uniswap', 'pancakeswap'", "lifi")
  .option("-s, --slippage <percent>", "Slippage toleransi dalam persen (contoh: 0.5)", "0.5")
  .action((options) => {
    swapOrBridge({
      chain: options.chain,
      fromToken: options.fromToken,
      toToken: options.toToken,
      amount: options.amount,
      mode: options.mode,
      provider: options.provider,
      slippage: options.slippage
    });
  });

// 5. Bridge Token (Lintas jaringan)
program
  .command("bridge")
  .description("Kirim dan swap token lintas jaringan blockchain (misal: ETH dari Arbitrum ke USDC di Base)")
  .requiredOption("-fc, --fromChain <chain>", "Jaringan sumber")
  .requiredOption("-tc, --toChain <chain>", "Jaringan tujuan")
  .requiredOption("-f, --fromToken <symbolOrAddress>", "Token asal")
  .requiredOption("-t, --toToken <symbolOrAddress>", "Token tujuan")
  .requiredOption("-a, --amount <amount>", "Jumlah token asal yang akan dikirim")
  .option("-m, --mode <mode>", "Mode: 'auto' atau 'manual'", "auto")
  .option("-p, --provider <provider>", "Provider untuk manual bridge: 'lifi', 'relay'", "lifi")
  .option("-s, --slippage <percent>", "Slippage toleransi dalam persen (contoh: 0.5)", "0.5")
  .action((options) => {
    swapOrBridge({
      fromChain: options.fromChain,
      toChain: options.toChain,
      fromToken: options.fromToken,
      toToken: options.toToken,
      amount: options.amount,
      mode: options.mode,
      provider: options.provider,
      slippage: options.slippage
    });
  });

// 6. Mint NFT
program
  .command("mint")
  .description("Mint/claim NFT di jaringan EVM")
  .requiredOption("-c, --chain <chain>", "Jaringan blockchain")
  .requiredOption("-ct, --contract <contractAddress>", "Alamat kontrak NFT")
  .option("-f, --function <functionSig>", "Signature fungsi mint (contoh: 'mint(uint256)' atau 'claim(address,uint256)')", "mint(uint256)")
  .option("-args, --args <jsonArray>", "Argumen fungsi dalam bentuk JSON array (contoh: '[1]' atau '[\"0x...\", 1]')", "[1]")
  .option("-v, --value <value>", "Jumlah native token yang dikirim (misal jika NFT berbayar, dalam ETH/MATIC)", "0")
  .action((options) => {
    mintNft(options);
  });

// 7. Custom Transaction (Raw Tx)
program
  .command("custom")
  .description("Kirim transaksi kustom dengan data mentah (hex calldata)")
  .requiredOption("-c, --chain <chain>", "Jaringan blockchain")
  .requiredOption("-to, --to <address>", "Alamat tujuan transaksi (kontrak atau dompet)")
  .option("-d, --data <hex>", "Calldata hex transaksi (dimulai dengan 0x)", "0x")
  .option("-v, --value <value>", "Jumlah native token yang dikirim (dalam unit normal, contoh: 0.001)", "0")
  .option("-g, --gasLimit <gas>", "Limit gas manual (opsional)")
  .action((options) => {
    executeCustomTx(options);
  });

program.parse(process.argv);
