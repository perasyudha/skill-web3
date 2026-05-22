import { ethers } from "ethers";
import { getWallet, parseUnits } from "./common.js";

export async function mintNft(options) {
  try {
    const {
      chain,
      contract: contractAddress,
      function: functionSig = "mint(uint256)",
      args: rawArgs = "[1]",
      value = "0"
    } = options;

    if (!ethers.isAddress(contractAddress)) {
      throw new Error(`Alamat kontrak NFT "${contractAddress}" tidak valid.`);
    }

    const { wallet, chainConfig } = getWallet(chain);
    
    // Parse arguments
    let parsedArgs = [];
    try {
      parsedArgs = JSON.parse(rawArgs);
      if (!Array.isArray(parsedArgs)) {
        parsedArgs = [parsedArgs];
      }
    } catch (e) {
      // If it's not valid JSON, treat it as a single string/number argument or comma-separated list
      if (rawArgs.includes(",")) {
        parsedArgs = rawArgs.split(",").map(item => item.trim());
      } else {
        parsedArgs = [rawArgs];
      }
    }

    const valueWei = parseUnits(value, 18);

    console.log(`\n==================================================`);
    console.log(`NFT MINTING REQUEST`);
    console.log(`==================================================`);
    console.log(`Jaringan   : ${chainConfig.name}`);
    console.log(`Kontrak    : ${contractAddress}`);
    console.log(`Fungsi     : ${functionSig}`);
    console.log(`Argumen    : ${JSON.stringify(parsedArgs)}`);
    console.log(`Value (ETH): ${value} (${chainConfig.symbol})`);
    console.log(`Wallet     : ${wallet.address}`);
    console.log(`==================================================\n`);

    // Dynamic ABI creation based on function signature
    // Example: "mint(uint256)" -> "function mint(uint256) payable"
    let cleanSig = functionSig.trim();
    if (!cleanSig.startsWith("function ")) {
      cleanSig = `function ${cleanSig}`;
    }
    if (!cleanSig.includes("payable")) {
      cleanSig = `${cleanSig} payable`;
    }

    const abi = [cleanSig];
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    
    // Find the function name from signature to invoke it
    // Example: "function mint(uint256) payable" -> "mint"
    const match = functionSig.match(/([a-zA-Z0-9_]+)\s*\(/);
    if (!match) {
      throw new Error(`Gagal mengurai nama fungsi dari signature "${functionSig}". Contoh format yang benar: "mint(uint256)"`);
    }
    const functionName = match[1];

    console.log(`Memanggil fungsi "${functionName}" pada kontrak NFT...`);

    const txResponse = await contract[functionName](...parsedArgs, {
      value: valueWei
    });

    console.log(`Transaksi minting dikirim. Tx Hash: ${txResponse.hash}`);
    console.log("Menunggu konfirmasi blok...");
    
    const receipt = await txResponse.wait(1);

    console.log(JSON.stringify({
      success: true,
      action: "nft_mint",
      chain: chainConfig.name,
      contract: contractAddress,
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
