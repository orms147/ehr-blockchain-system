// WalletIcons — icon ví TRÍCH NGUYÊN VĂN từ design "ViEH Login (standalone).html"
// (bộ web3icons chính thức, nhúng gzip+base64 trong __bundler/manifest).
// Render bằng <SvgXml> để khớp 100% design. ⚠️ KHÔNG vẽ tay.
//
// UI-only: nút ví đang STUB (xem context/28_wallet_login_integration.md).

import React from 'react';
import { SvgXml } from 'react-native-svg';

type IconProps = { size?: number };

const METAMASK = `<svg fill="none" viewBox="0 0 24 24"><path fill="#FF5C16" d="m19.821 19.918-3.877-1.131-2.924 1.712h-2.04l-2.926-1.712-3.875 1.13L3 16.02l1.179-4.327L3 8.034 4.179 3.5l6.056 3.544h3.53L19.821 3.5 21 8.034l-1.179 3.658L21 16.02z"/><path fill="#FF5C16" d="m4.18 3.5 6.055 3.547-.24 2.434zm3.875 12.52 2.665 1.99-2.665.777zm2.452-3.286-.512-3.251-3.278 2.21h-.002v.001l.01 2.275 1.33-1.235zM19.82 3.5l-6.056 3.547.24 2.434zm-3.875 12.52-2.665 1.99 2.665.777zm1.339-4.326v-.002zl-3.279-2.21-.512 3.25h2.451l1.33 1.236z"/><path fill="#E34807" d="m8.054 18.787-3.875 1.13L3 16.022h5.054zm2.452-6.054.74 4.7-1.026-2.614-3.497-.85 1.33-1.236zm5.44 6.054 3.875 1.13L21 16.022h-5.055zm-2.452-6.054-.74 4.7 1.026-2.614 3.497-.85-1.331-1.236z"/><path fill="#FF8D5D" d="m3 16.02 1.179-4.328h2.535l.01 2.276 3.496.85 1.026 2.613-.527.576-2.665-1.989H3zm18 0-1.179-4.328h-2.535l-.01 2.276-3.496.85-1.026 2.613.527.576 2.665-1.989H21zm-7.235-8.976h-3.53l-.24 2.435 1.251 7.95h1.508l1.252-7.95z"/><path fill="#661800" d="M4.179 3.5 3 8.034l1.179 3.658h2.535l3.28-2.211zm5.594 10.177H8.625l-.626.6 2.222.54zM19.821 3.5 21 8.034l-1.179 3.658h-2.535l-3.28-2.211zm-5.593 10.177h1.15l.626.6-2.224.541zm-1.209 5.271.262-.94-.527-.575h-1.509l-.527.575.262.94"/><path fill="#C0C4CD" d="M13.02 18.948V20.5h-2.04v-1.552z"/><path fill="#E7EBF6" d="m8.055 18.785 2.927 1.714v-1.552l-.262-.94zm7.89 0L13.02 20.5v-1.552l.262-.94z"/></svg>`;

const WALLETCONNECT = `<svg fill="none" viewBox="0 0 24 24"><path fill="#3B99FC" d="M6.685 8.71c2.935-2.813 7.695-2.813 10.63 0l.353.339a.35.35 0 0 1 0 .51l-1.208 1.158a.194.194 0 0 1-.266 0l-.486-.466c-2.048-1.963-5.368-1.963-7.416 0l-.52.498a.194.194 0 0 1-.266 0L6.297 9.592a.35.35 0 0 1 0-.51zm13.13 2.396 1.075 1.03a.35.35 0 0 1 0 .51l-4.85 4.648a.39.39 0 0 1-.531 0l-3.443-3.299a.097.097 0 0 0-.132 0l-3.442 3.3a.39.39 0 0 1-.532 0l-4.85-4.65a.35.35 0 0 1 0-.508l1.076-1.031a.387.387 0 0 1 .531 0l3.442 3.299a.097.097 0 0 0 .133 0l3.442-3.3a.387.387 0 0 1 .532 0l3.442 3.3a.097.097 0 0 0 .133 0l3.442-3.3a.39.39 0 0 1 .531 0"/></svg>`;

const COINBASE = `<svg fill="none" viewBox="0 0 24 24"><path fill="#0E5BFF" d="M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0"/><path fill="#fff" fill-rule="evenodd" d="M12 18.375a6.375 6.375 0 1 0 0-12.75 6.375 6.375 0 0 0 0 12.75m-.75-8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125h1.5c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125z" clip-rule="evenodd"/></svg>`;

const PHANTOM = `<svg fill="none" viewBox="0 0 24 24"><path fill="#AB9FF2" d="M5.13 19.2c2.297 0 4.023-1.92 5.053-3.436a2.9 2.9 0 0 0-.195.994c0 .885.53 1.516 1.574 1.516 1.433 0 2.965-1.208 3.758-2.51a2 2 0 0 0-.083.524c0 .617.362 1.006 1.1 1.006 2.324 0 4.663-3.959 4.663-7.421C21 7.175 19.58 4.8 16.016 4.8 9.752 4.8 3 12.154 3 16.905 3 18.771 4.044 19.2 5.13 19.2m8.729-9.622c0-.671.39-1.141.96-1.141.557 0 .947.47.947 1.14 0 .672-.39 1.155-.947 1.155-.57 0-.96-.483-.96-1.154m2.979 0c0-.671.39-1.141.96-1.141.557 0 .947.47.947 1.14 0 .672-.39 1.155-.947 1.155-.57 0-.96-.483-.96-1.154"/></svg>`;

const TRUST = `<svg fill="none" viewBox="0 0 24 24"><path fill="#0500FF" d="M3.9 5.6 12 3v18c-5.786-2.4-8.1-7-8.1-9.6z"/><path fill="url(#trust__a)" d="M20.1 5.6 12 3v18c5.786-2.4 8.1-7 8.1-9.6z"/><defs><linearGradient id="trust__a" x1="17.948" x2="11.967" y1="1.74" y2="20.797" gradientUnits="userSpaceOnUse"><stop offset=".02" stop-color="#00F"/><stop offset=".08" stop-color="#0094FF"/><stop offset=".16" stop-color="#48FF91"/><stop offset=".42" stop-color="#0094FF"/><stop offset=".68" stop-color="#0038FF"/><stop offset=".9" stop-color="#0500FF"/></linearGradient></defs></svg>`;

const make = (xml: string) => ({ size = 24 }: IconProps) => <SvgXml xml={xml} width={size} height={size} />;

export const MetaMaskIcon = make(METAMASK);
export const WalletConnectIcon = make(WALLETCONNECT);
export const CoinbaseIcon = make(COINBASE);
export const PhantomIcon = make(PHANTOM);
export const TrustIcon = make(TRUST);
