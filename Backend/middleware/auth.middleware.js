const userModel = require('../models/user.models');
const captainModel = require('../models/captain.models');
const blacklistTokenModel = require('../models/blacklistTokens.model');
const { verifyToken, tokenFromRequest, hashToken } = require('../utils/tokens');

const unauthorised = (res) => res.status(401).json({ message: 'Please log in again.' });

// Resolves the account behind a request's token, or null. Checks signature,
// expiry, role, logout blacklist and token version (password changes).
async function resolveAccount(token, role) {
    if (!token) return null;
    let payload;
    try {
        payload = verifyToken(token);
    } catch {
        return null;
    }
    if (payload.role !== role || typeof payload._id !== 'string') return null;
    if (await blacklistTokenModel.exists({ token: hashToken(token) })) return null;
    const model = role === 'captain' ? captainModel : userModel;
    const account = await model.findById(payload._id).catch(() => null);
    if (!account || (account.tokenVersion || 0) !== (payload.tv || 0)) return null;
    return account;
}

function requireRole(role) {
    const key = role === 'captain' ? 'captain' : 'user';
    return async (req, res, next) => {
        const token = tokenFromRequest(req);
        const account = await resolveAccount(token, role);
        if (!account) return unauthorised(res);
        req[key] = account;
        req.token = token;
        return next();
    };
}

module.exports.authUser = requireRole('user');
module.exports.authCaptain = requireRole('captain');
module.exports.resolveAccount = resolveAccount;
