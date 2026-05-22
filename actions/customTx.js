import { ethers } from "ethers";
import { getWallet, parseUnits } from "./common.js";

export async function executeCustomTx(options) {
  try {
    const {
      chain,
      to,
      data = "0x",
      value = "0",
      gasLimit
    } = options;

    if (!ethers.isAddress(to)) {
      throw new Error(`Alamat tujuan "to" (${to}) tidak valid.`);
    }

    if (!data.startsWith("0x")) {
      throw new Error(`Data transaksi harus dalam format hex desimal (dimulai dengan "0x").`);
    }

    const { wallet, chainConfig } = getWallet(chain);
    const valueWei = parseUnits(value, 18);

    console.log(`\n==================================================`);
    console.log(`CUSTOM TRANSACTION EXECUTION`);
    console.log(`==================================================`);
    console.log(`Jaringan   : ${chainConfig.name}`);
    console.log(`Tujuan (To): ${to}`);
    console.log(`Value      : ${value} (${chainConfig.symbol})`);
    console.log(`Data (Hex) : ${data.substring(0, 66)}${data.length > 66 ? "..." : ""}`);
    console.log(`Wallet     : ${wallet.address}`);
    console.log(`==================================================\n`);

    const txRequest = {
      to: to,
      data: data,
      value: valueWei
    };

    if (gasLimit) {
      txRequest.gasLimit = BigInt(gasLimit);
    }

    console.log("Mengirim transaksi kustom...");
    const txResponse = await wallet.sendTransaction(txRequest);

    console.log(`Transaksi terkirim. Tx Hash: ${txResponse.hash}`);
    console.log("Menunggu konfirmasi blok...");
    
    const receipt = await txResponse.wait(1);

    console.log(JSON.stringify({
      success: true,
      action: "custom_tx",
      chain: chainConfig.name,
      txHash: receipt.hash,
      explorer: `${chainConfig.explorer}/tx/${receipt.hash}`
    }, null, 2));

  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
  }
}
