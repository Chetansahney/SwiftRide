const userModel = require('../models/user.models');
const rideModel = require('../models/ride.model');
const accounts = require('../services/account.services');

const ACTIVE = ['requested', 'accepted', 'ongoing'];

module.exports.register = async (req, res) => {
    const { name, email, phone, password } = req.body;
    try {
        const user = await userModel.create({
            name: { firstname: name.firstname, lastname: name.lastname || undefined },
            email,
            phone,
            password: await userModel.hashPassword(password),
        });
        res.status(201).json({ user, token: user.generateAuthToken() });
    } catch (error) {
        if (accounts.isDuplicateKey(error)) {
            return res.status(409).json({ message: 'An account with this email already exists. Please log in.' });
        }
        throw error;
    }
};

module.exports.login = async (req, res) => {
    const user = await accounts.login(userModel, req.body.email, req.body.password);
    if (!user) return res.status(401).json({ message: accounts.INVALID_LOGIN });
    res.status(200).json({ user, token: user.generateAuthToken() });
};

module.exports.getUserProfile = (req, res) => {
    res.status(200).json(req.user);
};

module.exports.logout = async (req, res) => {
    await accounts.logout(req.token);
    res.status(200).json({ message: 'Logged out successfully' });
};

// Signs out every device (e.g. after a lost phone).
module.exports.logoutAll = async (req, res) => {
    await accounts.logoutEverywhere(userModel, req.user._id);
    res.status(200).json({ message: 'Logged out on all devices' });
};

module.exports.changePassword = async (req, res) => {
    const user = await accounts.changePassword(userModel, req.user._id, req.body.currentPassword, req.body.newPassword);
    if (!user) return res.status(400).json({ message: 'Current password is wrong' });
    // Other devices are now logged out; this one gets a fresh token.
    res.status(200).json({ message: 'Password changed', token: user.generateAuthToken() });
};

module.exports.updateUserProfile = async (req, res) => {
    const { name, email, phone } = req.body;
    const updates = {};
    if (name?.firstname) updates['name.firstname'] = name.firstname;
    if (name && 'lastname' in name) updates['name.lastname'] = name.lastname || undefined;
    if (email) updates.email = email;
    if (phone) updates.phone = phone;
    try {
        const user = await userModel.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
        res.status(200).json(user);
    } catch (error) {
        if (accounts.isDuplicateKey(error)) {
            return res.status(409).json({ message: 'This email is already used by another account' });
        }
        throw error;
    }
};

// Permanently deletes the rider's account and ride history, and revokes the token.
module.exports.deleteAccount = async (req, res) => {
    if (await rideModel.exists({ user: req.user._id, status: { $in: ACTIVE } })) {
        return res.status(409).json({ message: 'Finish or cancel your current ride first.' });
    }
    await rideModel.deleteMany({ user: req.user._id });
    await userModel.findByIdAndDelete(req.user._id);
    await accounts.logout(req.token);
    res.status(200).json({ message: 'Account deleted' });
};

// Replaces the rider's saved places (Home, Work, up to 10 named ones).
module.exports.updatePlaces = async (req, res) => {
    const { home, work, custom = [] } = req.body;
    const savedPlaces = {
        home: home || undefined,
        work: work || undefined,
        custom: custom.map(({ id, label, address }) => ({ id, label, address })),
    };
    const user = await userModel.findByIdAndUpdate(req.user._id, { $set: { savedPlaces } }, { new: true, runValidators: true });
    res.status(200).json(user.savedPlaces);
};

// Trusted contacts (up to 3) and safety preferences.
module.exports.updateSafety = async (req, res) => {
    const updates = {};
    if (Array.isArray(req.body.trustedContacts)) {
        updates.trustedContacts = req.body.trustedContacts.map(({ name, phone }) => ({ name, phone }));
    }
    const prefs = req.body.safetyPrefs || {};
    if (typeof prefs.travellingAsWoman === 'boolean') updates['safetyPrefs.travellingAsWoman'] = prefs.travellingAsWoman;
    if (typeof prefs.shareAtNight === 'boolean') updates['safetyPrefs.shareAtNight'] = prefs.shareAtNight;
    const user = await userModel.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
    res.status(200).json(user);
};
