# ProofRail

Public company evidence you can replay.

ProofRail turns exact SEC and GLEIF records into expiring evidence receipts whose accepted packet hashes and history are preserved on BOT Chain.

## Product boundary

ProofRail verifies that one SEC CIK and one GLEIF LEI resolved, the normalized legal names matched, the GLEIF record was active, the SEC record had a recent filing, and both saved responses were fresh when the packet was issued.

It does not prove company ownership, issuer authority, regulatory approval, investment quality, or decentralized oracle consensus.

## Current status

The complete v1 product runs locally. It includes the landing page, official-source build flow, publisher-bound BOT wallet publication, wallet-free public receipt, deterministic replay, live source recheck, exact evidence downloads, PostgreSQL persistence, durable event indexing, and the `ProofRailEvidenceRegistry` contract.

BOT mainnet deployment is pending explicit transaction review. Until a real registry and receipt exist, the landing page labels mainnet proof as unavailable. The repository does not substitute a confirmed fixture.

## Product surfaces

- `/` explains the product and shows the latest indexed receipt from the configured BOT mainnet registry.
- `/build` retrieves exact SEC and GLEIF records, runs fixed policy version 1, and prepares a publisher-bound receipt for chain 677.
- `/receipt/[packetHash]` opens without a wallet and shows saved evidence, deterministic replay, live recheck, downloads, and BOTScan proof.

The 10-second story is: public company records change, ProofRail preserves which evidence packet a BOT application accepted and lets anyone replay it.

## Run locally

Requirements are Node.js 22 or newer, pnpm through Corepack, Docker, and Foundry.

```bash
corepack pnpm install
cp .env.example apps/web/.env.local
docker compose -f compose.test.yaml up --detach --wait
DATABASE_URL=postgresql://proofrail:proofrail_test@127.0.0.1:55432/proofrail_test corepack pnpm db:migrate
corepack pnpm dev
```

Open `http://localhost:3000`. The landing and unavailable states are truthful with empty deployment values. A working evidence build and publication also require these server-only values in `apps/web/.env.local`:

- `DATABASE_URL`
- `SEC_USER_AGENT`, with a real contact identity required by SEC
- `EVIDENCE_REGISTRY_ADDRESS`, for one deployed registry
- `ATTESTOR_PRIVATE_KEY`, for its approved application attestor
- `BOT_CHAIN_ID=677`
- `BOT_RPC_URL=https://rpc.botchain.ai`

Never place the attestor key in a `NEXT_PUBLIC_` variable. The browser receives only a publisher-bound signature and exact contract calldata.

## Local checks

```bash
corepack pnpm install
corepack pnpm check
corepack pnpm build
```

`pnpm check` runs strict TypeScript, lint, evidence-engine, source-adapter, database, signer, indexer, web, and Foundry checks. The contract suite includes 28 tests and 256 fuzz cases. The web suite includes 38 unit tests. Run the 22 desktop and mobile browser checks separately with `corepack pnpm --filter @proofrail/web test:e2e` after a production build.

The source adapters retain the exact response body received from each official service, calculate its SHA-256 hash, reject identifier mismatches and malformed schemas, and expose stable error codes. SEC access requires a declared contact identity in `SEC_USER_AGENT`, such as `ProofRail maintainer@example.com`. It is used only in the server request header.

The indexer queries inclusive confirmed block ranges with viem, verifies successful transaction receipts, commits derived receipts with its cursor in one PostgreSQL transaction, and rebuilds from the configured registry deployment block if the saved canonical hash changes.

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

The test database uses a temporary in-memory data directory. Ten real PostgreSQL integration tests cover migrations, immutable evidence, idempotent envelopes, atomic indexing, and the public receipt join.

For the local-chain contract smoke test, start Anvil in one terminal and run the publication script in another:

```bash
anvil --silent --port 8545
corepack pnpm --filter @proofrail/contracts smoke:local
```

The smoke script uses Anvil's unlocked accounts through JSON-RPC. It deploys the registry, signs an EIP-712 envelope, publishes from the bound wallet, waits for confirmation, and verifies the stored receipt. It contains no private key.

With the temporary PostgreSQL service and Anvil running, the indexer smoke test proves the reverse path from a real contract event to its persisted receipt:

```bash
PROOFRAIL_TEST_DATABASE_URL=postgresql://proofrail:proofrail_test@127.0.0.1:55432/proofrail_test \
  corepack pnpm --filter @proofrail/indexer smoke:local
```

OpenZeppelin Contracts 5.6.1 and Forge Standard Library 1.14.0 are pinned under `contracts/lib` for reproducible Solidity builds.

No private key, API credential, or local planning document belongs in this repository.
