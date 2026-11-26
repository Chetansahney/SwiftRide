// Ratings after a ride (each side rates once) and the captain's earnings summary.
const rideModel = require('../models/ride.model');
const captainModel = require('../models/captain.models');
const userModel = require('../models/user.models');
const { HttpError } = require('../utils/httpError');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const average = (total, count) => (count ? Math.round((total / count) * 10) / 10 : null);

// Midnight today, India time.
function startOfIndiaDay(date = new Date()) {
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}

// The rider rates the captain. Only once, only for their own completed ride.
module.exports.rateCaptain = async (req, res) => {
    const { stars, comment } = req.body;
    const ride = await rideModel.findOneAndUpdate(
        { _id: req.params.rideId, user: req.user._id, status: 'completed', captain: { $ne: null }, captainRating: null },
        { captainRating: stars, ratingComment: comment || undefined },
        { new: true }
    );
    if (!ride) {
        const existing = await rideModel.findOne({ _id: req.params.rideId, user: req.user._id });
        if (!existing) throw new HttpError(404, 'Ride not found.');
        if (existing.captainRating) throw new HttpError(409, 'You already rated this ride.');
        throw new HttpError(409, 'You can rate once the ride has ended.');
    }
    await captainModel.updateOne({ _id: ride.captain }, { $inc: { ratingTotal: stars, ratingCount: 1 } });
    res.json({ ok: true, captainRating: stars });
};

// The captain rates the rider. Only once, only for their own completed ride.
module.exports.rateRider = async (req, res) => {
    const ride = await rideModel.findOneAndUpdate(
        { _id: req.params.rideId, captain: req.captain._id, status: 'completed', userRating: null },
        { userRating: req.body.stars },
        { new: true }
    );
    if (!ride) {
        const existing = await rideModel.findOne({ _id: req.params.rideId, captain: req.captain._id });
        if (!existing) throw new HttpError(404, 'Ride not found.');
        if (existing.userRating) throw new HttpError(409, 'You already rated this rider.');
        throw new HttpError(409, 'You can rate once the ride has ended.');
    }
    await userModel.updateOne({ _id: ride.user }, { $inc: { ratingTotal: req.body.stars, ratingCount: 1 } });
    res.json({ ok: true, userRating: req.body.stars });
};

// Today's earnings and rides (India day), lifetime rides and rating.
module.exports.captainStats = async (req, res) => {
    const since = startOfIndiaDay();
    const [today] = await rideModel.aggregate([
        { $match: { captain: req.captain._id, status: 'completed', endedAt: { $gte: since } } },
        { $group: { _id: null, earnings: { $sum: '$fare' }, rides: { $sum: 1 }, minutes: { $sum: { $divide: [{ $subtract: ['$endedAt', '$startedAt'] }, 60000] } } } },
    ]);
    const totalRides = await rideModel.countDocuments({ captain: req.captain._id, status: 'completed' });
    res.json({
        today: {
            earnings: Math.round(today?.earnings || 0),
            rides: today?.rides || 0,
            minutesDriving: Math.round(today?.minutes || 0),
        },
        totalRides,
        rating: average(req.captain.ratingTotal, req.captain.ratingCount),
        ratingCount: req.captain.ratingCount || 0,
        cancellations: req.captain.cancellations || 0,
        strikes: req.captain.strikes || 0,
    });
};

// The captain's recent rides, newest first.
module.exports.captainHistory = async (req, res) => {
    const rides = await rideModel
        .find({ captain: req.captain._id, status: { $in: ['completed', 'cancelled'] } })
        .sort({ createdAt: -1 })
        .limit(50)
        .select('origin destination vehicleType fare fareBreakdown status createdAt endedAt userRating captainRating paymentStatus')
        .populate('user', 'name.firstname');
    res.json(rides);
};

module.exports.startOfIndiaDay = startOfIndiaDay;
