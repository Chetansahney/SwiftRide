const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const { env, isAllowedOrigin } = require('../config/env');

// Security headers. This is a JSON API, so the strictest content policy is fine.
const securityHeaders = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
});

const corsPolicy = cors({
    origin(origin, callback) {
        callback(null, isAllowedOrigin(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
    maxAge: 600,
});

const limiter = (options) =>
    rateLimit({
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        // Tests hit the same endpoints many times on purpose.
        skip: () => env.isTest,
        message: { message: 'Too many requests. Please wait a moment and try again.' },
        ...options,
    });

// Everything: generous, just stops floods.
const apiLimiter = limiter({ windowMs: 60 * 1000, limit: 300 });
// Login / sign-up / password change: slows down password guessing.
const authLimiter = limiter({ windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true });
// Anything that costs money (Google Maps) or heavy CPU (face checks).
const expensiveLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });
const faceLimiter = limiter({ windowMs: 60 * 60 * 1000, limit: 20 });
// Public trip links can be polled by contacts, but not scraped.
const publicLimiter = limiter({ windowMs: 60 * 1000, limit: 60 });

// Blocks MongoDB operator injection such as { "email": { "$ne": null } }:
// keys starting with "$" or containing "." are never valid in our requests.
function hasOperatorKeys(value, depth = 0) {
    if (depth > 10) return true;
    if (Array.isArray(value)) return value.some((item) => hasOperatorKeys(item, depth + 1));
    if (value && typeof value === 'object') {
        return Object.keys(value).some((key) => key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || hasOperatorKeys(value[key], depth + 1));
    }
    return false;
}

function rejectOperatorInjection(req, res, next) {
    if (hasOperatorKeys(req.body) || hasOperatorKeys(req.query) || hasOperatorKeys(req.params)) {
        return res.status(400).json({ message: 'Invalid request.' });
    }
    return next();
}

module.exports = {
    securityHeaders,
    corsPolicy,
    apiLimiter,
    authLimiter,
    expensiveLimiter,
    faceLimiter,
    publicLimiter,
    rejectOperatorInjection,
    hasOperatorKeys,
};
