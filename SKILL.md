---
name: web3-ops
description: Perform EVM Web3 on-chain operations such as checking addresses, scanning portfolios, transferring assets, swapping/bridging tokens, and minting NFTs.

env:
  - PRIVATE_KEY

requirements:
  bins:
    - node
---
# Web3 On-chain Operations Skill

This skill allows the OpenClaw AI agent to interact directly with EVM blockchains (Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain, Sonic, Sepolia, etc.) using a local Node.js CLI utility.

## Global Options

These flags can be appended to any command:
*   `--json`: Silences human logs and outputs strictly JSON to `stdout` (highly recommended for AI agent parsing).
*   `--rpc <url>`: Overrides default node RPC with a custom RPC endpoint (useful for testnets or private nodes).
*   `--simulate`: Simulates the transaction (dry run) using gas estimation and call simulation. Prevents sending failing transactions and calculates gas fees.

## CLI Commands & Arguments

All commands are run using Node.js inside the skill directory:
`node skills/web3-ops/index.js <command> [arguments]`

### 1. Get Wallet Address
Get your configured wallet address.
*   **Usage:** `node skills/web3-ops/index.js address [--json]`

### 2. Check Specific Balance
Check native coin (ETH, MATIC, BNB, S) or a specific ERC-20 token balance using symbol or contract address.
*   **Native Coin:** `node skills/web3-ops/index.js balance --chain <chain> [--json]`
*   **ERC-20 Token:** `node skills/web3-ops/index.js balance --chain <chain> --token <symbol_or_address> [--json]`
*   *Example:* `node skills/web3-ops/index.js balance --chain base --token AERO`

### 3. Scan Portfolio (New)
Scan and list all tokens with a positive balance in your wallet on a specific chain. Automatically detects "degen/micin" tokens using block explorer transaction history.
*   **Usage:** `node skills/web3-ops/index.js portfolio --chain <chain> [--json]`

### 4. Transfer Coins or Tokens
Send native coins or ERC-20 tokens to another address.
*   **Native Coin:** `node skills/web3-ops/index.js transfer --chain <chain> --to <recipient_address> --amount <amount> [--json] [--simulate]`
*   **ERC-20 Token:** `node skills/web3-ops/index.js transfer --chain <chain> --to <recipient_address> --amount <amount> --token <symbol_or_address> [--json] [--simulate]`

### 5. Swap Tokens (Same-Chain)
Swap tokens on the same blockchain network. Supports auto-routing and manual routers.
*   **Auto Mode (Li.Fi Aggregator):**
    `node skills/web3-ops/index.js swap --chain <chain> --fromToken <symbol_or_address> --toToken <symbol_or_address> --amount <amount> --mode auto [--json] [--simulate]`
*   **Manual Mode (Uniswap/PancakeSwap/Relay/Li.Fi):**
    `node skills/web3-ops/index.js swap --chain <chain> --fromToken <symbol_or_address> --toToken <symbol_or_address> --amount <amount> --mode manual --provider <lifi|relay|uniswap|pancakeswap> [--json] [--simulate]`
*   **Slippage Tolerance:** Add `--slippage <percent>` (default is 0.5)

### 6. Bridge Tokens (Cross-Chain)
Bridge and swap assets from one blockchain to another.
*   **Auto Mode (Li.Fi Aggregator):**
    `node skills/web3-ops/index.js bridge --fromChain <source_chain> --toChain <target_chain> --fromToken <symbol_or_address> --toToken <symbol_or_address> --amount <amount> --mode auto [--json] [--simulate]`
*   **Manual Mode (Relay/Li.Fi):**
    `node skills/web3-ops/index.js bridge --fromChain <source_chain> --toChain <target_chain> --fromToken <symbol_or_address> --toToken <symbol_or_address> --amount <amount> --mode manual --provider <lifi|relay> [--json] [--simulate]`

### 7. Mint NFT
Mint or claim NFTs on a smart contract.
*   **Usage:** `node skills/web3-ops/index.js mint --chain <chain> --contract <nft_contract_address> --function <signature> --args <json_array_arguments> --value <native_fee_to_send> [--json] [--simulate]`
*   *Example:* `node skills/web3-ops/index.js mint --chain base --contract 0x123... --function "mint(uint256)" --args "[1]"`

### 8. Custom Transaction (Raw Transaction)
Broadcast a custom raw transaction with hex data payload.
*   **Usage:** `node skills/web3-ops/index.js custom --chain <chain> --to <target_address> --data <hex_calldata> --value <native_amount> [--json] [--simulate]`

---

## Agent Behavior & Telegram Prompt Guidelines

When interacting with the user regarding blockchain transactions:
1.  **Translate Intent to CLI:** Convert the user's natural language requests (e.g., "Check my Base portfolio", "Swap 10 USDC to ETH on Base", "Send 0.01 Sepolia ETH to 0x...") into the corresponding CLI command. Always append `--json` for programmatic parsing.
2.  **Utilize Simulation Mode:** If the user is unsure, asks "will this transaction work?", or is making a high-value transfer, suggest simulating it first using `--simulate`.
3.  **Display Copyable Addresses (CAs):** When printing token balances, portfolios, or transaction confirmations, format all contract addresses (CA) inside Telegram monospace code blocks (e.g. `` `0x940181a94A35A4569E4529A3CDfB74e38FD98631` ``) so users can tap to copy them instantly.
4.  **Support Testnets & Custom RPCs:** If the user specifies a testnet (e.g., Sepolia) or requests a private RPC, append the `--rpc` flag to the command.
5.  **Explorer Links:** Always extract the `explorer` link from the output JSON and present it to the user so they can track block confirmation status.
6.  **Security Notice:** Never request seed phrases, mnemonics, or private keys. The wallet configuration is loaded securely from the local server's `.env` file.
7.  **Casual & Friendly Tone:** Explain transaction results, balances, or confirmations in a natural, casual, and friendly everyday chat style (e.g., like a helpful Web3 degen companion). Avoid robotic or overly dry responses, but always keep technical fields (like contract addresses and transaction hashes) accurate and formatted for easy copying.
