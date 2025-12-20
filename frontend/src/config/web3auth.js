// Web3Auth No-Modal Configuration (v9 - constructor approach)
let web3auth = null;

const chainConfig = {
  chainNamespace: "eip155",
  chainId: "0x66eee",
  rpcTarget: "https://sepolia-rollup.arbitrum.io/rpc",
  displayName: "Arbitrum Sepolia",
  blockExplorerUrl: "https://sepolia.arbiscan.io",
  ticker: "ETH",
  tickerName: "Ethereum",
};

const clientId = import.meta.env.VITE_WEB3AUTH_CLIENT_ID;

export const initWeb3Auth = async () => {
  if (web3auth?.status === "connected" || web3auth?.status === "ready") {
    return web3auth;
  }

  try {
    const { Web3AuthNoModal } = await import("@web3auth/no-modal");
    const { AuthAdapter } = await import("@web3auth/auth-adapter");
    const { EthereumPrivateKeyProvider } = await import("@web3auth/ethereum-provider");
    const { CHAIN_NAMESPACES, WEB3AUTH_NETWORK } = await import("@web3auth/base");

    const privateKeyProvider = new EthereumPrivateKeyProvider({
      config: {
        chainConfig: {
          ...chainConfig,
          chainNamespace: CHAIN_NAMESPACES.EIP155,
        }
      },
    });

    const authAdapter = new AuthAdapter({
      adapterSettings: {
        uxMode: "popup",
      },
      privateKeyProvider,
    });

    // V9 API: Pass adapters in constructor
    web3auth = new Web3AuthNoModal({
      clientId,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
      privateKeyProvider,
      adapters: [authAdapter],
    });

    await web3auth.init();
    console.log("Web3Auth initialized:", web3auth.status);
    return web3auth;
  } catch (error) {
    console.error("Web3Auth init error:", error);
    throw error;
  }
};

export const loginWithProvider = async (loginProvider) => {
  try {
    const auth = await initWeb3Auth();
    const { WALLET_ADAPTERS } = await import("@web3auth/base");

    console.log("Connecting with provider:", loginProvider);

    const provider = await auth.connectTo("auth", {
      loginProvider: loginProvider,
    });

    const user = await auth.getUserInfo();
    console.log("Login successful:", user);
    return { provider, user, web3auth: auth };
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
};

export const loginWithGoogle = () => loginWithProvider("google");
export const loginWithFacebook = () => loginWithProvider("facebook");
export const loginWithEmail = () => loginWithProvider("email_passwordless");

export const getProvider = () => web3auth?.provider;
export const isConnected = () => web3auth?.status === "connected";
export const getUserInfo = async () => web3auth ? await web3auth.getUserInfo() : null;
export const logout = async () => { if (web3auth) await web3auth.logout(); };

export default { initWeb3Auth, loginWithGoogle, loginWithFacebook, loginWithEmail, getProvider, isConnected, getUserInfo, logout };
