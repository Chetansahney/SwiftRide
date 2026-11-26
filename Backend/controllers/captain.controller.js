const captainModel = require('../models/captain.models');
const rideModel = require('../models/ride.model');
const accounts = require('../services/account.services');
const { normalise } = require('../services/verificationProvider');

const ACTIVE = ['accepted', 'ongoing'];

module.exports.register = async (req, res) => {
    const { name, email, password, vehicle, gender } = req.body;
    try {
        const captain = await captainModel.create({
            name: { firstname: name.firstname, lastname: name.lastname || undefined },
            email,
            password: await captainModel.hashPassword(password),
            gender: ['female', 'male', 'other'].includes(gender) ? gender : undefined,
            vehicle: {
                color: vehicle.color,
                model: vehicle.model,
                plate: normalise(vehicle.plate),
                capacity: vehicle.capacity,
                vehicleType: vehicle.vehicleType,
            },
        });
        res.status(201).json({ captain, token: captain.generateAuthToken() });
    } catch (error) {
        if (accounts.isDuplicateKey(error)) {
            const plate = Object.keys(error.keyPattern || {}).some((key) => key.includes('plate'));
            return res.status(409).json({
                message: plate ? 'This vehicle number is already registered.' : 'An account with this email already exists. Please log in.',
            });
        }
        throw error;
    }
};

module.exports.loginCaptain = async (req, res) => {
    const captain = await accounts.login(captainModel, req.body.email, req.body.password);
    if (!captain) return res.status(401).json({ message: accounts.INVALID_LOGIN });
    res.status(200).json({ captain, token: captain.generateAuthToken() });
};

module.exports.getCaptainProfile = (req, res) => {
    res.status(200).json({ captain: req.captain });
};

module.exports.logoutCaptain = async (req, res) => {
    await accounts.logout(req.token);
    await captainModel.updateOne({ _id: req.captain._id }, { status: 'unavailable', socketId: null });
    res.status(200).json({ message: 'Logged out successfully' });
};

module.exports.logoutAll = async (req, res) => {
    await accounts.logoutEverywhere(captainModel, req.captain._id);
    await captainModel.updateOne({ _id: req.captain._id }, { status: 'unavailable', socketId: null });
    res.status(200).json({ message: 'Logged out on all devices' });
};

module.exports.changePassword = async (req, res) => {
    const captain = await accounts.changePassword(captainModel, req.captain._id, req.body.currentPassword, req.body.newPassword);
    if (!captain) return res.status(400).json({ message: 'Current password is wrong' });
    res.status(200).json({ message: 'Password changed', token: captain.generateAuthToken() });
};

// Removes the captain's account and personal data. Past rides stay for the
// riders' history but no longer point to the deleted account.
module.exports.deleteAccount = async (req, res) => {
    if (await rideModel.exists({ captain: req.captain._id, status: { $in: ACTIVE } })) {
        return res.status(409).json({ message: 'Finish your current ride first.' });
    }
    await rideModel.updateMany({ captain: req.captain._id }, { $unset: { captain: 1 } });
    await captainModel.findByIdAndDelete(req.captain._id);
    await accounts.logout(req.token);
    res.status(200).json({ message: 'Account deleted' });
};

// Gender (optional) and, for women captains, "women riders only".
module.exports.updateSettings = async (req, res) => {
    const updates = {};
    if (req.body.gender !== undefined) updates.gender = req.body.gender || undefined;
    const gender = updates.gender !== undefined ? updates.gender : req.captain.gender;
    if (req.body.womenRidersOnly !== undefined) {
        updates.womenRidersOnly = gender === 'female' && Boolean(req.body.womenRidersOnly);
    } else if (gender !== 'female') {
        updates.womenRidersOnly = false;
    }
    const captain = await captainModel.findByIdAndUpdate(req.captain._id, { $set: updates }, { new: true, runValidators: true });
    res.status(200).json({ captain });
};
