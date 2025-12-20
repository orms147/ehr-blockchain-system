// Web3Auth configuration for React Hooks API
import { WEB3AUTH_NETWORK } from '@web3auth/modal';

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID ||
    'BLcTr1Sfd1hpObhsaNjMbayzx5C5GZR31lUHuk9W9ijGCrVHueKwy-XsBilxn30SPUckJxJvoCllWz6-h_Ox0Ks';

export const web3AuthOptions = {
    clientId,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
};

export const web3AuthContextConfig = {
    web3AuthOptions,
};

export default web3AuthContextConfig;
