const fs = require('fs');
const path = require('path');

const root = process.cwd();
const nodeMajor = Number(process.versions.node.split('.')[0]);
const errors = [];
const warnings = [];

if (nodeMajor !== 20) {
  errors.push(
    `Node.js ${process.versions.node} is not supported for this app. Use Node 20.x LTS.`
  );
}

const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  if (!/^EXPO_PUBLIC_WEB3AUTH_CLIENT_ID\s*=\s*.+/m.test(envText)) {
    errors.push('Missing EXPO_PUBLIC_WEB3AUTH_CLIENT_ID in .env');
  }
  if (!/^EXPO_PUBLIC_API_URL\s*=\s*.+/m.test(envText)) {
    warnings.push('Missing EXPO_PUBLIC_API_URL in .env (default fallback will be used).');
  }
} else {
  errors.push('Missing .env file at project root.');
}

const appJsonPath = path.join(root, 'app.json');
if (fs.existsSync(appJsonPath)) {
  const appRaw = fs.readFileSync(appJsonPath, 'utf8').replace(/^\uFEFF/, '');
  const app = JSON.parse(appRaw);
  const expo = app.expo || {};
  if (!expo.scheme) {
    errors.push('Missing expo.scheme in app.json (required for Web3Auth redirect).');
  }
  if (!expo.android || !expo.android.package) {
    errors.push('Missing expo.android.package in app.json (required for run:android).');
  }
} else {
  errors.push('Missing app.json at project root.');
}

const packageJsonPath = path.join(root, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageRaw = fs.readFileSync(packageJsonPath, 'utf8').replace(/^\uFEFF/, '');
  const packageJson = JSON.parse(packageRaw);
  const deps = packageJson.dependencies || {};
  const sdkVersion = String(deps['@web3auth/react-native-sdk'] || '');
  const providerVersion = String(deps['@web3auth/ethereum-provider'] || '');

  const normalize = (value) => value.replace(/^[^\d]*/, '').split('.').slice(0, 2).join('.');
  if (sdkVersion && providerVersion && normalize(sdkVersion) !== normalize(providerVersion)) {
    warnings.push(
      `Web3Auth package mismatch: @web3auth/react-native-sdk (${sdkVersion}) vs @web3auth/ethereum-provider (${providerVersion}). Consider pinning both to the same major/minor version.`
    );
  }
}

const fullPath = root;
if (fullPath.length > 100) {
  warnings.push(
    `Project path is long (${fullPath.length} chars). Consider short path like C:\\dev\\ehr-mobile to avoid Windows path issues.`
  );
}

if (warnings.length) {
  console.log('\n[preflight] Warnings:');
  for (const item of warnings) console.log(`  - ${item}`);
}

if (errors.length) {
  console.error('\n[preflight] Failed:');
  for (const item of errors) console.error(`  - ${item}`);
  console.error('\nFix these issues, then rerun the command.');
  process.exit(1);
}

console.log('[preflight] OK');
