// Theme preference context — Phase G.4 (2026-05-19).
//
// Holds the user's theme override (auto | light | dark), persisted to
// AsyncStorage under key `ehr.theme`. Default is 'auto' (follow OS).
//
// The actual palette resolution happens in `useEhrPalette()` which combines
// this preference with React Native's `useColorScheme()`.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'ehr.theme';
const DEFAULT_PREF: ThemePreference = 'auto';

interface ThemeContextValue {
    preference: ThemePreference;
    setPreference: (next: ThemePreference) => Promise<void>;
    hydrated: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
    preference: DEFAULT_PREF,
    setPreference: async () => {},
    hydrated: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [preference, setPreferenceState] = useState<ThemePreference>(DEFAULT_PREF);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEY);
                if (!cancelled && (stored === 'auto' || stored === 'light' || stored === 'dark')) {
                    setPreferenceState(stored);
                }
            } catch {
                // ignore — keep default
            } finally {
                if (!cancelled) setHydrated(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const setPreference = useCallback(async (next: ThemePreference) => {
        setPreferenceState(next);
        try {
            await AsyncStorage.setItem(STORAGE_KEY, next);
        } catch {
            // best-effort persistence
        }
    }, []);

    return (
        <ThemeContext.Provider value={{ preference, setPreference, hydrated }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useThemePreference(): ThemeContextValue {
    return useContext(ThemeContext);
}
