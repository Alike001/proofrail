# ProofRail

Public company evidence you can replay.

ProofRail turns exact SEC and GLEIF records into expiring evidence receipts whose accepted packet hashes and history are preserved on BOT Chain.

## Product boundary

ProofRail verifies that one SEC CIK and one GLEIF LEI resolved, the normalized legal names matched, the GLEIF record was active, the SEC record had a recent filing, and both saved responses were fresh when the packet was issued.

It does not prove company ownership, issuer authority, regulatory approval, investment quality, or decentralized oracle consensus.

## Current status

Implementation is active. The deterministic evidence engine, official SEC and GLEIF source adapters, and the `ProofRailEvidenceRegistry` contract are implemented and tested. Persistence, indexing, signing service, and product surfaces remain in progress.

## Local checks

```bash
corepack pnpm install
corepack pnpm check
corepack pnpm build
```

`pnpm check` runs strict TypeScript checks, 66 evidence-engine tests, 33 source-adapter tests, 27 Foundry contract tests, and 256 fuzz cases. `pnpm test:coverage` runs all coverage suites.

The source adapters retain the exact response body received from each official service, calculate its SHA-256 hash, reject identifier mismatches and malformed schemas, and expose stable error codes. SEC access requires a declared contact identity in `SEC_USER_AGENT`, such as `ProofRail maintainer@example.com`. It is used only in the server request header.

To check the built GLEIF adapter against its live API:

```bash
corepack pnpm --filter @proofrail/source-service smoke:live -- --gleif-only
```

For both services, set `SEC_USER_AGENT` and omit `--gleif-only`. The smoke script prints public evidence fields, response byte counts, and hashes. It does not print the configured contact header.

For the local-chain contract smoke test, start Anvil in one terminal and run the publication script in another:

```bash
anvil --silent --port 8545
corepack pnpm --filter @proofrail/contracts smoke:local
```

The smoke script uses Anvil's unlocked accounts through JSON-RPC. It deploys the registry, signs an EIP-712 envelope, publishes from the bound wallet, waits for confirmation, and verifies the stored receipt. It contains no private key.

OpenZeppelin Contracts 5.6.1 and Forge Standard Library 1.14.0 are pinned under `contracts/lib` for reproducible Solidity builds.

No private key, API credential, or local planning document belongs in this repository.
