const crypto = require('crypto');
const { validationResult } = require('express-validator');
const rideModel = require('../models/ride.model');
const userModel = require('../models/user.models');
const captainModel = require('../models/captain.models');
const reportModel = require('../models/report.model');
const safetyAlertModel = require('../models/safetyAlert.model');

// "Driver asked for extra" refunds are capped per report.
const MAX_EXTRA_FARE_CREDIT = 200;
// Three money/driving strikes pause a captain for review; harassment or a
// wrong-driver report pauses them straight away.
const STRIKES_BEFORE_PAUSE = 3;
// Reports are accepted up to a week after the ride.
const REPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function loadRiderRide(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return null;
    }
    const ride = await rideModel.findById(req.params.rideId);
    if (!ride || ride.user.toString() !== req.user._id.toString()) {
        res.status(404).json({ error: 'Ride not found.' });
        return null;
    }
    return ride;
}

async function raiseAlert({ ride, raisedBy, reason, location, captain }) {
    const alert = await safetyAlertModel.create({
        ride: ride._id,
        user: ride.user,
        captain: captain || ride.captain,
        raisedBy,
        reason,
        location: location?.lat != null ? { lat: location.lat, lng: location.lng } : undefined,
    });
    // Placeholder for paging the 24/7 safety team (SMS / on-call integration).
    console.warn(`[SAFETY ALERT] ${reason} on ride ${ride._id} by ${raisedBy}`, alert.location || '');
    return alert;
}

async function strikeCaptain(captainId, { pause = false } = {}) {
    if (!captainId) return;
    const captain = await captainModel.findByIdAndUpdate(captainId, { $inc: { strikes: pause ? 0 : 1 } }, { new: true });
    if (captain && (pause || captain.strikes >= STRIKES_BEFORE_PAUSE)) {
        captain.suspended = true;
        await captain.save();
    }
}

module.exports.reportRide = async (req, res) => {
    try {
        const ride = await loadRiderRide(req, res);
        if (!ride) return;
        const { type, note } = req.body;
        const amount = Math.max(0, Math.round(Number(req.body.amount) || 0));

        // Only rides that had a captain, recently, and one report of each kind per ride —
        // so reports can't be repeated for more credit or more strikes.
        if (!ride.captain || !['accepted', 'ongoing', 'completed'].includes(ride.status)) {
            return res.status(409).json({ error: 'You can report a ride once a captain has accepted it.' });
        }
        if (Date.now() - new Date(ride.createdAt).getTime() > REPORT_WINDOW_MS) {
            return res.status(409).json({ error: 'This ride is too old to report here. Please contact support.' });
        }
        if (await reportModel.exists({ ride: ride._id, type })) {
            return res.status(409).json({ error: "You've already reported this. Our team is looking into it." });
        }

        // Refund is capped and never more than the fare itself.
        const creditIssued = type === 'extra_fare' ? Math.min(amount, MAX_EXTRA_FARE_CREDIT, ride.fare || 0) : 0;

        // Saved first: the unique (ride, type) index makes a duplicate fail
        // here, before any credit or strike is given.
        let report;
        try {
            report = await reportModel.create({
                ride: ride._id,
                user: req.user._id,
                captain: ride.captain,
                type,
                amount: amount || undefined,
                note,
                creditIssued,
            });
        } catch (error) {
            if (error.code === 11000) return res.status(409).json({ error: "You've already reported this. Our team is looking into it." });
            throw error;
        }

        if (type === 'extra_fare' || type === 'unsafe_driving') {
            await strikeCaptain(ride.captain);
        } else if (type === 'harassment' || type === 'wrong_driver') {
            await strikeCaptain(ride.captain, { pause: true });
            await raiseAlert({ ride, raisedBy: 'rider', reason: type === 'wrong_driver' ? 'wrong_driver' : 'not_safe' });
        }

        let walletCredit = req.user.walletCredit || 0;
        if (creditIssued > 0) {
            const updated = await userModel.findByIdAndUpdate(req.user._id, { $inc: { walletCredit: creditIssued } }, { new: true });
            walletCredit = updated.walletCredit;
        }

        res.status(201).json({ reportId: report._id, creditIssued, walletCredit });
    } catch (error) {
        console.error('Error in reportRide:', error.message || error);
        res.status(500).json({ error: 'Could not send your report. Please try again.' });
    }
};

// Response to an "Are you okay?" prompt. "ok" is just recorded; "help" or no
// answer within 30 seconds raises an alert for the safety team.
module.exports.checkIn = async (req, res) => {
    try {
        const ride = await loadRiderRide(req, res);
        if (!ride) return;
        const { response, location } = req.body;
        if (response === 'ok') {
            return res.json({ ok: true });
        }
        const alert = await raiseAlert({
            ride,
            raisedBy: response === 'no_response' ? 'system' : 'rider',
            reason: response === 'no_response' ? 'no_response' : 'not_safe',
            location,
        });
        res.status(201).json({ alertId: alert._id });
    } catch (error) {
        console.error('Error in checkIn:', error.message || error);
        res.status(500).json({ error: 'Could not record your check-in.' });
    }
};

module.exports.riderSos = async (req, res) => {
    try {
        const ride = await loadRiderRide(req, res);
        if (!ride) return;
        const alert = await raiseAlert({
            ride,
            raisedBy: 'rider',
            reason: req.body.silent ? 'silent_sos' : 'sos',
            location: req.body.location,
        });
        res.status(201).json({ alertId: alert._id });
    } catch (error) {
        console.error('Error in riderSos:', error.message || error);
        res.status(500).json({ error: 'Could not send the alert.' });
    }
};

module.exports.captainSos = async (req, res) => {
    try {
        const ride = await rideModel.findById(req.params.rideId);
        if (!ride || ride.captain?.toString() !== req.captain._id.toString() || !['accepted', 'ongoing', 'completed'].includes(ride.status)) {
            return res.status(404).json({ error: 'Ride not found.' });
        }
        const alert = await raiseAlert({
            ride,
            raisedBy: 'captain',
            reason: req.body.silent ? 'silent_sos' : 'sos',
            location: req.body.location,
            captain: req.captain._id,
        });
        res.status(201).json({ alertId: alert._id });
    } catch (error) {
        console.error('Error in captainSos:', error.message || error);
        res.status(500).json({ error: 'Could not send the alert.' });
    }
};

// Creates (or returns) the unguessable token for this ride's live tracking link.
module.exports.shareRide = async (req, res) => {
    try {
        const ride = await loadRiderRide(req, res);
        if (!ride) return;
        if (!ride.shareToken) {
            ride.shareToken = crypto.randomBytes(16).toString('hex');
            await ride.save();
        }
        res.json({ token: ride.shareToken });
    } catch (error) {
        console.error('Error in shareRide:', error.message || error);
        res.status(500).json({ error: 'Could not create the share link.' });
    }
};

// "Is this your ride?" — the rider compares the selfie, plate and vehicle.
module.exports.verifyDriver = async (req, res) => {
    try {
        const ride = await loadRiderRide(req, res);
        if (!ride) return;
        // Answered once, at pickup, for a ride that has a captain.
        if (ride.status !== 'accepted' || !ride.captain) {
            return res.status(409).json({ error: 'You can check your driver at pickup.' });
        }
        if (typeof ride.safety?.driverConfirmed === 'boolean') {
            return res.json({ driverConfirmed: ride.safety.driverConfirmed });
        }
        const match = Boolean(req.body.match);
        ride.safety = { ...(ride.safety?.toObject?.() || {}), driverConfirmed: match };
        await ride.save();
        if (!match) {
            await reportModel.updateOne({ ride: ride._id, type: 'wrong_driver' }, { $setOnInsert: { user: req.user._id, captain: ride.captain } }, { upsert: true });
            await strikeCaptain(ride.captain, { pause: true });
            await raiseAlert({ ride, raisedBy: 'rider', reason: 'wrong_driver', location: req.body.location });
        }
        res.json({ driverConfirmed: match });
    } catch (error) {
        console.error('Error in verifyDriver:', error.message || error);
        res.status(500).json({ error: 'Could not record that.' });
    }
};

module.exports.reachedSafely = async (req, res) => {
    try {
        const ride = await loadRiderRide(req, res);
        if (!ride) return;
        if (ride.status !== 'completed') {
            return res.status(409).json({ error: 'This ride has not ended yet.' });
        }
        const safe = Boolean(req.body.safe);
        ride.safety = { ...(ride.safety?.toObject?.() || {}), reachedSafely: safe };
        await ride.save();
        if (!safe) {
            await raiseAlert({ ride, raisedBy: 'rider', reason: 'not_safe', location: req.body.location });
        }
        res.json({ reachedSafely: safe });
    } catch (error) {
        console.error('Error in reachedSafely:', error.message || error);
        res.status(500).json({ error: 'Could not record that.' });
    }
};

// Public, no login: what a trusted contact sees when they open the link.
module.exports.getSharedRide = async (req, res) => {
    try {
        const token = String(req.params.token || '');
        if (!/^[a-f0-9]{32}$/.test(token)) {
            return res.status(404).json({ error: 'Link not found.' });
        }
        const ride = await rideModel
            .findOne({ shareToken: token })
            .populate('user', 'name.firstname')
            .populate('captain', 'name.firstname vehicle location');
        if (!ride) {
            return res.status(404).json({ error: 'Link not found.' });
        }
        const live = ['accepted', 'ongoing'].includes(ride.status);
        const [lng, lat] = ride.captain?.location?.coordinates || [];
        res.json({
            status: ride.status,
            riderName: ride.user?.name?.firstname,
            origin: ride.origin,
            destination: ride.destination,
            dropPoint: ride.dropPoint,
            captain: ride.captain
                ? {
                    firstname: ride.captain.name?.firstname,
                    plate: ride.captain.vehicle?.plate,
                    color: ride.captain.vehicle?.color,
                    model: ride.captain.vehicle?.model,
                    vehicleType: ride.captain.vehicle?.vehicleType,
                }
                : null,
            location: live && lat != null && !(lat === 0 && lng === 0) ? { lat, lng } : null,
            startedAt: ride.startedAt,
            endedAt: ride.endedAt,
            endedAwayFromDrop: Boolean(ride.safety?.endedAwayFromDrop),
            updatedAt: new Date(),
        });
    } catch (error) {
        console.error('Error in getSharedRide:', error.message || error);
        res.status(500).json({ error: 'Could not load this trip.' });
    }
};
