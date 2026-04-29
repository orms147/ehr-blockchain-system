// Test setup — loads .env so DATABASE_URL is available to Prisma.
//
// Tests hit a real Postgres. Use the same DATABASE_URL as dev (Neon) but
// scope all writes to randomly-generated test cidHashes/addresses so we
// never collide with real data, and clean up at the end of each test.
//
// To run against a separate test branch, set DATABASE_URL_TEST in .env and
// override here:
import 'dotenv/config';

if (process.env.DATABASE_URL_TEST) {
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
