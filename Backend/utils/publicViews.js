// What each side of a ride is allowed to see about the other.
// Riders see the captain's first name, vehicle and today's shift selfie;
// captains see only the rider's first name. No emails, phone numbers,
// last names or socket IDs cross over.

const SHIFT_MS = 12 * 60 * 60 * 1000;

function toPlain(doc) {
    if (!doc) return doc;
    return typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
}

function publicCaptain(captain) {
    if (!captain || typeof captain !== 'object' || !captain.name) return captain;
    const plain = toPlain(captain);
    const takenAt = plain.shiftSelfie?.takenAt ? new Date(plain.shiftSelfie.takenAt) : null;
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
        isWoman: plain.gender === 'female',
        selfieCheckedToday: Boolean(takenAt && Date.now() - takenAt.getTime() < SHIFT_MS),
        photo: plain.shiftSelfie?.image || undefined,
    };
}

function publicRider(user) {
    if (!user || typeof user !== 'object' || !user.name) return user;
    const plain = toPlain(user);
    return { _id: plain._id, name: { firstname: plain.name?.firstname } };
}

function publicRide(ride) {
    if (!ride) return ride;
    const plain = toPlain(ride);
    delete plain.otp;
    delete plain.shareToken;
    return { ...plain, captain: publicCaptain(plain.captain), user: publicRider(plain.user) };
}

module.exports = { publicCaptain, publicRider, publicRide };
