// Thin GraphQL client for the EHR subgraph.
// No Apollo / urql dependency — just fetch + POST.
//
// Set EXPO_PUBLIC_SUBGRAPH_URL in your env, e.g.
//   https://api.studio.thegraph.com/query/<id>/ehr-arbsepolia/<version>
// If unset, queries return null and callers should fall back to backend REST.

const SUBGRAPH_URL = process.env.EXPO_PUBLIC_SUBGRAPH_URL;

export const isSubgraphEnabled = !!SUBGRAPH_URL;

export async function gql(query, variables = {}) {
    if (!SUBGRAPH_URL) {
        throw new Error('Subgraph URL not configured (EXPO_PUBLIC_SUBGRAPH_URL).');
    }

    const res = await fetch(SUBGRAPH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
        throw new Error(`Subgraph HTTP ${res.status}`);
    }

    const json = await res.json();
    if (json.errors?.length) {
        throw new Error(json.errors.map((e) => e.message).join('; '));
    }
    return json.data;
}

// ---------- Sample query helpers ----------

export async function fetchPatientRecords(patientAddress, first = 50) {
    const query = `
        query PatientRecords($id: ID!, $first: Int!) {
            patient(id: $id) {
                id
                recordCount
                records(first: $first, orderBy: createdAt, orderDirection: desc) {
                    id
                    cidHash
                    parentCidHash
                    createdAt
                    createdTxHash
                }
            }
        }
    `;
    const data = await gql(query, { id: patientAddress.toLowerCase(), first });
    return data?.patient?.records || [];
}

export async function fetchAccessRequestAudit(patientAddress, first = 100) {
    const query = `
        query AccessAudit($patient: String!, $first: Int!) {
            accessRequests(
                where: { patient: $patient }
                orderBy: requestedAt
                orderDirection: desc
                first: $first
            ) {
                id
                requester
                reqType
                status
                requestedAt
                completedAt
                rejectedAt
                txHash
            }
        }
    `;
    const data = await gql(query, { patient: patientAddress.toLowerCase(), first });
    return data?.accessRequests || [];
}

export async function fetchVerifiedDoctors(first = 100) {
    const query = `
        query VerifiedDoctors($first: Int!) {
            doctors(where: { verified: true }, first: $first) {
                id
                address
                orgId
                verifiedAt
                credential
            }
        }
    `;
    const data = await gql(query, { first });
    return data?.doctors || [];
}

export default {
    isSubgraphEnabled,
    gql,
    fetchPatientRecords,
    fetchAccessRequestAudit,
    fetchVerifiedDoctors,
};
