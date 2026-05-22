import { ethers } from "ethers";
import { getWallet, ERC20_ABI, parseUnits, formatUnits } from "./common.js";

export async function transfer(chainInput, toAddress, amountInput, tokenAddress) {
  try {
    const { wallet, provider, chainConfig } = getWallet(chainInput);
    
    if (!ethers.isAddress(toAddress)) {
      throw new Error(`Alamat penerima "${toAddress}" tidak valid.`);
    }

    let txResponse;
    let decimals = 18;
    let symbol = chainConfig.symbol;

    if (!tokenAddress) {
      // Transfer Native Token (ETH, MATIC, BNB, etc.)
      const amountWei = parseUnits(amountInput, 18);
      
      console.log(`Mengirim ${amountInput} ${symbol} ke ${toAddress} di ${chainConfig.name}...`);
      
      txResponse = await wallet.sendTransaction({
        to: toAddress,
        value: amountWei
      });
    } else {
      // Transfer ERC-20 Token
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      [decimals, symbol] = await Promise.all([
        tokenContract.decimals(),
        tokenContract.symbol()
      ]);

      const amountUnits = parseUnits(amountInput, decimals);
      
      console.log(`Mengirim ${amountInput} ${symbol} ke ${toAddress} di ${chainConfig.name}...`);
      
      txResponse = await tokenContract.transfer(toAddress, amountUnits);
    }

    console.log(`Transaksi dikirim. Tx Hash: ${txResponse.hash}`);
    console.log("Menunggu konfirmasi blok...");
    
    const receipt = await txResponse.wait(1);
    
    console.log(JSON.stringify({
      success: true,
      chain: chainConfig.name,
      txHash: receipt.hash,
      from: receipt.from,
      to: toAddress,
      amount: amountInput,
      symbol: symbol,
      explorer: `${chainConfig.explorer}/tx/${receipt.hash}`
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
  }
}
