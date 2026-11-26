// Login, logout and password changes, shared by riders and captains.
const bcrypt = require('bcrypt');
const blacklistTokenModel = require('../models/blacklistTokens.model');
const { hashToken } = require('../utils/tokens');

// Compared against when the email doesn't exist, so a wrong email takes as
// long as a wrong password and response times don't reveal who has an account.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const INVALID_LOGIN = 'Invalid email or password';

async function login(model, email, password) {
    const account = await model.findOne({ email }).select('+password');
    const ok = await bcrypt.compare(password, account?.password || DUMMY_HASH);
    return ok && account ? account : null;
}

async function logout(token) {
    if (!token) return;
    await blacklistTokenModel.updateOne({ token: hashToken(token) }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
}

// Checks the current password, stores the new one and revokes every older token.
async function changePassword(model, accountId, currentPassword, newPassword) {
    const account = await model.findById(accountId).select('+password');
    if (!account || !(await bcrypt.compare(currentPassword, account.password))) return null;
    account.password = await model.hashPassword(newPassword);
    account.tokenVersion = (account.tokenVersion || 0) + 1;
    await account.save();
    return account;
}

async function logoutEverywhere(model, accountId) {
    return model.findByIdAndUpdate(accountId, { $inc: { tokenVersion: 1 } }, { new: true });
}

const isDuplicateKey = (error) => error?.code === 11000;

module.exports = { login, logout, changePassword, logoutEverywhere, isDuplicateKey, INVALID_LOGIN };
