// What each side of a ride is allowed to see about the other.
// Riders see the captain's first name, vehicle and today's shift selfie;
// captains see only the rider's first name. Phone numbers cross over only
// while the ride is on (accepted or ongoing), so the two can call each other
// at pickup. No emails, last names or socket IDs ever cross over.

const { currentShiftWindow } = require('./shiftWindow');
const { isConfirmedWoman } = require('./womenSafety');

function toPlain(doc) {
    if (!doc) return doc;
    return typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

// The ride states in which each side may call the other.
const CONTACT_STATES = ['accepted', 'ongoing'];

function publicCaptain(captain, { contact = false } = {}) {
    if (!captain || typeof captain !== 'object' || !captain.name) return captain;
    const plain = toPlain(captain);
    const selfie = plain.shiftSelfie || {};
    const checkedThisShift = selfie.windowId === currentShiftWindow().id && selfie.status === 'verified';
    return {
        _id: plain._id,
        name: { firstname: plain.name?.firstname },
        vehicle: plain.vehicle
            ? {
                color: plain.vehicle.color,
                model: plain.vehicle.model,
                plate: plain.vehicle.plate,
                capacity: plain.vehicle.capacity,
                vehicleType: plain.vehicle.vehicleType,
            }
            : undefined,
        // Shown to riders as "Woman captain" only once confirmed.
        isWoman: isConfirmedWoman(plain),
        verified: plain.verification?.status === 'verified',
        selfieCheckedToday: checkedThisShift,
        photo: checkedThisShift ? selfie.image : undefined,
        phone: contact ? plain.phone : undefined,
    };
}

function publicRider(user, { contact = false } = {}) {
    if (!user || typeof user !== 'object' || !user.name) return user;
    const plain = toPlain(user);
    return { _id: plain._id, name: { firstname: plain.name?.firstname }, phone: contact ? plain.phone : undefined };
}

function publicRide(ride) {
    if (!ride) return ride;
    const plain = toPlain(ride);
    delete plain.otp;
    delete plain.shareToken;
    delete plain.offers;
    delete plain.declinedBy;
    if (plain.dispatch) plain.dispatch = { radiusM: plain.dispatch.radiusM, wave: plain.dispatch.wave };
    const contact = CONTACT_STATES.includes(plain.status);
    return { ...plain, captain: publicCaptain(plain.captain, { contact }), user: publicRider(plain.user, { contact }) };
}

module.exports = { publicCaptain, publicRider, publicRide };
