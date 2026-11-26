// Reads and checks configuration once at startup, so a missing secret fails
// loudly instead of silently weakening security.
const isProduction = process.env.NODE_ENV === 'production';

function list(value) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim().replace(/\/$/, ''))
        .filter(Boolean);
}

const env = {
    isProduction,
    isTest: process.env.NODE_ENV === 'test',
    port: Number(process.env.PORT) || 3000,
    dbUri: process.env.DB_CONNECT,
    jwtSecret: process.env.JWT_SECRET,
    // Comma-separated sites allowed to call the API, e.g.
    // "https://swiftride-red.vercel.app,http://localhost:5173".
    corsOrigins: list(process.env.CORS_ORIGINS),
};

function checkEnv() {
    const problems = [];
    if (!env.jwtSecret) problems.push('JWT_SECRET is not set.');
    else if (env.jwtSecret.length < 32) problems.push('JWT_SECRET should be at least 32 random characters.');
    if (!env.dbUri && !env.isTest) problems.push('DB_CONNECT is not set.');
    if (isProduction && !env.corsOrigins.length) problems.push('CORS_ORIGINS is not set: no website will be able to call the API.');

    if (!problems.length) return;
    // Refuse to start in production with a weak or missing secret; warn in development.
    const fatal = isProduction && problems.some((p) => p.startsWith('JWT_SECRET') || p.startsWith('DB_CONNECT'));
    for (const problem of problems) console[fatal ? 'error' : 'warn'](`[config] ${problem}`);
    if (fatal) process.exit(1);
}

// In development, also allow any localhost port so the Vite dev server works.
function isAllowedOrigin(origin) {
    if (!origin) return true; // same-origin, curl, mobile apps
    if (env.corsOrigins.includes(origin)) return true;
    return !isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

module.exports = { env, checkEnv, isAllowedOrigin };
