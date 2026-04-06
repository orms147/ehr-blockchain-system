/**
 * Centralized query key factory.
 *
 * Why a single file: invalidating queries needs the EXACT same key shape used
 * by `useQuery`. Centralizing here prevents typos and lets mutations invalidate
 * by namespace (e.g. `queryClient.invalidateQueries({ queryKey: recordKeys.all })`).
 */

export const recordKeys = {
    all: ['records'] as const,
    myList: () => [...recordKeys.all, 'my'] as const,
    detail: (cidHash: string) => [...recordKeys.all, 'detail', cidHash] as const,
    chain: (cidHash: string) => [...recordKeys.all, 'chain', cidHash] as const,
    access: (cidHash: string) => [...recordKeys.all, 'access', cidHash] as const,
};

export const requestKeys = {
    all: ['requests'] as const,
    incoming: () => [...requestKeys.all, 'incoming'] as const,
    signed: () => [...requestKeys.all, 'signed'] as const,
    detail: (requestId: string | number) => [...requestKeys.all, 'detail', String(requestId)] as const,
};

export const pendingUpdateKeys = {
    all: ['pendingUpdates'] as const,
    incoming: () => [...pendingUpdateKeys.all, 'incoming'] as const,
    outgoing: () => [...pendingUpdateKeys.all, 'outgoing'] as const,
    approved: () => [...pendingUpdateKeys.all, 'approved'] as const,
    detail: (id: string) => [...pendingUpdateKeys.all, 'detail', id] as const,
};

export const sharedRecordKeys = {
    all: ['sharedRecords'] as const,
    list: () => [...sharedRecordKeys.all, 'list'] as const,
};

export const accessLogKeys = {
    all: ['accessLogs'] as const,
    list: () => [...accessLogKeys.all, 'list'] as const,
};

export const delegationKeys = {
    all: ['delegations'] as const,
    myDelegates: () => [...delegationKeys.all, 'mine'] as const,
    delegatedToMe: () => [...delegationKeys.all, 'toMe'] as const,
    check: (patientAddress: string) => [...delegationKeys.all, 'check', patientAddress] as const,
};

export const profileKeys = {
    all: ['profile'] as const,
    me: () => [...profileKeys.all, 'me'] as const,
};
