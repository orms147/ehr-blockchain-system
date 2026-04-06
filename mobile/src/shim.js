import 'react-native-get-random-values';
import * as ExpoCrypto from 'expo-crypto';
import { Buffer } from 'buffer';
import forge from 'node-forge';
import { URL as PolyfilledURL } from 'react-native-url-polyfill';

const g = globalThis;

if (typeof g.crypto === 'undefined') {
    g.crypto = {};
}

if (typeof g.crypto.getRandomValues !== 'function') {
    g.crypto.getRandomValues = ExpoCrypto.getRandomValues;
}

const normalizeDigestAlgorithm = (algorithm) => {
    const value = typeof algorithm === 'string' ? algorithm : algorithm?.name;
    const normalized = String(value || '').toUpperCase().replace('_', '-');

    if (normalized === 'SHA-1') return ExpoCrypto.CryptoDigestAlgorithm.SHA1;
    if (normalized === 'SHA-256') return ExpoCrypto.CryptoDigestAlgorithm.SHA256;
    if (normalized === 'SHA-384') return ExpoCrypto.CryptoDigestAlgorithm.SHA384;
    if (normalized === 'SHA-512') return ExpoCrypto.CryptoDigestAlgorithm.SHA512;

    return ExpoCrypto.CryptoDigestAlgorithm.SHA256;
};

const getAlgorithmName = (algorithm) => {
    if (typeof algorithm === 'string') return algorithm.toUpperCase();
    return String(algorithm?.name || '').toUpperCase();
};

if (typeof g.crypto.subtle === 'undefined') {
    g.crypto.subtle = {};
}

if (typeof g.crypto.subtle.digest !== 'function') {
    g.crypto.subtle.digest = async (algorithm, data) => {
        const algo = normalizeDigestAlgorithm(algorithm);
        const input = data instanceof Uint8Array ? data : new Uint8Array(data);
        return ExpoCrypto.digest(algo, input);
    };
}

const toUint8Array = (input) => {
    if (input instanceof Uint8Array) return input;
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    return new Uint8Array(input || []);
};

const uint8ToBinary = (bytes) => {
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
};

const binaryToUint8 = (binary) => {
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
};

if (typeof g.crypto.subtle.importKey !== 'function') {
    g.crypto.subtle.importKey = async (_format, keyData, algorithm, _extractable, usages) => ({
        type: 'secret',
        algorithm,
        usages: usages || [],
        keyData: toUint8Array(keyData),
    });
}

if (typeof g.crypto.subtle.encrypt !== 'function') {
    g.crypto.subtle.encrypt = async (algorithm, cryptoKey, data) => {
        const algoName = getAlgorithmName(algorithm);
        if (algoName !== 'AES-CBC') throw new Error('Only AES-CBC is supported in subtle.encrypt polyfill');

        const keyBytes = toUint8Array(cryptoKey?.keyData);
        const ivBytes = toUint8Array(algorithm?.iv);
        const dataBytes = toUint8Array(data);

        const cipher = forge.cipher.createCipher('AES-CBC', uint8ToBinary(keyBytes));
        cipher.start({ iv: uint8ToBinary(ivBytes) });
        cipher.update(forge.util.createBuffer(uint8ToBinary(dataBytes)));
        const ok = cipher.finish();
        if (!ok) throw new Error('AES-CBC encrypt failed');

        return binaryToUint8(cipher.output.getBytes()).buffer;
    };
}

if (typeof g.crypto.subtle.decrypt !== 'function') {
    g.crypto.subtle.decrypt = async (algorithm, cryptoKey, data) => {
        const algoName = getAlgorithmName(algorithm);
        if (algoName !== 'AES-CBC') throw new Error('Only AES-CBC is supported in subtle.decrypt polyfill');

        const keyBytes = toUint8Array(cryptoKey?.keyData);
        const ivBytes = toUint8Array(algorithm?.iv);
        const dataBytes = toUint8Array(data);

        const decipher = forge.cipher.createDecipher('AES-CBC', uint8ToBinary(keyBytes));
        decipher.start({ iv: uint8ToBinary(ivBytes) });
        decipher.update(forge.util.createBuffer(uint8ToBinary(dataBytes)));
        const ok = decipher.finish();
        if (!ok) throw new Error('AES-CBC decrypt failed');

        return binaryToUint8(decipher.output.getBytes()).buffer;
    };
}

if (typeof g.crypto.subtle.sign !== 'function') {
    g.crypto.subtle.sign = async (algorithm, cryptoKey, data) => {
        const algoName = getAlgorithmName(algorithm) || getAlgorithmName(cryptoKey?.algorithm);
        if (algoName !== 'HMAC') throw new Error('Only HMAC is supported in subtle.sign polyfill');

        const hashName = normalizeDigestAlgorithm(
            algorithm?.hash?.name || cryptoKey?.algorithm?.hash?.name || 'SHA-256'
        );
        const keyBytes = toUint8Array(cryptoKey?.keyData);
        const dataBytes = toUint8Array(data);

        const hmac = forge.hmac.create();
        hmac.start(String(hashName || 'sha256').replace('SHA', 'sha').replace('-', ''), uint8ToBinary(keyBytes));
        hmac.update(uint8ToBinary(dataBytes));
        return binaryToUint8(hmac.digest().getBytes()).buffer;
    };
}

if (typeof g.crypto.subtle.verify !== 'function') {
    g.crypto.subtle.verify = async (algorithm, cryptoKey, signature, data) => {
        const expected = new Uint8Array(await g.crypto.subtle.sign(algorithm, cryptoKey, data));
        const actual = toUint8Array(signature);
        if (expected.length !== actual.length) return false;
        let diff = 0;
        for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ actual[i];
        return diff === 0;
    };
}

// Polyfill global Buffer
if (typeof g.Buffer === 'undefined') {
    g.Buffer = Buffer;
}

// Polyfill global process
if (typeof g.process === 'undefined') {
    g.process = {};
}

if (typeof g.process.env === 'undefined') {
    g.process.env = { NODE_ENV: 'development' };
}

if (typeof g.process.nextTick !== 'function') {
    g.process.nextTick = (fn, ...args) => {
        queueMicrotask(() => fn(...args));
    };
}

if (!Array.isArray(g.process.argv)) {
    g.process.argv = [];
}

if (typeof g.process.version !== 'string') {
    g.process.version = 'v20.0.0';
}

if (typeof g.process.versions !== 'object' || g.process.versions === null) {
    g.process.versions = { node: '20.0.0' };
} else if (typeof g.process.versions.nođể !== 'string') {
    g.process.versions.nođể = '20.0.0';
}

if (typeof g.process.browser !== 'boolean') {
    g.process.browser = true;
}

const patchUrlProperty = (propertyName) => {
    const descriptor = Object.getOwnPropertyDescriptor(PolyfilledURL.prototype, propertyName);
    if (!descriptor || typeof descriptor.get !== 'function') {
        return;
    }

    Object.defineProperty(PolyfilledURL.prototype, propertyName, {
        configurable: true,
        enumerable: descriptor.enumerable ?? true,
        get() {
            const value = descriptor.get.call(this);
            return typeof value === 'string' ? value : '';
        },
        set(value) {
            if (typeof descriptor.set === 'function') {
                descriptor.set.call(this, value);
            }
        },
    });
};

patchUrlProperty('search');
patchUrlProperty('hash');

