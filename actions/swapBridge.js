import { ethers } from "ethers";
import axios from "axios";
import { getWallet, ERC20_ABI, parseUnits, formatUnits, getChainConfig } from "./common.js";

// Common token addresses mapped by Chain ID
const TOKEN_MAP = {
  // Ethereum Mainnet (1)
  1: {
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  },
  // Arbitrum One (42161)
  42161: {
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x82aF49447D8a07e3bd95BD0d56f352415231Cl11",
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // native USDC
    "USDC.E": "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // bridged USDC
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"
  },
  // Base (8453)
  8453: {
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDT: "0xf55BEC9cbd4732f1F4143f647652e924540d9d64"
  },
  // OP Mainnet (10)
  10: {
    ETH: "0x0000000000000000000000000000000000000000",
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    USDT: "0x94b008aA00579c1307b0EF2c499aD98a8ce58e58"
  },
  // Polygon PoS (137)
  137: {
    MATIC: "0x0000000000000000000000000000000000000000",
    POL: "0x0000000000000000000000000000000000000000",
    USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
  },
  // BNB Smart Chain (56)
  56: {
    BNB: "0x0000000000000000000000000000000000000000",
    WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32CD580d",
    USDT: "0x55d398326f99059fF775485246999027B3197955"
  }
};

// Resolve token symbol or return hex address as-is
function resolveToken(tokenSymbolOrAddress, chainId) {
  if (ethers.isAddress(tokenSymbolOrAddress)) {
    return tokenSymbolOrAddress;
  }
  
  const symbolUpper = tokenSymbolOrAddress.toUpperCase().trim();
  
  // Specific check for native tokens (representing address 0 or a special constant depending on API)
  if (["ETH", "MATIC", "POL", "BNB", "AVAX", "NATIVE"].includes(symbolUpper)) {
    return "0x0000000000000000000000000000000000000000";
  }

  const chainTokens = TOKEN_MAP[chainId];
  if (chainTokens && chainTokens[symbolUpper]) {
    return chainTokens[symbolUpper];
  }

  throw new Error(`Token "${tokenSymbolOrAddress}" pada Chain ID ${chainId} tidak ditemukan di daftar pemetaan default. Silakan masukkan alamat kontrak token (0x...) secara langsung.`);
}

// Helper to approve tokens if allowance is insufficient
async function ensureAllowance(wallet, tokenAddress, spenderAddress, amountWei) {
  if (tokenAddress === "0x0000000000000000000000000000000000000000" || tokenAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
    return; // Native tokens don't need approvals
  }

  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const allowance = await tokenContract.allowance(wallet.address, spenderAddress);
  
  if (allowance < amountWei) {
    console.log(`Mengajukan transaksi persetujuan (Approve) untuk spender ${spenderAddress}...`);
    // Approve maximum allowance or specific amount
    const tx = await tokenContract.approve(spenderAddress, ethers.MaxUint256);
    console.log(`Transaksi approve dikirim: ${tx.hash}. Menunggu konfirmasi...`);
    await tx.wait(1);
    console.log("Persetujuan sukses.");
  }
}

// ---------------------------------------------------------
// 1. LI.FI SWAP & BRIDGE (MODE AUTO)
// ---------------------------------------------------------
async function runLifiQuote(wallet, fromChainId, toChainId, fromToken, toToken, amountWei, slippage) {
  console.log("Menghubungi Li.Fi API untuk mendapatkan quote terbaik...");
  
  const params = {
    fromChain: fromChainId,
    toChain: toChainId,
    fromToken: fromToken,
    toToken: toToken,
    fromAmount: amountWei.toString(),
    fromAddress: wallet.address,
    slippage: slippage || 0.005 // Default 0.5%
  };

  const response = await axios.get("https://li.quest/v1/quote", { params });
  const quote = response.data;

  // Cek persetujuan token jika diperlukan
  const approvalAddress = quote.estimate.approvalAddress;
  if (approvalAddress && approvalAddress !== ethers.ZeroAddress) {
    await ensureAllowance(wallet, fromToken, approvalAddress, amountWei);
  }

  // Kirim transaksi
  const txRequest = quote.transactionRequest;
  console.log(`Mengirim transaksi swap/bridge menggunakan rute Li.Fi (${quote.toolDetails.name})...`);
  
  const txResponse = await wallet.sendTransaction({
    to: txRequest.to,
    data: txRequest.data,
    value: txRequest.value,
    gasLimit: txRequest.gasLimit ? (BigInt(txRequest.gasLimit) * 12n / 10n) : undefined // 20% buffer
  });

  return txResponse;
}

// ---------------------------------------------------------
// 2. RELAY BRIDGE & SWAP (MODE MANUAL - PROVIDER RELAY)
// ---------------------------------------------------------
async function runRelayQuote(wallet, fromChainId, toChainId, fromToken, toToken, amountWei) {
  console.log("Menghubungi Relay.link API untuk mendapatkan rute...");
  
  // Relay expects native token as "0x0000000000000000000000000000000000000000"
  const payload = {
    user: wallet.address,
    originChainId: fromChainId,
    destinationChainId: toChainId,
    originCurrency: fromToken,
    destinationCurrency: toToken,
    amount: amountWei.toString(),
    tradeType: "EXACT_INPUT"
  };

  const response = await axios.post("https://api.relay.link/quote", payload);
  const quote = response.data;

  if (!quote.steps || quote.steps.length === 0) {
    throw new Error("Relay tidak mengembalikan rute transaksi untuk request ini.");
  }

  // Proses setiap langkah transaksi yang diminta oleh Relay
  let lastTxResponse;
  for (const step of quote.steps) {
    console.log(`Menjalankan langkah Relay: ${step.action} - ${step.description}`);
    for (const item of step.items) {
      if (item.status === "todo" && item.kind === "transaction") {
        const txData = item.data;
        
        // Cek jika butuh approve
        if (fromToken !== "0x0000000000000000000000000000000000000000" && txData.to.toLowerCase() !== fromToken.toLowerCase()) {
          await ensureAllowance(wallet, fromToken, txData.to, amountWei);
        }

        console.log(`Mengirim transaksi untuk langkah Relay (${step.action})...`);
        lastTxResponse = await wallet.sendTransaction({
          to: txData.to,
          data: txData.data,
          value: txData.value,
          gasLimit: txData.gasLimit ? (BigInt(txData.gasLimit) * 12n / 10n) : undefined
        });
      }
    }
  }

  return lastTxResponse;
}

// ---------------------------------------------------------
// 3. UNISWAP V3 SWAP DIRECT CONTRACT CALL
// ---------------------------------------------------------
async function runUniswapV3Swap(wallet, chainId, fromToken, toToken, amountWei, slippage) {
  // Uniswap V3 Router Standard Address (Sama di hampir semua EVM utama)
  const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  
  console.log(`Menggunakan interaksi kontrak langsung ke Uniswap V3 SwapRouter (${UNISWAP_V3_ROUTER})...`);
  
  // WETH address needed for swapping native token
  const chainConfig = getChainConfig(chainId);
  const resolvedFrom = fromToken === "0x0000000000000000000000000000000000000000" ? resolveToken("WETH", chainId) : fromToken;
  const resolvedTo = toToken === "0x0000000000000000000000000000000000000000" ? resolveToken("WETH", chainId) : toToken;

  const abi = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 proxyFee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
  ];
  
  const router = new ethers.Contract(UNISWAP_V3_ROUTER, abi, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 menit dari sekarang
  
  // Hubungkan token approval jika tokenIn adalah ERC-20
  if (fromToken !== "0x0000000000000000000000000000000000000000") {
    await ensureAllowance(wallet, fromToken, UNISWAP_V3_ROUTER, amountWei);
  }

  // Parameter exactInputSingle
  const params = {
    tokenIn: resolvedFrom,
    tokenOut: resolvedTo,
    fee: 3000, // Fee tier 0.3%
    recipient: wallet.address,
    deadline: deadline,
    amountIn: amountWei,
    amountOutMinimum: 0, // Dalam implementasi nyata disarankan menghitung min out berdasarkan oracle/slippage
    sqrtPriceLimitX96: 0
  };

  const isNativeIn = fromToken === "0x0000000000000000000000000000000000000000";
  
  const tx = await router.exactInputSingle(params, {
    value: isNativeIn ? amountWei : 0
  });

  return tx;
}

// ---------------------------------------------------------
// 4. PANCAKESWAP V3 SWAP DIRECT CONTRACT CALL
// ---------------------------------------------------------
async function runPancakeSwapV3Swap(wallet, chainId, fromToken, toToken, amountWei) {
  // PancakeSwap SmartRouter V3 Address (di BSC: 0x13f4EA83D0bd40E75c8222255bc855a974568Dd4)
  const PANCAKE_V3_ROUTER = "0x13f4EA83D0bd40E75c8222255bc855a974568Dd4";
  
  console.log(`Menggunakan interaksi kontrak langsung ke PancakeSwap V3 Router (${PANCAKE_V3_ROUTER})...`);
  
  const resolvedFrom = fromToken === "0x0000000000000000000000000000000000000000" ? resolveToken("WETH", chainId) : fromToken;
  const resolvedTo = toToken === "0x0000000000000000000000000000000000000000" ? resolveToken("WETH", chainId) : toToken;

  const abi = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
  ];
  
  const router = new ethers.Contract(PANCAKE_V3_ROUTER, abi, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

  if (fromToken !== "0x0000000000000000000000000000000000000000") {
    await ensureAllowance(wallet, fromToken, PANCAKE_V3_ROUTER, amountWei);
  }

  const params = {
    tokenIn: resolvedFrom,
    tokenOut: resolvedTo,
    fee: 2500, // Pancake V3 sering menggunakan fee tier 0.25%
    recipient: wallet.address,
    deadline: deadline,
    amountIn: amountWei,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
  };

  const isNativeIn = fromToken === "0x0000000000000000000000000000000000000000";

  const tx = await router.exactInputSingle(params, {
    value: isNativeIn ? amountWei : 0
  });

  return tx;
}

// ---------------------------------------------------------
// MAIN EXPORT FUNCTION FOR CLI
// ---------------------------------------------------------
export async function swapOrBridge(options) {
  try {
    const {
      chain,
      fromChain,
      toChain,
      fromToken: rawFromToken,
      toToken: rawToToken,
      amount,
      mode = "auto",
      provider = "lifi",
      slippage = "0.5"
    } = options;

    // Tentukan origin dan destination chain
    const originChainName = fromChain || chain;
    const destChainName = toChain || chain || fromChain;
    
    if (!originChainName) {
      throw new Error("Jaringan sumber (--chain atau --fromChain) wajib ditentukan.");
    }

    const { wallet, chainConfig } = getWallet(originChainName);
    const destChainConfig = getChainConfig(destChainName);

    const fromTokenAddress = resolveToken(rawFromToken, chainConfig.id);
    const toTokenAddress = resolveToken(rawToToken, destChainConfig.id);
    
    // Ambil decimals token pengirim untuk parsing input amount
    let decimals = 18;
    if (fromTokenAddress !== "0x0000000000000000000000000000000000000000") {
      const tokenContract = new ethers.Contract(fromTokenAddress, ERC20_ABI, wallet.provider);
      decimals = await tokenContract.decimals();
    }
    const amountWei = parseUnits(amount, decimals);
    const slippageFloat = parseFloat(slippage) / 100; // e.g. "0.5" -> 0.005

    const isBridge = chainConfig.id !== destChainConfig.id;

    console.log(`\n==================================================`);
    console.log(`WEB3 ON-CHAIN TRANSACTION REQUEST`);
    console.log(`==================================================`);
    console.log(`Action     : ${isBridge ? "BRIDGE (Cross-Chain)" : "SWAP (Same-Chain)"}`);
    console.log(`Dari       : ${amount} ${rawFromToken} di ${chainConfig.name}`);
    console.log(`Tujuan     : ${rawToToken} di ${destChainConfig.name}`);
    console.log(`Wallet     : ${wallet.address}`);
    console.log(`Mode       : ${mode.toUpperCase()}`);
    if (mode === "manual") {
      console.log(`Provider   : ${provider.toUpperCase()}`);
    }
    console.log(`==================================================\n`);

    let txResponse;

    if (mode === "auto") {
      // Otomatis selalu menggunakan Li.Fi karena ia aggregator terlengkap
      txResponse = await runLifiQuote(wallet, chainConfig.id, destChainConfig.id, fromTokenAddress, toTokenAddress, amountWei, slippageFloat);
    } else {
      // Mode Manual
      const providerLower = provider.toLowerCase();
      
      if (isBridge) {
        // Bridging Lintas-Chain
        if (providerLower === "relay") {
          txResponse = await runRelayQuote(wallet, chainConfig.id, destChainConfig.id, fromTokenAddress, toTokenAddress, amountWei);
        } else if (providerLower === "lifi") {
          txResponse = await runLifiQuote(wallet, chainConfig.id, destChainConfig.id, fromTokenAddress, toTokenAddress, amountWei, slippageFloat);
        } else {
          throw new Error(`Provider "${provider}" tidak mendukung bridging lintas-chain. Pilihan yang didukung: relay, lifi`);
        }
      } else {
        // Swap pada chain yang sama
        if (providerLower === "uniswap" || providerLower === "uniswapv3") {
          txResponse = await runUniswapV3Swap(wallet, chainConfig.id, fromTokenAddress, toTokenAddress, amountWei, slippageFloat);
        } else if (providerLower === "pancakeswap") {
          txResponse = await runPancakeSwapV3Swap(wallet, chainConfig.id, fromTokenAddress, toTokenAddress, amountWei);
        } else if (providerLower === "relay") {
          txResponse = await runRelayQuote(wallet, chainConfig.id, destChainConfig.id, fromTokenAddress, toTokenAddress, amountWei);
        } else if (providerLower === "lifi") {
          txResponse = await runLifiQuote(wallet, chainConfig.id, destChainConfig.id, fromTokenAddress, toTokenAddress, amountWei, slippageFloat);
        } else {
          throw new Error(`Provider "${provider}" tidak didukung untuk Swap. Pilihan: lifi, relay, uniswap, pancakeswap`);
        }
      }
    }

    console.log(`Transaksi terkirim ke jaringan. Tx Hash: ${txResponse.hash}`);
    console.log("Menunggu konfirmasi blok...");
    
    const receipt = await txResponse.wait(1);
    
    console.log(JSON.stringify({
      success: true,
      action: isBridge ? "bridge" : "swap",
      provider: mode === "auto" ? "lifi" : provider,
      txHash: receipt.hash,
      from: receipt.from,
      explorer: `${chainConfig.explorer}/tx/${receipt.hash}`
    }, null, 2));

  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.response?.data?.message || error.message
    }, null, 2));
  }
}
