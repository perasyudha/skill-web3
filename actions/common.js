import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root of skill directory
dotenv.config({ path: path.join(__dirname, "../.env") });

export const SUPPORTED_CHAINS = {
  ethereum: {
    id: 1,
    name: "Ethereum Mainnet",
    symbol: "ETH",
    rpc: process.env.ETH_RPC_URL || "https://cloudflare-eth.com",
    explorer: "https://etherscan.io"
  },
  arbitrum: {
    id: 42161,
    name: "Arbitrum One",
    symbol: "ETH",
    rpc: process.env.ARB_RPC_URL || "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io"
  },
  base: {
    id: 8453,
    name: "Base",
    symbol: "ETH",
    rpc: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    explorer: "https://basescan.org"
  },
  optimism: {
    id: 10,
    name: "OP Mainnet",
    symbol: "ETH",
    rpc: process.env.OP_RPC_URL || "https://mainnet.optimism.io",
    explorer: "https://optimistic.etherscan.io"
  },
  polygon: {
    id: 137,
    name: "Polygon PoS",
    symbol: "POL",
    rpc: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
    explorer: "https://polygonscan.com"
  },
  bsc: {
    id: 56,
    name: "BNB Smart Chain",
    symbol: "BNB",
    rpc: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org",
    explorer: "https://bscscan.com"
  },
  avalanche: {
    id: 43114,
    name: "Avalanche C-Chain",
    symbol: "AVAX",
    rpc: process.env.AVAX_RPC_URL || "https://api.avax.network/ext/bc/C/rpc",
    explorer: "https://snowtrace.io"
  },
  linea: {
    id: 59144,
    name: "Linea",
    symbol: "ETH",
    rpc: process.env.LINEA_RPC_URL || "https://rpc.linea.build",
    explorer: "https://lineascan.build"
  },
  scroll: {
    id: 534352,
    name: "Scroll",
    symbol: "ETH",
    rpc: process.env.SCROLL_RPC_URL || "https://rpc.scroll.io",
    explorer: "https://scrollscan.com"
  },
  zksync: {
    id: 324,
    name: "zkSync Era",
    symbol: "ETH",
    rpc: process.env.ZKSYNC_RPC_URL || "https://mainnet.era.zksync.io",
    explorer: "https://era.zksync.network"
  }
};

// ABI standard
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

export const ERC721_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function safeTransferFrom(address from, address to, uint256 tokenId) external",
  "function mint(uint256 quantity) payable",
  "function claim(address receiver, uint256 quantity, address tokenId, uint256 pricePerToken, tuple(bytes32[] proof, uint256 quantityLimitPerWallet, uint256 pricePerToken, address currency) allowlistProof, bytes data) payable"
];

// Helper to normalize chain names
export function getChainConfig(chainInput) {
  if (!chainInput) return SUPPORTED_CHAINS.ethereum;
  const normalized = chainInput.toLowerCase().trim();
  
  // Direct match
  if (SUPPORTED_CHAINS[normalized]) {
    return SUPPORTED_CHAINS[normalized];
  }
  
  // Loose matching/aliases
  if (normalized === "eth" || normalized === "mainnet") return SUPPORTED_CHAINS.ethereum;
  if (normalized === "arb" || normalized === "arbitrumone") return SUPPORTED_CHAINS.arbitrum;
  if (normalized === "op" || normalized === "optimistic") return SUPPORTED_CHAINS.optimism;
  if (normalized === "matic") return SUPPORTED_CHAINS.polygon;
  if (normalized === "binance" || normalized === "bnb") return SUPPORTED_CHAINS.bsc;
  if (normalized === "avax") return SUPPORTED_CHAINS.avalanche;
  
  // Try matching chain ID
  const chainId = parseInt(normalized);
  if (!isNaN(chainId)) {
    const matched = Object.values(SUPPORTED_CHAINS).find(c => c.id === chainId);
    if (matched) return matched;
    // Return fallback for custom chain ID if we can't find it
    return {
      id: chainId,
      name: `Chain ID ${chainId}`,
      symbol: "ETH",
      rpc: "https://rpc.ankr.com/multichain", // generic fallback
      explorer: ""
    };
  }

  throw new Error(`Chain "${chainInput}" tidak didukung. Silakan gunakan: eth, arbitrum, base, optimism, polygon, bsc, avalanche, dll.`);
}

// Get Signer & Provider
export function getWallet(chainInput) {
  const chainConfig = getChainConfig(chainInput);
  const provider = new ethers.JsonRpcProvider(chainConfig.rpc);
  
  const privateKey = process.env.PRIVATE_KEY;
  const mnemonic = process.env.MNEMONIC;
  
  let wallet;
  if (privateKey && privateKey !== "0x0000000000000000000000000000000000000000000000000000000000000000" && privateKey.trim() !== "") {
    wallet = new ethers.Wallet(privateKey, provider);
  } else if (mnemonic && mnemonic.trim() !== "") {
    wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
  } else {
    throw new Error("Konfigurasi wallet tidak ditemukan. Silakan isi PRIVATE_KEY atau MNEMONIC di file .env Anda.");
  }
  
  return { wallet, provider, chainConfig };
}

// Format units helper
export function formatUnits(value, decimals = 18) {
  return ethers.formatUnits(value, decimals);
}

// Parse units helper
export function parseUnits(value, decimals = 18) {
  return ethers.parseUnits(value.toString(), decimals);
}
