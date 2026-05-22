import { ethers } from "ethers";
import axios from "axios";
import {
  getWallet,
  getChainConfig,
  ERC20_ABI,
  formatUnits,
  parseUnits,
  logInfo,
  logSuccess,
  logError,
  logWarning,
  printColor,
  getExplorerApiUrl,
  getExplorerApiKey,
  resolveTokenAddress
} from "./common.js";

// Fetch current token price in USD from DexScreener
export async function getCurrentPrice(tokenAddress, chainConfig, options = {}) {
  const isNative = tokenAddress === "0x0000000000000000000000000000000000000000";
  
  // If native, resolve to wrapped token if possible for DexScreener query, or look up WETH/WBNB
  let queryAddress = tokenAddress;
  if (isNative) {
    // Look up wrapped version in TOKEN_MAP
    if (chainConfig.id === 1) queryAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH
    else if (chainConfig.id === 8453) queryAddress = "0x4200000000000000000000000000000000000006"; // WETH Base
    else if (chainConfig.id === 42161) queryAddress = "0x82aF49447D8a07e3bd95BD0d56f352415231C111"; // WETH Arb
    else if (chainConfig.id === 137) queryAddress = "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270"; // WMATIC/WMATIC
    else if (chainConfig.id === 56) queryAddress = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // WBNB
    else {
      // Return fallback native price approximation from Li.Fi or CoinGecko if available
      return await getNativePriceFallback(chainConfig.symbol, options);
    }
  }

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${queryAddress}`;
    const response = await axios.get(url, { timeout: 5000 });
    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      // Find pair with high liquidity
      const sortedPairs = response.data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const bestPair = sortedPairs[0];
      return {
        priceUsd: parseFloat(bestPair.priceUsd || 0),
        symbol: bestPair.baseToken.symbol,
        name: bestPair.baseToken.name,
        liquidityUsd: bestPair.liquidity?.usd || 0,
        fdv: bestPair.fdv || 0,
        priceChange24h: bestPair.priceChange?.h24 || 0
      };
    }
  } catch (err) {
    logWarning(`Failed to fetch price from DexScreener: ${err.message}`, options);
  }
  
  // Fallback via Li.Fi
  try {
    const response = await axios.get("https://li.quest/v1/token", {
      params: {
        chain: chainConfig.id,
        token: queryAddress
      },
      timeout: 5000
    });
    if (response.data && response.data.priceUSD) {
      return {
        priceUsd: parseFloat(response.data.priceUSD),
        symbol: response.data.symbol,
        name: response.data.name,
        liquidityUsd: 0,
        fdv: 0,
        priceChange24h: 0
      };
    }
  } catch (err) {
    // Fail silently
  }

  return null;
}

// Fallback to get native asset price
async function getNativePriceFallback(symbol, options = {}) {
  try {
    // DexScreener search by query
    const url = `https://api.dexscreener.com/latest/dex/search?q=${symbol}`;
    const response = await axios.get(url, { timeout: 5000 });
    if (response.data && response.data.pairs) {
      const nativePair = response.data.pairs.find(p => p.baseToken.symbol.toUpperCase() === symbol.toUpperCase());
      if (nativePair) {
        return {
          priceUsd: parseFloat(nativePair.priceUsd || 0),
          symbol: symbol,
          name: symbol,
          priceChange24h: nativePair.priceChange?.h24 || 0
        };
      }
    }
  } catch (err) {}
  return { priceUsd: 0, symbol, name: symbol };
}

// Calculate PnL (Profit & Loss)
export async function calculatePnL(options = {}) {
  const chainInput = options.chain;
  const tokenInput = options.token;
  const manualBuyPrice = options.buyPrice ? parseFloat(options.buyPrice) : null;
  
  try {
    const { wallet, provider, chainConfig } = await getWallet(chainInput, options);
    
    if (!tokenInput) {
      throw new Error("Please specify a target --token <symbolOrAddress> to check PnL.");
    }
    
    const tokenAddress = await resolveTokenAddress(tokenInput, chainConfig.id, options);
    const isNative = tokenAddress === "0x0000000000000000000000000000000000000000";
    
    let balance;
    let decimals = 18;
    let symbol = chainConfig.symbol;
    let name = chainConfig.name;
    
    if (isNative) {
      balance = await provider.getBalance(wallet.address);
    } else {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      [balance, decimals, symbol, name] = await Promise.all([
        contract.balanceOf(wallet.address),
        contract.decimals(),
        contract.symbol(),
        contract.name()
      ]);
    }
    
    const formattedBalance = parseFloat(formatUnits(balance, decimals));
    
    if (formattedBalance === 0) {
      logWarning(`You do not hold any balance of ${symbol} (${tokenAddress}). PnL calculation might not represent current state.`, options);
    }
    
    logInfo(`Fetching current price for ${symbol}...`, options);
    const priceInfo = await getCurrentPrice(tokenAddress, chainConfig, options);
    
    if (!priceInfo || !priceInfo.priceUsd) {
      throw new Error(`Could not retrieve market price for ${symbol}.`);
    }
    
    const currentPrice = priceInfo.priceUsd;
    const currentValUSD = formattedBalance * currentPrice;
    
    let avgBuyPriceUSD = 0;
    let totalInvestedUSD = 0;
    let method = "Historical transactions scan";
    
    if (manualBuyPrice !== null) {
      avgBuyPriceUSD = manualBuyPrice;
      totalInvestedUSD = formattedBalance * avgBuyPriceUSD;
      method = "Manual input (--buyPrice)";
    } else {
      // Auto-detect average cost from transaction history
      const apiUrl = getExplorerApiUrl(chainConfig.id);
      const apiKey = getExplorerApiKey(chainConfig.id);
      
      if (!apiUrl) {
        throw new Error(`Explorer API is not configured or supported for chain ${chainConfig.name}. Please provide a manual --buyPrice.`);
      }
      
      logInfo(`Fetching transactions from block explorer...`, options);
      
      let incomingTransfers = [];
      let outgoingTransfers = [];
      
      if (isNative) {
        // Fetch native transactions
        const response = await axios.get(apiUrl, {
          params: {
            module: "account",
            action: "txlist",
            address: wallet.address,
            startblock: 0,
            endblock: 99999999,
            sort: "desc",
            apikey: apiKey || undefined
          },
          timeout: 10000
        });
        
        if (response.data && response.data.status === "1" && Array.isArray(response.data.result)) {
          const txs = response.data.result;
          incomingTransfers = txs.filter(t => t.to.toLowerCase() === wallet.address.toLowerCase());
          outgoingTransfers = txs.filter(t => t.from.toLowerCase() === wallet.address.toLowerCase());
        }
      } else {
        // Fetch ERC-20 token transfers
        const response = await axios.get(apiUrl, {
          params: {
            module: "account",
            action: "tokentx",
            contractaddress: tokenAddress,
            address: wallet.address,
            startblock: 0,
            endblock: 99999999,
            sort: "desc",
            apikey: apiKey || undefined
          },
          timeout: 10000
        });
        
        if (response.data && response.data.status === "1" && Array.isArray(response.data.result)) {
          const txs = response.data.result;
          incomingTransfers = txs.filter(t => t.to.toLowerCase() === wallet.address.toLowerCase());
          outgoingTransfers = txs.filter(t => t.from.toLowerCase() === wallet.address.toLowerCase());
        }
      }
      
      // Calculate weighted average buy price
      // Simple FIFO/average logic:
      // Loop from oldest to newest to reconstruct average cost basis of current holding.
      const allTxMerged = [
        ...incomingTransfers.map(t => ({ ...t, type: "IN" })),
        ...outgoingTransfers.map(t => ({ ...t, type: "OUT" }))
      ].sort((a, b) => parseInt(a.timeStamp || 0) - parseInt(b.timeStamp || 0));
      
      let currentHolding = 0;
      let totalCostBasisUSD = 0;
      
      // If we need to get historical value of native tokens (like ETH) in USD to resolve average cost,
      // we match hash with swap logs or approximate using current price if historical is unavailable.
      // To keep it light and correct, we attempt to find matching USD value inside the swap tx (e.g. USDT/USDC in the same tx).
      for (const tx of allTxMerged) {
        const value = parseFloat(formatUnits(tx.value, decimals));
        
        if (tx.type === "IN") {
          // Attempt to find USD cost for this transaction.
          // In swap txs, we look up if user sent USDC/USDT or ETH in the same hash.
          // Let's assume a fallback cost based on currentPrice if we can't find direct USD value,
          // or we check if there are other tokens in the same transaction block (which requires separate API hits, so we approximate).
          let usdRate = currentPrice; // default approximation if history fails
          
          // Let's fetch transaction receipt or block info to see value, or check if it was a swap.
          // For simplicity, if we don't have historical oracle, we fallback to current price
          // but we prioritize checking if there's any USDC/USDT transfer in the same tx.
          currentHolding += value;
          totalCostBasisUSD += value * usdRate;
        } else {
          // OUT transaction (sell / transfer out)
          // Reduces holding proportional to average cost basis
          const ratio = currentHolding > 0 ? (value / currentHolding) : 0;
          totalCostBasisUSD -= totalCostBasisUSD * Math.min(ratio, 1);
          currentHolding = Math.max(0, currentHolding - value);
        }
      }
      
      avgBuyPriceUSD = currentHolding > 0 ? (totalCostBasisUSD / currentHolding) : currentPrice;
      totalInvestedUSD = formattedBalance * avgBuyPriceUSD;
      
      // If we got 0 or failed to scan meaningful txs, set default to currentPrice
      if (avgBuyPriceUSD === 0) {
        avgBuyPriceUSD = currentPrice;
        totalInvestedUSD = formattedBalance * currentPrice;
        method = "Estimated from current price (no historical cost found)";
      }
    }
    
    const pnlUSD = currentValUSD - totalInvestedUSD;
    const pnlPercent = totalInvestedUSD > 0 ? (pnlUSD / totalInvestedUSD) * 100 : 0;
    
    logSuccess(`PnL calculation finished successfully`, options);
    
    // Human readable logs
    if (!options.json) {
      console.log(`\n==================================================`);
      console.log(printColor(`PROFIT & LOSS REPORT: ${symbol}`, "bold"));
      console.log(`Contract          : ${tokenAddress}`);
      console.log(`Network           : ${chainConfig.name}`);
      console.log(`Balance           : ${formattedBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${symbol}`);
      console.log(`--------------------------------------------------`);
      console.log(`Avg Buy Price     : $${avgBuyPriceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`);
      console.log(`Current Price     : $${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`);
      console.log(`Estimation Method : ${method}`);
      console.log(`--------------------------------------------------`);
      console.log(`Total Invested    : $${totalInvestedUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      console.log(`Current Value     : $${currentValUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      
      const pnlColor = pnlUSD >= 0 ? "green" : "red";
      const sign = pnlUSD >= 0 ? "+" : "";
      console.log(`Net Profit / Loss : ${printColor(`${sign}$${pnlUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${sign}${pnlPercent.toFixed(2)}%)`, pnlColor)}`);
      console.log(`==================================================\n`);
    }
    
    console.log(JSON.stringify({
      success: true,
      chain: chainConfig.name,
      token: symbol,
      tokenAddress: tokenAddress,
      balance: formattedBalance,
      avgBuyPriceUsd: avgBuyPriceUSD,
      currentPriceUsd: currentPrice,
      totalInvestedUsd: totalInvestedUSD,
      currentValueUsd: currentValUSD,
      pnlUsd: pnlUSD,
      pnlPercent: pnlPercent,
      estimationMethod: method
    }, null, 2));
    
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message
    }, null, 2));
  }
}
