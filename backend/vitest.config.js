import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Run tests sequentially to avoid Prisma transaction conflicts on the
        // shared test DB. Tests are fast (single inserts) so this is fine.
        fileParallelism: false,
        sequence: { concurrent: false },
        // Tests hit a real Postgres (DATABASE_URL_TEST or DATABASE_URL fallback).
        // Setting a generous timeout for Neon cold-start.
        testTimeout: 30_000,
        hookTimeout: 30_000,
        include: ['test/**/*.test.js'],
        // Load .env before tests so DATABASE_URL is available.
        setupFiles: ['./test/setup.js'],
    },
});
