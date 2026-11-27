const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const TOKEN_TTL = '24h';
const ALGORITHM = 'HS256';

// Every token says who it is for ("user" = rider, "captain") and carries the
// account's tokenVersion, so a rider token can't open captain routes and a
// password change / "log out everywhere" revokes every older token.
function signToken(role, account) {
    return jwt.sign({ _id: String(account._id), role, tv: account.tokenVersion || 0 }, process.env.JWT_SECRET, {
        expiresIn: TOKEN_TTL,
        algorithm: ALGORITHM,
        jwtid: crypto.randomUUID(),
    });
}

function verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALGORITHM] });
}

// "Bearer <token>" only. Cookies aren't used, which also rules out CSRF.
function tokenFromRequest(req) {
    const header = req.headers?.authorization;
    if (typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token && token.length < 2048 ? token : null;
}

// Logged-out tokens are stored hashed, never as usable tokens.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { signToken, verifyToken, tokenFromRequest, hashToken, TOKEN_TTL };
