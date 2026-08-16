# ProofRail

Public company evidence you can replay.

ProofRail turns exact SEC and GLEIF records into expiring evidence receipts whose accepted packet hashes and history are preserved on BOT Chain.

## Product boundary

ProofRail verifies that one SEC CIK and one GLEIF LEI resolved, the normalized legal names matched, the GLEIF record was active, the SEC record had a recent filing, and both saved responses were fresh when the packet was issued.

It does not prove company ownership, issuer authority, regulatory approval, investment quality, or decentralized oracle consensus.

## Current status

Implementation is active. The deterministic evidence engine, official SEC and GLEIF source adapters, PostgreSQL persistence, and the `ProofRailEvidenceRegistry` contract are implemented and tested. The indexer worker, envelope signing service, and product surfaces remain in progress.

## Local checks

```bash
corepack pnpm install
corepack pnpm check
corepack pnpm build
```

`pnpm check` runs strict TypeScript checks, 66 evidence-engine tests, 33 source-adapter tests, 20 database boundary tests, 27 Foundry contract tests, and 256 fuzz cases. The eight PostgreSQL integration tests run when `PROOFRAIL_TEST_DATABASE_URL` is present.

The source adapters retain the exact response body received from each official service, calculate its SHA-256 hash, reject identifier mismatches and malformed schemas, and expose stable error codes. SEC access requires a declared contact identity in `SEC_USER_AGENT`, such as `ProofRail maintainer@example.com`. It is used only in the server request header.

To check the built GLEIF adapter against its live API:

```bash
corepack pnpm --filter @proofrail/source-service smoke:live -- --gleif-only
```

For both services, set `SEC_USER_AGENT` and omit `--gleif-only`. The smoke script prints public evidence fields, response byte counts, and hashes. It does not print the configured contact header.

To run the real PostgreSQL migration, immutability, rollback, and idempotency tests:

```bash
docker compose -f compose.test.yaml up --detach --wait
PROOFRAIL_TEST_DATABASE_URL=postgresql://proofrail:proofrail_test@127.0.0.1:55432/proofrail_test corepack pnpm --filter @proofrail/db test:integration
docker compose -f compose.test.yaml down
```

The test database uses a temporary in-memory data directory. Database coverage is 94.07% lines and statements, 97.58% branches, and 88.63% functions when the PostgreSQL URL is set.

For the local-chain contract smoke test, start Anvil in one terminal and run the publication script in another:

```bash
anvil --silent --port 8545
corepack pnpm --filter @proofrail/contracts smoke:local
```

The smoke script uses Anvil's unlocked accounts through JSON-RPC. It deploys the registry, signs an EIP-712 envelope, publishes from the bound wallet, waits for confirmation, and verifies the stored receipt. It contains no private key.

OpenZeppelin Contracts 5.6.1 and Forge Standard Library 1.14.0 are pinned under `contracts/lib` for reproducible Solidity builds.

No private key, API credential, or local planning document belongs in this repository.
