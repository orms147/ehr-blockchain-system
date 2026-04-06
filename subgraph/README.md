# EHR Subgraph

The Graph indexer for EHR contracts on Arbitrum Sepolia.

## What it indexes

| Contract        | Events                                                                                                |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| RecordRegistry  | `RecordAdded`, `RecordUpdated` → `Record`, `RecordUpdate`, `Patient`                                  |
| EHRSystemSecure | `AccessRequested`, `RequestCompleted`, `RequestRejected` → `AccessRequest`                            |
| ConsentLedger   | `ConsentGranted/Revoked`, `DelegationGranted/Revoked` → `ConsentEvent`, `DelegationEvent`             |
| AccessControl   | `DoctorVerified`, `VerificationRevoked`, `OrganizationCreated`, `OrganizationStatusChanged` → `Doctor`, `Organization` |

Privacy: only on-chain `bytes32` hashes — no plaintext CIDs / PII.

## Setup

```bash
cd subgraph
npm install
npm run codegen     # generates ./generated from ABIs + schema
npm run build       # compile mappings to wasm
```

## Deploy

### Subgraph Studio (recommended for testnet)

1. Create a subgraph at https://thegraph.com/studio/, name it `ehr-arbsepolia`.
2. Authenticate the CLI:
   ```bash
   npx graph auth --studio <DEPLOY_KEY>
   ```
3. Deploy:
   ```bash
   npm run deploy-studio
   ```
4. Studio gives you a query URL like:
   `https://api.studio.thegraph.com/query/<id>/ehr-arbsepolia/<version>`

Set this URL in `mobile/.env` or wherever the mobile app reads `EXPO_PUBLIC_SUBGRAPH_URL`.

### Local graph-node (offline dev)

```bash
docker compose up -d            # graph-node + ipfs + postgres
npm run create-local
npm run deploy-local
```

Local query endpoint: `http://localhost:8000/subgraphs/name/ehr-local`.

## Sample queries

Latest 10 records of a patient:

```graphql
{
  patient(id: "0xabc...") {
    recordCount
    records(first: 10, orderBy: createdAt, orderDirection: desc) {
      cidHash
      parentCidHash
      createdAt
      createdTxHash
    }
  }
}
```

Access request audit trail for a patient:

```graphql
{
  accessRequests(
    where: { patient: "0xabc..." }
    orderBy: requestedAt
    orderDirection: desc
    first: 50
  ) {
    reqId
    requester
    reqType
    status
    requestedAt
    completedAt
    rejectedAt
  }
}
```

Verified doctors directory:

```graphql
{
  doctors(where: { verified: true }, first: 100) {
    address
    orgId
    verifiedAt
    credential
  }
}
```

## Updating ABIs

When contracts are redeployed, refresh ABIs:

```bash
for f in AccessControl ConsentLedger RecordRegistry EHRSystemSecure DoctorUpdate; do
  cp ../contracts/out/${f}.sol/${f}.json abis/${f}.json
done
```

Then update `subgraph.yaml` addresses + `startBlock`, run `npm run codegen && npm run build`, and redeploy.

## Files

- `schema.graphql` — entity definitions
- `subgraph.yaml` — manifest (data sources, addresses, event handlers)
- `src/*.ts` — AssemblyScript event mappings
- `abis/` — copied from `contracts/out/`
- `generated/` — created by `npm run codegen` (gitignored)
