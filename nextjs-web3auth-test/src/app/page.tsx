"use client";

import {
  useWeb3Auth
  , useWeb3AuthConnect, useWeb3AuthDisconnect, useWeb3AuthUser
} from '@web3auth/modal/react';
import { WALLET_CONNECTORS } from '@web3auth/modal';
import { createWalletClient, custom } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { useState, useEffect } from 'react';

export default function Home() {
  const { isConnected, provider } = useWeb3Auth();
  const { connect } = useWeb3AuthConnect();
  const { disconnect } = useWeb3AuthDisconnect();
  const { userInfo, getUserInfo } = useWeb3AuthUser();
  const [address, setAddress] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const getAddress = async () => {
      if (provider && isConnected) {
        try {
          const walletClient = createWalletClient({
            chain: arbitrumSepolia,
            transport: custom(provider),
          });
          const [addr] = await walletClient.getAddresses();
          setAddress(addr);
        } catch (err) {
          console.error("Get address error:", err);
        }
      }
    };
    getAddress();
  }, [provider, isConnected]);

  const handleLogin = async () => {
    try {
      setError("");
      await connect();
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await disconnect();
      setAddress("");
    } catch (err: any) {
      console.error("Logout error:", err);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 gap-6">
      <h1 className="text-4xl font-bold">🔐 Web3Auth React Hooks Test</h1>

      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded-lg max-w-md">
          <strong>Error:</strong> {error}
        </div>
      )}

      {!isConnected ? (
        <button
          onClick={handleLogin}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl text-xl font-semibold transition-colors"
        >
          🔑 Login với Google/Email
        </button>
      ) : (
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold text-green-600">✅ Đăng nhập thành công!</h2>
          <p><strong>Tên:</strong> {userInfo?.name || "N/A"}</p>
          <p><strong>Email:</strong> {userInfo?.email || "N/A"}</p>
          <p className="text-sm break-all"><strong>Wallet:</strong> {address}</p>
          {userInfo?.profileImage && (
            <img src={userInfo.profileImage} alt="avatar" className="w-16 h-16 rounded-full mx-auto" />
          )}
          <button
            onClick={handleLogout}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg"
          >
            Logout
          </button>
        </div>
      )}
    </main>
  );
}
