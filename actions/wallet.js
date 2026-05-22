import { ethers } from "ethers";
import axios from "axios";
import {
  getWallet,
  getChainConfig,
  ERC20_ABI,
  formatUnits,
  logInfo,
  logSuccess,
  logError,
  logWarning,
  printColor,
  getExplorerApiUrl,
  getExplorerApiKey,
  TOKEN_MAP,
  resolveTokenAddress
} from "./common.js";

// Get configured wallet address
export async function getAddress(options = {}) {
  try {
    const chainInput = options.chain || "ethereum";
    const { wallet } = await getWallet(chainInput, options);
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

// Check native or ERC-20 token balance
export async function getBalance(options = {}) {
  const chainInput = options.chain;
  const tokenInput = options.token;
  
  try {
    const { wallet, provider, chainConfig } = await getWallet(chainInput, options);
    
    if (!tokenInput) {
      // Check Native Balance
      const balance = await provider.getBalance(wallet.address);
      logSuccess(`Native balance checked successfully`, options);
      
      console.log(JSON.stringify({
        success: true,
        chain: chainConfig.name,
        address: wallet.address,
        balance: formatUnits(balance, 18),
        symbol: chainConfig.symbol,
        tokenAddress: "0x0000000000000000000000000000000000000000"
      }, null, 2));
    } else {
      // Resolve Token Address dynamically
      const tokenAddress = await resolveTokenAddress(tokenInput, chainConfig.id, options);
      
      if (tokenAddress === "0x0000000000000000000000000000000000000000") {
        // Native balance resolved
        const balance = await provider.getBalance(wallet.address);
        console.log(JSON.stringify({
          success: true,
          chain: chainConfig.name,
          address: wallet.address,
          balance: formatUnits(balance, 18),
          symbol: chainConfig.symbol,
          tokenAddress: "0x0000000000000000000000000000000000000000"
        }, null, 2));
        return;
      }
      
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const [balance, decimals, symbol, name] = await Promise.all([
        tokenContract.balanceOf(wallet.address),
        tokenContract.decimals(),
        tokenContract.symbol(),
        tokenContract.name()
      ]);

      logSuccess(`Token balance checked successfully`, options);
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

// Reusable helper to scan portfolio for a single chain
async function scanChainPortfolio(chainInput, options = {}) {
  const { wallet, provider, chainConfig } = await getWallet(chainInput, options);
  
  // 1. Fetch native token balance
  const nativeBalancePromise = provider.getBalance(wallet.address).then(bal => ({
    symbol: chainConfig.symbol,
    decimals: 18,
    balance: bal,
    tokenAddress: "0x0000000000000000000000000000000000000000",
    isNative: true
  }));
  
  // 2. Discover token addresses using Block Explorer API
  const tokenAddresses = new Set();
  const apiUrl = getExplorerApiUrl(chainConfig.id);
  
  if (apiUrl) {
    const apiKey = getExplorerApiKey(chainConfig.id);
    try {
      const response = await axios.get(apiUrl, {
        params: {
          module: "account",
          action: "tokentx",
          address: wallet.address,
          sort: "desc",
          offset: 100, // scan last 100 events
          apikey: apiKey || undefined
        },
        timeout: 8000
      });
      
      if (response.data && Array.isArray(response.data.result)) {
        for (const tx of response.data.result) {
          if (tx.contractAddress && ethers.isAddress(tx.contractAddress)) {
            tokenAddresses.add(ethers.getAddress(tx.contractAddress.toLowerCase()));
          }
        }
      }
    } catch (err) {
      // Fail silently for explorer API issues during multi-scan
    }
  }
  
  // Merge popular token list for this chain from default map
  const chainTokens = TOKEN_MAP[chainConfig.id] || {};
  for (const key of Object.keys(chainTokens)) {
    const addr = chainTokens[key];
    if (addr && addr !== "0x0000000000000000000000000000000000000000") {
      tokenAddresses.add(ethers.getAddress(addr.toLowerCase()));
    }
  }
  
  // 3. Query all balances in parallel
  const addressesArray = Array.from(tokenAddresses);
  
  const balancePromises = addressesArray.map(async (address) => {
    try {
      const contract = new ethers.Contract(address, ERC20_ABI, provider);
      const [bal, decimals, symbol] = await Promise.all([
        contract.balanceOf(wallet.address),
        contract.decimals(),
        contract.symbol()
      ]);
      return {
        symbol: symbol,
        decimals: Number(decimals),
        balance: bal,
        tokenAddress: address,
        isNative: false
      };
    } catch (err) {
      // Silently skip failed queries
      return null;
    }
  });
  
  const allResults = await Promise.all([nativeBalancePromise, ...balancePromises]);
  
  const activeTokens = allResults
    .filter(item => item !== null && item.balance > 0n)
    .map(item => ({
      symbol: item.symbol,
      balance: formatUnits(item.balance, item.decimals),
      tokenAddress: item.tokenAddress,
      isNative: item.isNative
    }));

  return {
    chainName: chainConfig.name,
    address: wallet.address,
    portfolio: activeTokens
  };
}

// Scan portfolio for active balances (single or all chains)
export async function getPortfolio(options = {}) {
  const chainInput = options.chain || "all";
  const normalizedChain = chainInput.toLowerCase().trim();
  
  try {
    if (normalizedChain === "all" || normalizedChain === "multi") {
      const chainsToScan = ["ethereum", "arbitrum", "base", "optimism", "polygon", "bsc", "avalanche", "linea", "scroll", "zksync"];
      logInfo(`Scanning portfolio across all chains (${chainsToScan.join(", ")}) for configured wallet...`, options);
      
      const scanPromises = chainsToScan.map(async (chainKey) => {
        try {
          const res = await scanChainPortfolio(chainKey, { ...options, rpcTimeout: 3500 });
          return {
            chain: chainKey,
            chainName: res.chainName,
            address: res.address,
            portfolio: res.portfolio
          };
        } catch (err) {
          return {
            chain: chainKey,
            error: err.message
          };
        }
      });
      
      const results = await Promise.all(scanPromises);
      
      // Output results
      if (!options.json) {
        console.log(`\n==================================================`);
        console.log(printColor("MULTICHAIN PORTFOLIO SUMMARY", "bold"));
        const firstSuccess = results.find(r => r.portfolio && r.address);
        const walletAddress = firstSuccess ? firstSuccess.address : "0x...";
        console.log(`Address: ${walletAddress}`);
        console.log(`==================================================`);
        
        for (const res of results) {
          const name = res.chainName || res.chain.toUpperCase();
          console.log(`\n[ ${printColor(name, "cyan")} ]`);
          if (res.error) {
            console.log(printColor(`  Error scanning chain: ${res.error}`, "red"));
          } else if (!res.portfolio || res.portfolio.length === 0) {
            console.log(`  No active token balances found.`);
          } else {
            for (const token of res.portfolio) {
              const symStr = printColor(token.symbol.padEnd(8), "cyan");
              const balStr = printColor(Number(token.balance).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 }).padStart(12), "green");
              const caStr = token.isNative ? "" : printColor(` (CA: ${token.tokenAddress})`, "gray");
              console.log(`  ${symStr}: ${balStr}${caStr}`);
            }
          }
        }
        console.log(`\n==================================================\n`);
      }
      
      console.log(JSON.stringify({
        success: true,
        portfolio: results.reduce((acc, curr) => {
          if (!curr.error) {
            acc[curr.chainName] = curr.portfolio;
          } else {
            acc[curr.chain] = { error: curr.error };
          }
          return acc;
        }, {})
      }, null, 2));
      
    } else {
      // Single chain scan
      const res = await scanChainPortfolio(chainInput, options);
      
      if (!options.json) {
        console.log(`\n==================================================`);
        console.log(printColor(`PORTFOLIO SUMMARY: ${res.chainName}`, "bold"));
        console.log(`Address: ${res.address}`);
        console.log(`==================================================`);
        if (res.portfolio.length === 0) {
          console.log(`No active token balances found (all balances are 0).`);
        } else {
          for (const token of res.portfolio) {
            const symStr = printColor(token.symbol.padEnd(8), "cyan");
            const balStr = printColor(Number(token.balance).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 6 }).padStart(12), "green");
            const caStr = token.isNative ? "" : printColor(` (CA: ${token.tokenAddress})`, "gray");
            console.log(`${symStr}: ${balStr}${caStr}`);
          }
        }
        console.log(`==================================================\n`);
      }
      
      console.log(JSON.stringify({
        success: true,
        chain: res.chainName,
        address: res.address,
        portfolio: res.portfolio
      }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
  }
}
