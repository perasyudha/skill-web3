# Security Policy and Architecture

This document describes the security protocols, threat model, architectural safeguards, and vulnerability reporting procedures for the **OpenClaw Web3 Operations Skill** (`web3-ops`). 

As a non-custodial CLI tool and AI agent skill capable of executing blockchain transactions, security is our absolute design priority.

---

## 🔒 1. Cryptographic Key Management (Zero-Knowledge Architecture)

The `web3-ops` skill is engineered to ensure that your cryptographic keys (private keys or seed phrases) remain completely secure, private, and localized.

```mermaid
graph TD
    A[AI Agent / LLM Interface] -->|1. Generates CLI Command| B(web3-ops Runtime)
    subgraph Local Secure Host Sandbox
        B -->|2. Loads Secrets| C[.env File / Host Process]
        B -->|3. Signs Tx Client-Side| D[Ethers.js Signer]
        D -->|4. Private Key Purged| E((RAM Garbage Collection))
    end
    D -->|5. Sends Broadcast Tx Only| F[Blockchain Network]
    style C fill:#f9f,stroke:#333,stroke-width:2px
    style D fill:#bbf,stroke:#333,stroke-width:2px
    style A fill:#ffb,stroke:#333,stroke-width:2px
```

### Key Safeguards:
*   **Zero-Knowledge to AI Agent (LLM)**: Large Language Models (LLMs) and remote AI Agents interacting with this tool **never** see or handle your private keys or seed phrases. The LLM only generates CLI parameters (e.g., `--chain`, `--to`, `--token`) and reads public `stdout` results (e.g., transaction hashes, transaction statuses, and balances).
*   **Local-First Transaction Signing**: All cryptographic operations, key derivation, and transaction signing occur strictly client-side within the local Node.js runtime memory using `ethers.js`. Keys are never sent to third-party endpoints, proxy servers, or LLM providers.
*   **Volatile In-Memory Lifecycle**: Your private keys are loaded into system memory only during command execution and are instantly purged when the process terminates. No keys are cached or written to local log files.

---

## 🛡️ 2. On-Chain Security Features

To protect your assets from common on-chain exploits (such as malicious smart contracts or sandwich attacks), `web3-ops` includes built-in protective features:

### A. Smart Contract Audit Integration (`analyze`)
Before interacting with any new or untrusted token, users or AI agents can invoke the `analyze` command:
*   **GoPlus Security API**: Checks the target token address across 30+ threat indicators.
*   **Threat Indicators Analyzed**:
    *   **Honeypot Risk**: Checks if selling is restricted or if the contract has blacklist/whitelist functions.
    *   **Tax Structure**: Detects unusually high buy/sell transfer taxes.
    *   **Access Control**: Warns if the contract is mintable, has owner-backdoors, or has not renounced ownership.
    *   **Proxy Contracts**: Highlights if the implementation can be upgraded maliciously.

### B. Anti-MEV (Maximal Extractable Value) Protection (`--anti-mev`)
To avoid being frontrun or sandwiched on public mempools, you can append the `--anti-mev` flag to your transactions:
*   **Private Mempool Routing**: Instead of broadcasting to public RPCs, the tool routes transactions directly to MEV-resistant private block builders (e.g., Flashbots Protect on Ethereum, bloXroute, or private builders on BNB Chain).
*   **Zero Slippage Exploitation**: By bypassing the public mempool, searcher bots cannot detect your swap or sandwich your trade.

### C. Transaction Simulation (`--simulate`)
Before broadcasting transactions, the `--simulate` option simulates the execution using `estimateGas` and dry-run calls against the current state of the blockchain.
*   Prevents wasting transaction gas on failing transactions.
*   Identifies contract reverts prior to broadcasting.

---

## ⚙️ 3. Security Hardening Best Practices

If you are running this tool in production or exposing it to an AI Agent, we strongly recommend following these hardening guidelines:

| Category | Best Practice | Rationale |
| :--- | :--- | :--- |
| **Wallet Setup** | Use a dedicated **Hot Wallet** containing only the assets required for immediate operations. | Minimizes the blast radius in case the host machine is compromised. |
| **Permissions** | Set restrictive permissions on the `.env` file containing your keys (e.g., `chmod 600 .env` on Unix-like environments). | Prevents unauthorized local users from reading your credentials. |
| **Private RPCs** | Configure custom private RPC endpoints using the `--rpc` option. | Enhances network reliability, reduces rate limits, and improves privacy. |
| **Environment Separation**| Run the AI Agent and the `web3-ops` execution environment in a sandboxed or containerized environment (e.g., Docker). | Restricts the LLM's system access and prevents path traversal to the `.env` file. |

---

## 🐛 4. Reporting Vulnerabilities

If you discover a security vulnerability in this project, please report it to us immediately. **Do not open a public GitHub issue for security bugs.**

### Reporting Process:
1.  Send a detailed description of the vulnerability directly to the project maintainer via safe/private channels.
2.  Include a proof of concept (PoC) or step-by-step instructions to reproduce the issue.
3.  We will acknowledge receipt of your report within **24 hours** and provide a status update on a fix within **72 hours**.

### Responsible Disclosure Guidelines:
We ask you to follow responsible disclosure guidelines:
*   Allow us reasonable time to investigate and remediate the issue before publishing any information about it.
*   Do not attempt to exploit the vulnerability or access user funds.
*   Do not perform denial-of-service (DoS) attacks or run automated stress-testing scanners against public infrastructure.

---

## 📜 5. Disclaimer

*This software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.*
