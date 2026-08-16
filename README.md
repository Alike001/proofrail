# ProofRail

Public company evidence you can replay.

ProofRail turns exact SEC and GLEIF records into expiring evidence receipts whose accepted packet hashes and history are preserved on BOT Chain.

## Product boundary

ProofRail verifies that one SEC CIK and one GLEIF LEI resolved, the normalized legal names matched, the GLEIF record was active, the SEC record had a recent filing, and both saved responses were fresh when the packet was issued.

It does not prove company ownership, issuer authority, regulatory approval, investment quality, or decentralized oracle consensus.

## Current status

Implementation is active. The deterministic evidence engine is the first build unit because the source service, signer, contract adapter, and public replay page must share one rule implementation.

## Local checks

```bash
corepack pnpm install
corepack pnpm check
```

No private key, API credential, or local planning document belongs in this repository.
