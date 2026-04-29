/**
 * Loaded via jest.e2e.config.ts `setupFiles` — runs in the test worker
 * before ANY module is imported, so process.env is available to PrismaService/JwtModule.
 */
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/luxgrimoire_test';
process.env.JWT_SECRET = 'test-secret-e2e-at-least-32-chars!';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = ''; // force in-memory cache (no Redis needed for e2e)
process.env.CLOUDINARY_CLOUD_NAME = 'test';
process.env.CLOUDINARY_API_KEY = 'test';
process.env.CLOUDINARY_API_SECRET = 'test';
process.env.OPENAI_API_KEY = 'test';
process.env.TYPESENSE_HOST = 'localhost';
process.env.TYPESENSE_PORT = '8108';
process.env.TYPESENSE_API_KEY = 'test';
