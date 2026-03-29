/* eslint-disable no-undef */
const g = globalThis;

if (typeof g.Buffer === 'undefined') {
  g.Buffer = require('buffer').Buffer;
}

if (typeof g.process === 'undefined') {
  g.process = require('process');
}

if (typeof g.process.version !== 'string') {
  g.process.version = 'v20.0.0';
}

if (typeof g.process.versions !== 'object' || g.process.versions === null) {
  g.process.versions = { node: '20.0.0' };
}

if (typeof g.process.browser !== 'boolean') {
  g.process.browser = true;
}

const hasFileSchemeLocation =
  typeof g.location === 'object' &&
  g.location !== null &&
  (
    String(g.location.protocol || '').toLowerCase() === 'file:' ||
    String(g.location.href || '').toLowerCase().startsWith('file://') ||
    String(g.location.origin || '').toLowerCase().startsWith('file://')
  );

if (typeof g.location !== 'object' || g.location === null || hasFileSchemeLocation) {
  // Web3Auth dynamic bundle loader expects http/https scheme.
  // Using file:// here causes LoadBundleFromServerRequestError.
  g.location = {
    protocol: 'https:',
    host: 'localhost',
    hostname: 'localhost',
    href: 'https://localhost/',
    pathname: '/',
    hash: '',
    search: '',
    origin: 'https://localhost',
    assign: () => {},
    replace: () => {},
    reload: () => {},
  };
}

if (typeof g.window === 'undefined') {
  g.window = g;
}

if (!g.window.location || String(g.window.location.protocol || '').toLowerCase() === 'file:') {
  g.window.location = g.location;
}