import Constants from 'expo-constants';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3001';

// Single source of truth for the app version = app.json `version` (1.0.0),
// surfaced via expo-constants so every UI display stays in sync (no hardcoded
// drift). NOTE: this is the APP version — distinct from the subgraph version
// (0.3.0) and the contract deployment, which are independent artifacts.
export const APP_CONFIG = {
    name: Constants.expoConfig?.name ?? 'ViEH',
    version: Constants.expoConfig?.version ?? '1.0.0',
};
