// Wave dispatch, Uber-style.
//
// Captains' live locations are indexed into H3 hexagons (resolution 8, about
// 0.7 km² each). A request first looks at the pickup hexagon and the ring
// around it; if nobody suitable is there, the search widens ring by ring.
//
// In each wave the best-ranked captains (WAVE_SIZE) get the offer at the same
// time, with OFFER_TIMEOUT to accept. If nobody accepts, the next best are
// asked, then the search widens. Ranking (lower is better):
//
//   pickup time (min)
//   + RATING_WEIGHT × |captain rating − rider rating|   (good riders get good captains)
//   + reliability penalty (low acceptance, recent drops)
//   − small boost for captains who've waited longest since their last ride
//
// Women's safety rules are hard filters, never traded off against the score:
// rides asking for a woman captain only go to CONFIRMED women captains, and a
// confirmed woman captain with "women riders only" never gets other riders.
const h3 = require('h3-js');
const rideModel = require('../models/ride.model');
const captainModel = require('../models/captain.models');
const userModel = require('../models/user.models');
const { dispatchableFilter } = require('./maps.services');
const { distanceInMeters } = require('./geo');
const { CONFIRMED_WOMAN_FILTER } = require('../utils/womenSafety');
const { publicRide } = require('../utils/publicViews');

const H3_RES = 8;
const num = (name, fallback) => (Number.isFinite(Number(process.env[name])) && process.env[name] !== undefined ? Number(process.env[name]) : fallback);
const CONFIG = {
    WAVE_SIZE: num('DISPATCH_WAVE_SIZE', 3),
    OFFER_TIMEOUT_MS: num('DISPATCH_OFFER_TIMEOUT_MS', 15000),
    // Ring sizes per vehicle (k): ~0.9, 1.8, 2.8, 3.7, 5.5 km; cabs reach ~8.3 km.
    RINGS: { moto: [1, 2, 3, 4, 6], auto: [1, 2, 3, 4, 6], car: [1, 2, 3, 5, 7, 9] },
    RATING_WEIGHT: 3, // minutes per star of difference
    // Average city speeds to the pickup, for ranking (km/h).
    SPEED_KMPH: { moto: 22, auto: 18, car: 20 },
    ROAD_DETOUR: 1.35,
    // A woman-only request with nobody found for this long asks the rider what to do.
    WOMEN_NOTICE_MS: num('DISPATCH_WOMEN_NOTICE_MS', 90000),
    REQUEST_TTL_MS: 10 * 60 * 1000,
};

// Bayesian average so a handful of ratings doesn't swing anyone too far.
const PRIOR = { rider: 4.7, captain: 4.6, weight: 5 };
const smoothedRating = (total, count, prior) => ((total || 0) + prior * PRIOR.weight) / ((count || 0) + PRIOR.weight);

const cellOf = (lat, lng) => h3.latLngToCell(lat, lng, H3_RES);
const ringsFor = (vehicleType) => CONFIG.RINGS[vehicleType] || CONFIG.RINGS.car;
const ringRadiusM = (k) => Math.round(k * h3.getHexagonEdgeLengthAvg(H3_RES, 'm') * Math.sqrt(3));

let notifier = { toCaptain: () => {}, toRider: () => {} };
// The socket layer registers how to reach people (keeps this module testable).
function setNotifier(next) {
    notifier = next;
}

// Rank one captain for one ride (lower is better).
function scoreCaptain(captain, ride, riderRating, now = Date.now()) {
    const [lng, lat] = captain.location?.coordinates || [];
    const distanceM = distanceInMeters(ride.pickupPoint.lat, ride.pickupPoint.lng, lat, lng);
    const speed = CONFIG.SPEED_KMPH[ride.vehicleType] || 20;
    const etaMin = ((distanceM * CONFIG.ROAD_DETOUR) / 1000 / speed) * 60;
    const captainRating = smoothedRating(captain.ratingTotal, captain.ratingCount, PRIOR.captain);
    const ratingGap = Math.abs(captainRating - riderRating) * CONFIG.RATING_WEIGHT;
    const received = captain.offersReceived || 0;
    const acceptance = received >= 5 ? (captain.offersAccepted || 0) / received : 1;
    const reliability = (1 - acceptance) * 2 + Math.min(3, (captain.cancellations || 0) * 0.25);
    const idleMin = captain.lastRideEndedAt ? (now - new Date(captain.lastRideEndedAt).getTime()) / 60000 : 30;
    const fairness = -Math.min(30, Math.max(0, idleMin)) / 30;
    return {
        score: Math.round((etaMin + ratingGap + reliability + fairness) * 100) / 100,
        etaMin: Math.max(1, Math.round(etaMin)),
        distanceM: Math.round(distanceM),
        captainRating: Math.round(captainRating * 10) / 10,
    };
}

// The women's-safety and vehicle rules every candidate must pass.
function eligible(captain, ride) {
    const type = captain.vehicle?.vehicleType === 'bike' ? 'moto' : captain.vehicle?.vehicleType;
    if (type !== ride.vehicleType) return false;
    const confirmedWoman = captain.gender === 'female' && captain.genderCheck?.status === 'verified';
    if (ride.preferWomenCaptain && !confirmedWoman) return false;
    if (captain.womenRidersOnly && confirmedWoman && !ride.riderIsWoman) return false;
    // Not again to captains who declined, ignored the offer, or are deciding right
    // now. Captains whose offer was withdrawn (someone else accepted first) can be
    // asked again if the ride comes back.
    const asked = (ride.offers || []).filter((o) => ['offered', 'declined', 'expired'].includes(o.status)).map((o) => o.captain);
    const excluded = new Set([...(ride.declinedBy || []), ...asked].map(String));
    return !excluded.has(String(captain._id));
}

// Online captains inside ring k around the pickup who may take this ride, best first.
async function candidates(ride, k, riderRating) {
    const cells = h3.gridDisk(cellOf(ride.pickupPoint.lat, ride.pickupPoint.lng), k);
    const types = ride.vehicleType === 'moto' ? ['moto', 'bike'] : [ride.vehicleType];
    const found = await captainModel
        .find({
            ...dispatchableFilter(),
            h3: { $in: cells },
            'vehicle.vehicleType': { $in: types },
            ...(ride.preferWomenCaptain ? CONFIRMED_WOMAN_FILTER : {}),
        })
        .select('location vehicle gender genderCheck womenRidersOnly ratingTotal ratingCount offersReceived offersAccepted cancellations lastRideEndedAt socketId')
        .limit(200);
    return found
        .filter((captain) => eligible(captain, ride))
        .map((captain) => ({ captain, ...scoreCaptain(captain, ride, riderRating) }))
        .sort((a, b) => a.score - b.score);
}

async function riderRatingOf(ride) {
    const rider = await userModel.findById(ride.user).select('ratingTotal ratingCount');
    return smoothedRating(rider?.ratingTotal, rider?.ratingCount, PRIOR.rider);
}

// Offers still waiting for an answer become "expired" (and those captains are told).
async function expireOpenOffers(ride, status = 'expired') {
    const open = (ride.offers || []).filter((offer) => offer.status === 'offered');
    if (!open.length) return;
    await rideModel.updateOne(
        { _id: ride._id },
        { $set: { 'offers.$[o].status': status } },
        { arrayFilters: [{ 'o.status': 'offered' }] }
    );
    for (const offer of open) notifier.toCaptain(offer.captain, 'ride-offer-withdrawn', { rideId: String(ride._id), reason: status });
}

// One step of dispatch for a ride: offer the next best captains, widening the
// rings when nobody is left. Safe to call repeatedly: a short "lease" on
// dispatch.nextAt stops two callers dispatching the same ride at once.
async function runWave(rideId, { force = false } = {}) {
    const now = new Date();
    const ride = await rideModel.findOneAndUpdate(
        {
            _id: rideId,
            status: 'requested',
            ...(force ? {} : { $or: [{ 'dispatch.nextAt': { $lte: now } }, { 'dispatch.nextAt': null }] }),
        },
        { 'dispatch.nextAt': new Date(now.getTime() + 30000) },
        { new: true }
    );
    if (!ride || !ride.pickupPoint?.lat) return { offered: 0, done: true };

    const startedAt = ride.dispatch?.startedAt || ride.requestedAt || now;
    if (now - new Date(startedAt) > CONFIG.REQUEST_TTL_MS) {
        await expireOpenOffers(ride);
        await rideModel.updateOne(
            { _id: ride._id, status: 'requested' },
            { status: 'cancelled', cancelledBy: 'system', cancelReason: 'no_captain', cancelledAt: now, paymentStatus: 'not_charged', 'dispatch.nextAt': null }
        );
        notifier.toRider(ride.user, 'ride-expired', { rideId: String(ride._id), reason: 'no_captain' });
        return { offered: 0, done: true };
    }

    await expireOpenOffers(ride);
    const fresh = await rideModel.findById(ride._id);
    const rings = ringsFor(fresh.vehicleType);
    const riderRating = await riderRatingOf(fresh);
    let ringIndex = Math.min(fresh.dispatch?.ringIndex || 0, rings.length - 1);
    let ranked = await candidates(fresh, rings[ringIndex], riderRating);
    while (!ranked.length && ringIndex < rings.length - 1) {
        ringIndex += 1;
        ranked = await candidates(fresh, rings[ringIndex], riderRating);
    }

    const chosen = ranked.slice(0, CONFIG.WAVE_SIZE);
    const wave = (fresh.dispatch?.wave || 0) + 1;
    const expiresAt = new Date(now.getTime() + CONFIG.OFFER_TIMEOUT_MS);
    const radiusM = ringRadiusM(rings[ringIndex]);
    const offers = chosen.map((c) => ({
        captain: c.captain._id,
        wave,
        ring: rings[ringIndex],
        at: now,
        expiresAt,
        status: 'offered',
        etaMin: c.etaMin,
        distanceM: c.distanceM,
        score: c.score,
    }));

    // Nobody this time: try again soon (captains come online); widen if possible.
    const nextAt = chosen.length ? expiresAt : new Date(now.getTime() + Math.min(CONFIG.OFFER_TIMEOUT_MS, 10000));
    await rideModel.updateOne(
        { _id: fresh._id, status: 'requested' },
        {
            $push: { offers: { $each: offers } },
            $set: {
                'dispatch.ringIndex': chosen.length ? ringIndex : Math.min(ringIndex + 1, rings.length - 1),
                'dispatch.wave': wave,
                'dispatch.nextAt': nextAt,
                'dispatch.startedAt': startedAt,
                'dispatch.radiusM': radiusM,
            },
            $inc: { 'dispatch.notified': offers.length },
        }
    );
    if (offers.length) await captainModel.updateMany({ _id: { $in: offers.map((o) => o.captain) } }, { $inc: { offersReceived: 1 } });

    if (chosen.length) {
        const details = publicRide(await rideModel.findById(fresh._id).populate('user'));
        for (const c of chosen) {
            notifier.toCaptain(c.captain._id, 'new-ride', {
                ...details,
                offer: { expiresAt, etaMin: c.etaMin, distanceM: c.distanceM, riderRating: Math.round(riderRating * 10) / 10 },
            });
        }
    }
    notifier.toRider(fresh.user, 'dispatch-progress', {
        rideId: String(fresh._id),
        wave,
        radiusKm: Math.round(radiusM / 100) / 10,
        asked: offers.length,
        totalAsked: (fresh.dispatch?.notified || 0) + offers.length,
    });

    // A woman-only request that keeps finding nobody: let the rider choose.
    if (fresh.preferWomenCaptain && !ranked.length && !fresh.dispatch?.womenNoticeSent && now - new Date(startedAt) >= CONFIG.WOMEN_NOTICE_MS) {
        await rideModel.updateOne({ _id: fresh._id }, { 'dispatch.womenNoticeSent': true });
        notifier.toRider(fresh.user, 'dispatch-no-women', { rideId: String(fresh._id) });
    }
    return { offered: offers.length, ring: rings[ringIndex], radiusM, candidates: ranked.length };
}

// Start (or restart, after a captain drops the ride) dispatch right away.
async function startDispatch(rideId) {
    await rideModel.updateOne(
        { _id: rideId },
        { $set: { 'dispatch.ringIndex': 0, 'dispatch.nextAt': new Date(0), 'dispatch.startedAt': new Date(), 'dispatch.womenNoticeSent': false } }
    );
    return runWave(rideId);
}

// A captain said no: remember it, and if nobody in this wave is still
// deciding, move on to the next captains straight away.
async function declineOffer(rideId, captainId) {
    const ride = await rideModel.findOneAndUpdate(
        { _id: rideId, status: 'requested', offers: { $elemMatch: { captain: captainId, status: 'offered' } } },
        { $set: { 'offers.$.status': 'declined' }, $addToSet: { declinedBy: captainId } },
        { new: true }
    );
    if (!ride) return false;
    const stillDeciding = ride.offers.some((offer) => offer.status === 'offered' && offer.expiresAt > new Date());
    if (!stillDeciding) await runWave(ride._id, { force: true });
    return true;
}

// The accepted captain's offer is marked; everyone else in the wave is told it's gone.
async function settleAccepted(ride, captainId) {
    const others = (ride.offers || []).filter((offer) => offer.status === 'offered' && String(offer.captain) !== String(captainId));
    await rideModel.updateOne(
        { _id: ride._id },
        { $set: { 'offers.$[mine].status': 'accepted', 'offers.$[other].status': 'withdrawn', 'dispatch.nextAt': null } },
        { arrayFilters: [{ 'mine.captain': captainId, 'mine.status': 'offered' }, { 'other.status': 'offered', 'other.captain': { $ne: captainId } }] }
    );
    await captainModel.updateOne({ _id: captainId }, { $inc: { offersAccepted: 1 } });
    for (const offer of others) notifier.toCaptain(offer.captain, 'ride-offer-withdrawn', { rideId: String(ride._id), reason: 'taken' });
}

// Rider cancelled: withdraw open offers.
async function stopDispatch(ride) {
    await expireOpenOffers(ride, 'withdrawn');
    await rideModel.updateOne({ _id: ride._id }, { 'dispatch.nextAt': null });
}

// Background loop: runs any wave that's due (also recovers after a restart).
let timer = null;
function startScheduler(intervalMs = 2000) {
    if (timer) return;
    timer = setInterval(async () => {
        try {
            const due = await rideModel
                .find({ status: 'requested', 'dispatch.nextAt': { $lte: new Date() } })
                .select('_id')
                .limit(50);
            for (const ride of due) await runWave(ride._id).catch((error) => console.error('[dispatch] wave failed:', error.message));
        } catch (error) {
            console.error('[dispatch] scheduler error:', error.message);
        }
    }, intervalMs);
    timer.unref?.();
}
function stopScheduler() {
    clearInterval(timer);
    timer = null;
}

module.exports = {
    CONFIG,
    H3_RES,
    cellOf,
    ringRadiusM,
    scoreCaptain,
    eligible,
    candidates,
    runWave,
    startDispatch,
    declineOffer,
    settleAccepted,
    stopDispatch,
    setNotifier,
    startScheduler,
    stopScheduler,
    smoothedRating,
};
