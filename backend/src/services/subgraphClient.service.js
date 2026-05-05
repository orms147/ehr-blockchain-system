// Thin GraphQL client for the EHR subgraph (S17 2026-04-30).
//
// Replaces the 3 RPC sync services that polled Alchemy directly. The subgraph
// (deployed on The Graph Studio) already indexes every event we care about, so
// 1 GraphQL request per cycle replaces 16 eth_getFilterChanges polls.
//
// Strict mode: if the subgraph endpoint is unreachable or returns errors, this
// throws — no automatic fallback to RPC. Caller (subgraphSync) logs and skips
// the cycle. This is intentional: dual-source fallback (subgraph + RPC) is
// what caused the 429 storm in the first place.

import { createLogger } from '../utils/logger.js';

const log = createLogger('SubgraphClient');

const SUBGRAPH_URL = process.env.SUBGRAPH_URL;

export const isSubgraphConfigured = !!SUBGRAPH_URL;

class SubgraphError extends Error {
    constructor(message, { status = null, errors = null } = {}) {
        super(message);
        this.name = 'SubgraphError';
        this.status = status;
        this.errors = errors;
    }
}

export async function gql(query, variables = {}) {
    if (!SUBGRAPH_URL) {
        throw new SubgraphError('SUBGRAPH_URL not configured');
    }

    let response;
    try {
        response = await fetch(SUBGRAPH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables }),
        });
    } catch (err) {
        throw new SubgraphError(`Network error reaching subgraph: ${err.message}`);
    }

    if (!response.ok) {
        throw new SubgraphError(`Subgraph HTTP ${response.status}`, { status: response.status });
    }

    const json = await response.json();
    if (json.errors?.length) {
        throw new SubgraphError(
            'Subgraph returned errors: ' + json.errors.map((e) => e.message).join('; '),
            { errors: json.errors },
        );
    }

    return json.data;
}

export { SubgraphError };

export default { gql, isSubgraphConfigured, SubgraphError };
