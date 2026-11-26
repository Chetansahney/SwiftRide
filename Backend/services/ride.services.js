const ridemodel = require('../models/ride.model');
const captainModel = require('../models/captain.models');
const mapsService = require('../services/maps.services');
const bcrypt = require("bcrypt");
const crypto = require("crypto");

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

module.exports.createRide = async ({ user, origin, destination, vehicleType, preferWomenCaptain = false, riderIsWoman = false }) => {
    if (!user || !origin || !destination || !vehicleType) {
        throw new Error("User, origin, destination, and vehicle type are required.");
    }
    const type = vehicleType === 'bike' ? 'moto' : vehicleType;
    const [pickupPoint, dropPoint] = await Promise.all([geocodePoint(origin), geocodePoint(destination)]);
    const { otp, hash } = await getOTP();
    const fare = await calculateFare(origin, destination, { dropPoint });
    const breakdown = fare.breakdown[type] || fare.breakdown.car;

    const ride = new ridemodel({
        user,
        origin,
        destination,
        pickupPoint: pickupPoint || undefined,
        dropPoint: dropPoint || undefined,
        vehicleType: fare.breakdown[type] ? type : 'car',
        otp: hash,
        fare: fare[type] || fare.car,
        fareBreakdown: { ...breakdown, waitingFee: 0, tip: 0 },
        preferWomenCaptain: Boolean(preferWomenCaptain),
        riderIsWoman: Boolean(riderIsWoman || preferWomenCaptain),
    });
    await ride.save();
    return { ride, otp };
}

// Only one captain can accept: the update only matches while the ride is still "requested".
module.exports.confirmRide = async (rideId, captainId) => {
    if (!rideId || !captainId) {
        throw new Error("Ride ID and captain ID are required to confirm ride.");
    }

    const ride = await ridemodel
        .findOneAndUpdate(
            { _id: rideId, status: 'requested' },
            { captain: captainId, status: 'accepted' },
            { new: true }
        )
        .populate("user")
        .populate("captain");

    if (!ride) {
        const exists = await ridemodel.exists({ _id: rideId });
        throw new Error(exists ? "This ride was already taken." : "Ride not found.");
    }

    return ride;
};

async function loadCaptainRide(rideId, captainId, { withOtp = false } = {}) {
    const query = ridemodel.findOne({ _id: rideId });
    if (withOtp) query.select('+otp');
    const ride = await query.populate("user").populate("captain");
    if (!ride) {
        throw new Error("Ride not found.");
    }
    if (!ride.captain || ride.captain._id.toString() !== captainId.toString()) {
        throw new Error("Captain not authorized for this ride.");
    }
    return ride;
}

// Captain has reached the pickup: starts the free waiting window.
module.exports.markArrived = async (rideId, captainId) => {
    const ride = await loadCaptainRide(rideId, captainId);
    if (ride.status !== 'accepted') {
        throw new Error("Ride is not waiting for pickup.");
    }
    if (!ride.arrivedAt) {
        ride.arrivedAt = new Date();
        await ride.save();
    }
    return ride;
};

module.exports.startRide = async (rideId, captainId, otp) => {
    const otpValue = String(otp || '').trim();
    if (!rideId || !captainId || !otpValue) {
        throw new Error("Ride ID, captain ID, and OTP are required to start ride.");
    }

    const ride = await loadCaptainRide(rideId, captainId, { withOtp: true });

    const isMatch = await bcrypt.compare(otpValue, ride.otp);
    if (!isMatch) {
        throw new Error("Invalid OTP.");
    }

    // Waiting fee is calculated by the app, never negotiated in person.
    if (ride.arrivedAt) {
        const waitedMin = (Date.now() - ride.arrivedAt.getTime()) / 60000;
        const chargeableMin = Math.max(0, Math.floor(waitedMin - FREE_WAIT_MIN));
        const perMin = WAIT_PER_MIN[ride.vehicleType] || WAIT_PER_MIN.car;
        const waitingFee = Math.min(MAX_WAITING_FEE, Math.round(chargeableMin * perMin));
        if (waitingFee > 0) {
            ride.fareBreakdown.waitingFee = waitingFee;
            ride.fare += waitingFee;
        }
    }

    ride.status = 'ongoing';
    ride.startedAt = new Date();
    await ride.save();

    return ridemodel.findById(rideId).populate("user").populate("captain");
};

module.exports.endRide = async (rideId, captainId) => {
    if (!rideId || !captainId) {
        throw new Error("Ride ID and captain ID are required to end ride.");
    }

    const ride = await loadCaptainRide(rideId, captainId);

    // Flag rides that end far from the drop so the rider is asked if they're safe.
    const captain = await captainModel.findById(captainId).select('location');
    const [lng, lat] = captain?.location?.coordinates || [];
    if (ride.dropPoint?.lat != null && lat != null && !(lat === 0 && lng === 0)) {
        const metersFromDrop = mapsService.distanceInMeters(lat, lng, ride.dropPoint.lat, ride.dropPoint.lng);
        ride.safety = { ...(ride.safety?.toObject?.() || ride.safety || {}), endedAwayFromDrop: metersFromDrop > 1000 };
    }

    ride.status = 'completed';
    ride.endedAt = new Date();
    await ride.save();

    return ridemodel.findById(rideId).populate("user").populate("captain");
};

module.exports.completePayment = async (rideId, userId, tip = 0) => {
    if (!rideId || !userId) {
        throw new Error("Ride ID and user ID are required to complete payment.");
    }

    const ride = await ridemodel.findOne({ _id: rideId }).populate("user").populate("captain");

    if (!ride) {
        throw new Error("Ride not found.");
    }

    if (!ride.user || ride.user._id.toString() !== userId.toString()) {
        throw new Error("User not authorized for this ride.");
    }

    // Tips only after the ride, in the app — so extra money rewards a good
    // ride instead of being bargained for before it.
    const tipAmount = Math.max(0, Math.min(MAX_TIP, Math.round(Number(tip) || 0)));
    if (tipAmount > 0 && ride.paymentStatus !== 'paid') {
        ride.fareBreakdown.tip = tipAmount;
        ride.fare += tipAmount;
    }

    ride.paymentStatus = 'paid';
    await ride.save();

    return ridemodel.findById(rideId).populate("user").populate("captain");
};
