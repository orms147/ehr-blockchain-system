import { type Web3AuthContextConfig } from '@web3auth/modal/react'
import { WEB3AUTH_NETWORK, type Web3AuthOptions } from '@web3auth/modal'

const web3AuthOptions: Web3AuthOptions = {
    clientId: 'BLcTr1Sfd1hpObhsaNjMbayzx5C5GZR31lUHuk9W9ijGCrVHueKwy-XsBilxn30SPUckJxJvoCllWz6-h_Ox0Ks',
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
}

const web3AuthContextConfig: Web3AuthContextConfig = {
    web3AuthOptions,
}

export default web3AuthContextConfig
