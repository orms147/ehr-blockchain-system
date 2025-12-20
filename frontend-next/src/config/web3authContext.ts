// Web3Auth configuration for React Hooks API
import { WEB3AUTH_NETWORK, type Web3AuthOptions } from '@web3auth/modal';
import type { Web3AuthContextConfig } from '@web3auth/modal/react';

const clientId = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ||
    'BLcTr1Sfd1hpObhsaNjMbayzx5C5GZR31lUHuk9W9ijGCrVHueKwy-XsBilxn30SPUckJxJvoCllWz6-h_Ox0Ks';

export const web3AuthOptions: Web3AuthOptions = {
    clientId,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
};

export const web3AuthContextConfig: Web3AuthContextConfig = {
    web3AuthOptions,
};

export default web3AuthContextConfig;
