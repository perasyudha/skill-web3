---
name: web3-ops
description: Melakukan transaksi on-chain Web3 (EVM) seperti cek saldo, transfer, swap, bridge lintas jaringan, dan minting NFT.
metadata:
  openclaw:
    os: ["darwin", "linux", "win32"]
    requires:
      bins: ["node"]
      env: ["PRIVATE_KEY"]
---

# Web3 On-chain Operations Skill

Skill ini memungkinkan Anda untuk berinteraksi langsung dengan blockchain EVM (Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain, dll.) menggunakan CLI Node.js secara lokal.

## Perintah CLI & Argumen

Semua perintah dijalankan menggunakan Node.js di folder skill:
`node skills/web3-ops/index.js <perintah> [argumen]`

### 1. Dapatkan Alamat Wallet Anda
**Penggunaan:** `node skills/web3-ops/index.js address`

### 2. Cek Saldo
Melihat saldo native koin (ETH, MATIC, BNB) atau token ERC-20 tertentu.
*   **Native Koin:** `node skills/web3-ops/index.js balance --chain <jaringan>`
*   **ERC-20 Token:** `node skills/web3-ops/index.js balance --chain <jaringan> --token <alamat_kontrak>`

### 3. Kirim Koin / Token (Transfer)
Mengirim koin native atau token ERC-20 ke alamat lain.
*   **Native Koin:** `node skills/web3-ops/index.js transfer --chain <jaringan> --to <alamat_penerima> --amount <jumlah>`
*   **ERC-20 Token:** `node skills/web3-ops/index.js transfer --chain <jaringan> --to <alamat_penerima> --amount <jumlah> --token <alamat_kontrak>`

### 4. Swap Token (Pada Jaringan yang Sama)
Menukar token di jaringan yang sama. Mendukung mode otomatis dan manual.
*   **Otomatis (Li.Fi Aggregator):**
    `node skills/web3-ops/index.js swap --chain <jaringan> --fromToken <simbol/alamat> --toToken <simbol/alamat> --amount <jumlah> --mode auto`
*   **Manual (Uniswap / PancakeSwap / Relay / Li.Fi):**
    `node skills/web3-ops/index.js swap --chain <jaringan> --fromToken <simbol/alamat> --toToken <simbol/alamat> --amount <jumlah> --mode manual --provider <lifi|relay|uniswap|pancakeswap>`
*   **Mengatur Slippage:** Tambahkan `--slippage <persen>` (default: 0.5)

### 5. Bridge Token (Lintas Jaringan)
Mengirim dan menukar token dari satu jaringan ke jaringan lainnya.
*   **Otomatis (Li.Fi Aggregator):**
    `node skills/web3-ops/index.js bridge --fromChain <jaringan_asal> --toChain <jaringan_tujuan> --fromToken <simbol/alamat> --toToken <simbol/alamat> --amount <jumlah> --mode auto`
*   **Manual (Relay / Li.Fi):**
    `node skills/web3-ops/index.js bridge --fromChain <jaringan_asal> --toChain <jaringan_tujuan> --fromToken <simbol/alamat> --toToken <simbol/alamat> --amount <jumlah> --mode manual --provider <lifi|relay>`

### 6. Mint NFT
Mengeksekusi minting NFT pada smart contract.
`node skills/web3-ops/index.js mint --chain <jaringan> --contract <alamat_kontrak_nft> --function <signature_fungsi> --args <json_array_argumen> --value <biaya_mint_native>`
*   *Contoh:* `node skills/web3-ops/index.js mint --chain base --contract 0x123... --function "mint(uint256)" --args "[1]"`

### 7. Transaksi Kustom (Raw Transaction)
Mengeksekusi transaksi kustom dengan data mentah (calldata hex).
`node skills/web3-ops/index.js custom --chain <jaringan> --to <alamat_tujuan> --data <calldata_hex> --value <jumlah_native> --gasLimit <limit_gas>`

---

## Panduan Perilaku Agent (Prompt Tambahan)

Saat pengguna berinteraksi dengan Anda melalui Telegram terkait operasi blockchain:
1.  **Analisis Perintah Pengguna:** Terjemahkan keinginan pengguna (misal: "Kirim 0.001 ETH ke 0xabc... di Arbitrum") menjadi perintah CLI di atas.
2.  **Pemilihan Mode & Provider:**
    - Jika pengguna **tidak** menyebutkan platform spesifik (misal: "swap 10 USDC ke ETH di Base"), gunakan `--mode auto`.
    - Jika pengguna menyebutkan platform tertentu (misal: "bridge 0.05 ETH dari Arbitrum ke Base pakai Relay" atau "swap MATIC ke USDC di Uniswap"), gunakan `--mode manual` dan set `--provider` yang sesuai (`relay` atau `uniswap`).
3.  **Tampilkan Hasil dengan Rapi:** Ambil output JSON dari eksekusi perintah CLI dan sajikan ke pengguna di Telegram dengan format markdown yang cantik, sertakan **Link Explorer** agar pengguna dapat memantau transaksi mereka.
4.  **Keamanan:** Jangan pernah menanyakan seed phrase atau private key pengguna. Semua konfigurasi wallet berada di file lokal komputer server Anda.
