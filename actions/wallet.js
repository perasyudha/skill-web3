import { ethers } from "ethers";
import { getWallet, getChainConfig, ERC20_ABI, formatUnits } from "./common.js";

// Ambil alamat wallet yang terhubung
export async function getAddress(chainInput) {
  try {
    const { wallet } = getWallet(chainInput || "ethereum");
    console.log(JSON.stringify({
      success: true,
      address: wallet.address
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
  }
}

// Periksa saldo native token atau token ERC-20
export async function getBalance(chainInput, tokenAddress) {
  try {
    const { wallet, provider, chainConfig } = getWallet(chainInput);
    
    if (!tokenAddress) {
      // Cek Saldo Native (ETH, MATIC, BNB, dll)
      const balance = await provider.getBalance(wallet.address);
      console.log(JSON.stringify({
        success: true,
        chain: chainConfig.name,
        address: wallet.address,
        balance: formatUnits(balance, 18),
        symbol: chainConfig.symbol
      }, null, 2));
    } else {
      // Cek Saldo ERC-20
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const [balance, decimals, symbol, name] = await Promise.all([
        tokenContract.balanceOf(wallet.address),
        tokenContract.decimals(),
        tokenContract.symbol(),
        tokenContract.name()
      ]);

      console.log(JSON.stringify({
        success: true,
        chain: chainConfig.name,
        address: wallet.address,
        tokenAddress: tokenAddress,
        tokenName: name,
        balance: formatUnits(balance, decimals),
        symbol: symbol
      }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
  }
}
