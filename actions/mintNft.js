import { ethers } from "ethers";
import {
  getWallet,
  parseUnits,
  logInfo,
  logSuccess,
  logError,
  logWarning,
  printColor
} from "./common.js";

export async function mintNft(options = {}) {
  try {
    const {
      chain,
      contract: contractAddress,
      function: functionSig = "mint(uint256)",
      args: rawArgs = "[1]",
      value = "0",
      simulate
    } = options;

    if (!ethers.isAddress(contractAddress)) {
      throw new Error(`NFT contract address "${contractAddress}" is not a valid EVM address.`);
    }

    const { wallet, chainConfig } = getWallet(chain, options);
    
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

    if (!options.json) {
      console.log(`\n==================================================`);
      console.log(printColor("NFT MINTING REQUEST", "bold"));
      console.log(`==================================================`);
      console.log(`Network    : ${chainConfig.name}`);
      console.log(`Contract   : ${contractAddress}`);
      console.log(`Function   : ${functionSig}`);
      console.log(`Arguments  : ${JSON.stringify(parsedArgs)}`);
      console.log(`Value (${chainConfig.symbol}): ${value}`);
      console.log(`Wallet     : ${wallet.address}`);
      if (simulate) {
        console.log(`Simulation : ${printColor("TRUE (DRY-RUN)", "yellow")}`);
      }
      console.log(`==================================================\n`);
    }

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
      throw new Error(`Failed to parse function name from signature "${functionSig}". correct format example: "mint(uint256)"`);
    }
    const functionName = match[1];

    if (simulate) {
      logInfo(`Simulating NFT mint calling "${functionName}" (dry run)...`, options);
      const estimatedGas = await contract[functionName].estimateGas(...parsedArgs, {
        value: valueWei
      });
      logSuccess("NFT mint simulation succeeded.", options);
      console.log(JSON.stringify({
        success: true,
        simulated: true,
        action: "nft_mint",
        chain: chainConfig.name,
        contract: contractAddress,
        estimatedGas: estimatedGas.toString()
      }, null, 2));
      return;
    }

    logInfo(`Calling function "${functionName}" on NFT contract...`, options);

    const txResponse = await contract[functionName](...parsedArgs, {
      value: valueWei
    });

    logInfo(`Mint transaction submitted. Tx Hash: ${txResponse.hash}`, options);
    logInfo("Waiting for block confirmation...", options);
    
    const receipt = await txResponse.wait(1);
    logSuccess("Transaction confirmed successfully.", options);

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
