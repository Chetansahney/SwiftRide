const ridemodel = require('../models/ride.model');
const captainModel = require('../models/captain.models');
const userModel = require('../models/user.models');
const mapsService = require('../services/maps.services');
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { HttpError } = require("../utils/httpError");
const { currentShiftWindow } = require("../utils/shiftWindow");

async function getOTP(num = 4) {
    const length = Number.isInteger(num) && num > 0 ? num : 4;
    let otp = "";
    for (let i = 0; i < length; i += 1) {
        otp += crypto.randomInt(0, 10).toString();
    }
    const hash = await bcrypt.hash(otp, 10);
    return { otp, hash };
}

function parseDistanceKm(distanceText) {
    const text = String(distanceText).toLowerCase().trim();
    if (text.includes("km")) {
        const value = parseFloat(text.replace(/[^0-9.]/g, ""));
        if (Number.isNaN(value)) throw new Error("Invalid distance value.");
        return value;
    }
    if (text.includes("m")) {
        const value = parseFloat(text.replace(/[^0-9.]/g, ""));
        if (Number.isNaN(value)) throw new Error("Invalid distance value.");
        return value / 1000;
    }
    throw new Error("Unsupported distance format.");
}

function parseDurationMin(durationText) {
    const text = String(durationText).toLowerCase().trim();
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*hour/);
    const minMatch = text.match(/(\d+(?:\.\d+)?)\s*min/);
    const hours = hourMatch ? parseFloat(hourMatch[1]) : 0;
    const mins = minMatch ? parseFloat(minMatch[1]) : 0;
    const total = hours * 60 + mins;
    if (Number.isNaN(total) || total <= 0) throw new Error("Invalid duration value.");
    return total;
}

const RATES = {
    moto: { base: 20, perKm: 8, perMin: 1 },
    auto: { base: 30, perKm: 12, perMin: 1.5 },
    car: { base: 50, perKm: 18, perMin: 2 },
};

// Return-trip fee: paid 100% to the driver when the drop is somewhere they
// usually drive back from empty (few other captains nearby, or a long trip
// out). Shown to the rider upfront so the driver has no reason to ask for more.
const RETURN_FEE = {
    shareOfDistanceFare: 0.3,
    min: { moto: 15, auto: 20, car: 30 },
    max: { moto: 40, auto: 60, car: 90 },
    lowDemandCaptains: 2, // fewer than this within LOW_DEMAND_RADIUS → low demand
    lowDemandRadiusMeters: 3000,
    longTripKm: 12,
};

// Night charge (10 pm – 6 am India time), shown as its own line.
const NIGHT_SHARE = 0.2;

// Waiting: first 3 minutes after the captain arrives are free, then per minute.
const FREE_WAIT_MIN = 3;
const WAIT_PER_MIN = { moto: 1, auto: 1.5, car: 2 };
const MAX_WAITING_FEE = 60;

const MAX_TIP = 200;

// Ride Guarantee: a captain dropping an accepted ride earns the rider this credit.
const GUARANTEE_CREDIT = 50;
module.exports.GUARANTEE_CREDIT = GUARANTEE_CREDIT;

function isNightInIndia(date = new Date()) {
    const istHour = (date.getUTCHours() + 5.5 + (date.getUTCMinutes() / 60)) % 24;
    return istHour >= 22 || istHour < 6;
}

async function dropIsLowDemand(dropPoint) {
    if (!dropPoint) return false;
    const nearby = await mapsService.countCaptainsNear(dropPoint.lat, dropPoint.lng, RETURN_FEE.lowDemandRadiusMeters);
    return nearby < RETURN_FEE.lowDemandCaptains;
}

async function geocodePoint(address) {
    try {
        const { latitude, longitude } = await mapsService.getLocationCoordinates(address);
        return { lat: latitude, lng: longitude };
    } catch (error) {
        console.warn('Could not geocode', address, '-', error.message);
        return null;
    }
}

// Fare per vehicle type plus the breakdown the rider sees. Returns
// { moto, auto, car, breakdown: { moto: { ride, returnFee, nightFee }, ... }, returnFeeReason, isNight }.
async function calculateFare(origin, destination, { at = new Date(), dropPoint } = {}) {
    if (!origin || !destination) {
        throw new Error("Origin and destination are required to calculate fare.");
    }
    const distTime = await mapsService.getDistanceTime(origin, destination);
    if (!distTime || !distTime.distance || !distTime.duration) {
        throw new Error("Distance and duration are required to calculate fare.");
    }

    const distanceKm = parseDistanceKm(distTime.distance);
    const durationMin = parseDurationMin(distTime.duration);
    const drop = dropPoint !== undefined ? dropPoint : await geocodePoint(destination);
    const lowDemand = await dropIsLowDemand(drop).catch(() => false);
    const longTrip = distanceKm >= RETURN_FEE.longTripKm;
    const returnFeeApplies = lowDemand || longTrip;
    const night = isNightInIndia(at);

    const result = { breakdown: {} };
    for (const [type, rate] of Object.entries(RATES)) {
        const ride = Math.round(rate.base + distanceKm * rate.perKm + durationMin * rate.perMin);
        const returnFee = returnFeeApplies
            ? Math.round(Math.min(RETURN_FEE.max[type], Math.max(RETURN_FEE.min[type], distanceKm * rate.perKm * RETURN_FEE.shareOfDistanceFare)))
            : 0;
        const nightFee = night ? Math.round(ride * NIGHT_SHARE) : 0;
        result[type] = ride + returnFee + nightFee;
        result.breakdown[type] = { ride, returnFee, nightFee };
    }
    result.returnFeeReason = returnFeeApplies ? (lowDemand ? 'low_demand' : 'long_trip') : null;
    result.isNight = night;
    return result;
}

module.exports.calculateFare = calculateFare;
module.exports.isNightInIndia = isNightInIndia;

// ---------- ride lifecycle ----------
//
// requested → accepted → ongoing → completed, or → cancelled.
// Every step is a single conditional update ("only if the ride is still in
// state X and belongs to you"), so two phones can't race each other into a
// bad state and nobody can act on someone else's ride.

const ACTIVE_RIDER = ['requested', 'accepted', 'ongoing'];
const ACTIVE_CAPTAIN = ['accepted', 'ongoing'];
const REQUEST_TTL_MS = 10 * 60 * 1000; // unanswered requests expire after 10 minutes
const MAX_OTP_ATTEMPTS = 5;

const normalizeType = (type) => (type === 'bike' ? 'moto' : type);

// Requests nobody accepted in time are closed, so the rider can book again.
async function expireStaleRequests(filter = {}) {
    await ridemodel.updateMany(
        {
            ...filter,
            status: 'requested',
            $or: [
                { requestedAt: { $lt: new Date(Date.now() - REQUEST_TTL_MS) } },
                { requestedAt: null, createdAt: { $lt: new Date(Date.now() - REQUEST_TTL_MS) } },
            ],
        },
        { status: 'cancelled', cancelledBy: 'system', cancelReason: 'no_captain', cancelledAt: new Date(), paymentStatus: 'not_charged' }
    );
}
module.exports.expireStaleRequests = expireStaleRequests;

module.exports.createRide = async ({ user, origin, destination, vehicleType, preferWomenCaptain = false, riderIsWoman = false }) => {
    await expireStaleRequests({ user });
    const active = await ridemodel.findOne({ user, status: { $in: ACTIVE_RIDER } }).select('_id');
    if (active) {
        throw new HttpError(409, 'You already have a ride in progress.', { rideId: active._id });
    }

    const type = normalizeType(vehicleType);
    const [pickupPoint, dropPoint] = await Promise.all([geocodePoint(origin), geocodePoint(destination)]);
    if (!pickupPoint) throw new HttpError(400, "We couldn't find that pickup location.");
    const { otp, hash } = await getOTP();
    const fare = await calculateFare(origin, destination, { dropPoint });
    const breakdown = fare.breakdown[type] || fare.breakdown.car;

    const ride = await ridemodel.create({
        user,
        origin,
        destination,
        pickupPoint,
        dropPoint: dropPoint || undefined,
        vehicleType: fare.breakdown[type] ? type : 'car',
        otp: hash,
        fare: fare[type] || fare.car,
        fareBreakdown: { ...breakdown, waitingFee: 0, tip: 0 },
        preferWomenCaptain: Boolean(preferWomenCaptain),
        riderIsWoman: Boolean(riderIsWoman || preferWomenCaptain),
    });
    return { ride, otp };
};

// Captains who may be offered (and accept) this ride.
function canTake(captain, ride) {
    if (normalizeType(captain.vehicle?.vehicleType) !== ride.vehicleType) return false;
    if (ride.preferWomenCaptain && captain.gender !== 'female') return false;
    if (captain.womenRidersOnly && !ride.riderIsWoman) return false;
    if ((ride.declinedBy || []).some((id) => String(id) === String(captain._id))) return false;
    return true;
}
module.exports.canTake = canTake;

module.exports.confirmRide = async (rideId, captain) => {
    if (captain.suspended) throw new HttpError(403, 'Your account is paused for a safety review.');
    const window = currentShiftWindow();
    if (captain.verification?.status !== 'verified' || captain.shiftSelfie?.windowId !== window.id || captain.shiftSelfie?.status !== 'verified') {
        throw new HttpError(403, 'Finish your face check for this shift first.');
    }
    if (await ridemodel.exists({ captain: captain._id, status: { $in: ACTIVE_CAPTAIN } })) {
        throw new HttpError(409, 'Finish your current ride first.');
    }

    const candidate = await ridemodel.findById(rideId);
    if (!candidate) throw new HttpError(404, 'Ride not found.');
    if (!canTake(captain, candidate)) throw new HttpError(403, 'This ride is not available to you.');

    const ride = await ridemodel
        .findOneAndUpdate(
            { _id: rideId, status: 'requested', requestedAt: { $gte: new Date(Date.now() - REQUEST_TTL_MS) } },
            { captain: captain._id, status: 'accepted' },
            { new: true }
        )
        .populate('user')
        .populate('captain');
    if (!ride) throw new HttpError(409, 'This ride was already taken.');
    await captainModel.updateOne({ _id: captain._id }, { status: 'busy' });
    return ride;
};

async function captainRide(rideId, captainId, status, update) {
    const ride = await ridemodel.findOneAndUpdate({ _id: rideId, captain: captainId, status }, update, { new: true });
    if (ride) return ride;
    const exists = await ridemodel.exists({ _id: rideId, captain: captainId });
    throw exists ? new HttpError(409, 'This ride has moved on. Please refresh.') : new HttpError(404, 'Ride not found.');
}

// Captain has reached the pickup: starts the free waiting window.
module.exports.markArrived = async (rideId, captainId) => {
    const ride = await captainRide(rideId, captainId, 'accepted', {});
    if (!ride.arrivedAt) {
        await ridemodel.updateOne({ _id: ride._id, arrivedAt: null }, { arrivedAt: new Date() });
    }
    return ridemodel.findById(ride._id);
};

module.exports.startRide = async (rideId, captainId, otp) => {
    const otpValue = String(otp || '').trim();
    if (!/^\d{4,6}$/.test(otpValue)) throw new HttpError(400, 'Invalid OTP.');

    const ride = await ridemodel.findOne({ _id: rideId, captain: captainId }).select('+otp +otpAttempts');
    if (!ride) throw new HttpError(404, 'Ride not found.');
    if (ride.status !== 'accepted') throw new HttpError(409, 'This ride has moved on. Please refresh.');
    if ((ride.otpAttempts || 0) >= MAX_OTP_ATTEMPTS) {
        throw new HttpError(423, 'Too many wrong PINs. Ask the rider to cancel and book again.');
    }
    if (!(await bcrypt.compare(otpValue, ride.otp))) {
        const updated = await ridemodel.findOneAndUpdate({ _id: ride._id }, { $inc: { otpAttempts: 1 } }, { new: true }).select('+otpAttempts');
        throw new HttpError(400, 'Invalid OTP.', { attemptsLeft: Math.max(0, MAX_OTP_ATTEMPTS - updated.otpAttempts) });
    }

    // Waiting fee is calculated by the app, never negotiated in person.
    let waitingFee = 0;
    if (ride.arrivedAt) {
        const waitedMin = (Date.now() - ride.arrivedAt.getTime()) / 60000;
        const chargeableMin = Math.max(0, Math.floor(waitedMin - FREE_WAIT_MIN));
        const perMin = WAIT_PER_MIN[ride.vehicleType] || WAIT_PER_MIN.car;
        waitingFee = Math.min(MAX_WAITING_FEE, Math.round(chargeableMin * perMin));
    }
    return captainRide(ride._id, captainId, 'accepted', {
        status: 'ongoing',
        startedAt: new Date(),
        'fareBreakdown.waitingFee': waitingFee,
        $inc: { fare: waitingFee },
    });
};

module.exports.endRide = async (rideId, captainId) => {
    // Flag rides that end far from the drop so the rider is asked if they're safe.
    const existing = await ridemodel.findOne({ _id: rideId, captain: captainId }).select('dropPoint');
    let endedAwayFromDrop = false;
    const captain = await captainModel.findById(captainId).select('location');
    const [lng, lat] = captain?.location?.coordinates || [];
    if (existing?.dropPoint?.lat != null && lat != null && !(lat === 0 && lng === 0)) {
        endedAwayFromDrop = mapsService.distanceInMeters(lat, lng, existing.dropPoint.lat, existing.dropPoint.lng) > 1000;
    }
    const ride = await captainRide(rideId, captainId, 'ongoing', {
        status: 'completed',
        endedAt: new Date(),
        'safety.endedAwayFromDrop': endedAwayFromDrop,
    });
    await captainModel.updateOne({ _id: captainId, status: 'busy' }, { status: 'available' });
    return ride;
};

// Tips only after the ride, in the app — so extra money rewards a good ride
// instead of being bargained for before it. Paying twice changes nothing.
module.exports.completePayment = async (rideId, userId, tip = 0) => {
    const tipAmount = Math.max(0, Math.min(MAX_TIP, Math.round(Number(tip) || 0)));
    const ride = await ridemodel.findOneAndUpdate(
        { _id: rideId, user: userId, status: 'completed', paymentStatus: 'pending' },
        { paymentStatus: 'paid', 'fareBreakdown.tip': tipAmount, $inc: { fare: tipAmount } },
        { new: true }
    );
    if (!ride) {
        const existing = await ridemodel.findOne({ _id: rideId, user: userId });
        if (!existing) throw new HttpError(404, 'Ride not found.');
        if (existing.paymentStatus !== 'paid') throw new HttpError(409, 'You can pay once the ride has ended.');
        return ridemodel.findById(rideId).populate('user').populate('captain');
    }

    // Wallet credit (refunds, Ride Guarantee) comes off what the rider pays.
    // The conditional update means credit can never be spent twice.
    const rider = await userModel.findById(userId).select('walletCredit');
    const use = Math.min(Math.floor(rider?.walletCredit || 0), ride.fare);
    if (use > 0) {
        const spent = await userModel.updateOne({ _id: userId, walletCredit: { $gte: use } }, { $inc: { walletCredit: -use } });
        if (spent.modifiedCount) await ridemodel.updateOne({ _id: ride._id }, { 'fareBreakdown.creditUsed': use });
    }
    return ridemodel.findById(rideId).populate('user').populate('captain');
};

// Rider: any time before the ride starts. Captain: before the ride starts —
// the ride goes straight back to other captains (the rider isn't left
// stranded) and the dropping captain won't be offered it again.
module.exports.cancelRide = async ({ rideId, by, actorId, reason }) => {
    const now = new Date();
    if (by === 'rider') {
        const before = await ridemodel.findOneAndUpdate(
            { _id: rideId, user: actorId, status: { $in: ['requested', 'accepted'] } },
            { status: 'cancelled', cancelledBy: 'rider', cancelReason: reason, cancelledAt: now, paymentStatus: 'not_charged' },
            { new: false }
        );
        if (!before) {
            const exists = await ridemodel.exists({ _id: rideId, user: actorId });
            throw exists ? new HttpError(409, 'This ride has already started or ended.') : new HttpError(404, 'Ride not found.');
        }
        if (before.captain) await captainModel.updateOne({ _id: before.captain, status: 'busy' }, { status: 'available' });
        return { ride: await ridemodel.findById(rideId), before, requeued: false };
    }

    const ride = await ridemodel.findOneAndUpdate(
        { _id: rideId, captain: actorId, status: 'accepted' },
        { status: 'requested', $unset: { captain: 1, arrivedAt: 1 }, $addToSet: { declinedBy: actorId }, requestedAt: now },
        { new: true }
    );
    if (!ride) {
        const exists = await ridemodel.exists({ _id: rideId, captain: actorId });
        throw exists ? new HttpError(409, 'This ride has already started or ended.') : new HttpError(404, 'Ride not found.');
    }
    // Every third drop is a strike (three strikes pause the account).
    const dropped = await captainModel.findOneAndUpdate({ _id: actorId }, { status: 'available', $inc: { cancellations: 1 } }, { new: true });
    if (dropped && dropped.cancellations % 3 === 0) {
        const struck = await captainModel.findOneAndUpdate({ _id: actorId }, { $inc: { strikes: 1 } }, { new: true });
        if (struck.strikes >= 3) await captainModel.updateOne({ _id: actorId }, { suspended: true });
    }

    // Ride Guarantee: ₹50 to the rider, once per ride however many captains drop
    // it, and at most 3 times a week per rider (so it can't be farmed).
    const recentCredits = await ridemodel.countDocuments({
        user: ride.user,
        guaranteeCredited: true,
        updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    });
    const guaranteed = recentCredits >= 3 ? { modifiedCount: 0 } : await ridemodel.updateOne({ _id: ride._id, guaranteeCredited: false }, { guaranteeCredited: true });
    let guaranteeCredit = 0;
    if (guaranteed.modifiedCount) {
        await userModel.updateOne({ _id: ride.user }, { $inc: { walletCredit: GUARANTEE_CREDIT } });
        guaranteeCredit = GUARANTEE_CREDIT;
    }
    return { ride, before: null, requeued: true, guaranteeCredit };
};
