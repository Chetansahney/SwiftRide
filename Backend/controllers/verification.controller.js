// Captain identity verification (once, at sign-up) and the face check at the
// start of each of the three daily shift windows (6–14, 14–22, 22–6 IST).
const crypto = require('crypto');
const captainModel = require('../models/captain.models');
const faceEngine = require('../services/faceEngine');
const { getProvider, VEHICLE_CLASSES, normalise } = require('../services/verificationProvider');
const { currentShiftWindow } = require('../utils/shiftWindow');

const IMAGE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 700000; // ~500 KB per photo after client-side compression
const MAX_SHIFT_ATTEMPTS = 5;
const SECRET_FIELDS = '+verification.referenceEmbedding +verification.dlEmbedding +verification.referenceLandmarks';

const isImage = (value) => typeof value === 'string' && value.length <= MAX_IMAGE_CHARS && IMAGE.test(value);

// Licence numbers are stored only as a keyed hash (plus the last 4 digits) so a
// database leak doesn't expose them, while still catching one licence on two accounts.
function hashLicence(number) {
    return crypto.createHmac('sha256', process.env.JWT_SECRET || 'swiftride').update(number).digest('hex');
}

const isPast = (isoDate) => !isoDate || new Date(isoDate).getTime() < Date.now();

function verificationView(captain) {
    const v = captain.verification || {};
    const window = currentShiftWindow();
    const selfie = captain.shiftSelfie || {};
    const thisWindow = selfie.windowId === window.id;
    return {
        status: v.status || 'not_started',
        reasons: v.reasons || [],
        submittedAt: v.submittedAt,
        decidedAt: v.decidedAt,
        dl: v.dl?.last4 ? { last4: v.dl.last4, validUntil: v.dl.validUntil, classes: v.dl.classes } : undefined,
        vehicle: v.vehicle?.plate ? { plate: v.vehicle.plate, vehicleClass: v.vehicle.vehicleClass } : undefined,
        shift: {
            windowId: window.id,
            label: window.label,
            endsAt: window.endsAt,
            status: thisWindow ? selfie.status : 'needed',
            attempts: thisWindow ? selfie.attempts || 0 : 0,
        },
    };
}

module.exports.getVerification = async (req, res) => {
    if (!req.captain) return res.status(401).json({ message: 'unAuthorised' });
    res.status(200).json({ verification: verificationView(req.captain) });
};

module.exports.submitVerification = async (req, res) => {
    const captain = req.captain;
    if (!captain) return res.status(401).json({ message: 'unAuthorised' });
    const status = captain.verification?.status;
    if (status === 'verified' || status === 'in_review') {
        return res.status(409).json({ message: 'Verification already submitted.', verification: verificationView(captain) });
    }

    const { dlNumber, dob, dlName, dlImage, selfies } = req.body || {};
    if (typeof dlNumber !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(dob || '')) || !isImage(dlImage) ||
        !Array.isArray(selfies) || selfies.length !== 3 || !selfies.every(isImage)) {
        return res.status(400).json({ message: 'Please fill in your licence details and take all three photos.', reasons: ['bad_image'] });
    }

    const provider = getProvider();
    const reasons = [];
    const dl = await provider.verifyDrivingLicence({ number: dlNumber, dob, name: dlName });
    const allowedClasses = VEHICLE_CLASSES[captain.vehicle?.vehicleType] || [];
    if (!dl.valid) reasons.push('dl_invalid');
    else {
        if (isPast(dl.validUntil)) reasons.push('dl_expired');
        if (!dl.classes?.some((c) => allowedClasses.includes(c))) reasons.push('dl_class');
    }
    // Vehicle by registration number. Owner name isn't checked (the captain may
    // drive a vehicle registered to a fleet owner or family member).
    const vehicle = await provider.verifyVehicle({ plate: captain.vehicle?.plate, vehicleType: captain.vehicle?.vehicleType });
    if (!vehicle.valid) reasons.push('vehicle_invalid');
    else {
        if (!vehicle.commercial) reasons.push('vehicle_private');
        if ([vehicle.fitnessUpto, vehicle.insuranceUpto, vehicle.permitUpto].some(isPast)) reasons.push('vehicle_documents');
    }

    const numberHash = dl.valid ? hashLicence(dl.number) : undefined;
    if (numberHash) {
        const other = await captainModel.exists({
            _id: { $ne: captain._id },
            'verification.dl.numberHash': numberHash,
            'verification.status': { $in: ['verified', 'in_review'] },
        });
        if (other) reasons.push('dl_in_use');
    }

    const now = new Date();
    const base = {
        submittedAt: now,
        dl: dl.valid
            ? { last4: dl.number.slice(-4), numberHash, name: dl.name, dob: dl.dob, validUntil: dl.validUntil, classes: dl.classes, source: dl.source }
            : undefined,
        vehicle: vehicle.valid
            ? { plate: vehicle.plate, vehicleClass: vehicle.vehicleClass, commercial: vehicle.commercial, fitnessUpto: vehicle.fitnessUpto, insuranceUpto: vehicle.insuranceUpto, permitUpto: vehicle.permitUpto, source: vehicle.source }
            : undefined,
    };

    // Document problems: no need to look at faces.
    if (reasons.length) {
        captain.verification = { ...base, status: 'rejected', reasons, decidedAt: now, decidedBy: 'auto' };
        await captain.save();
        return res.status(200).json({ verification: verificationView(captain) });
    }

    let result;
    try {
        result = await faceEngine.verifyIdentity({ dlImage, selfies });
    } catch (error) {
        if (error instanceof faceEngine.FaceError) {
            captain.verification = { ...base, status: 'rejected', reasons: [error.code], decidedAt: now, decidedBy: 'auto' };
            await captain.save();
            return res.status(200).json({ verification: verificationView(captain) });
        }
        console.error('Face engine error:', error);
        return res.status(503).json({ message: 'Face check is unavailable right now. Please try again in a few minutes.' });
    }

    const inReview = result.decision === 'in_review';
    captain.verification = {
        ...base,
        status: result.decision,
        reasons: result.reasons,
        decidedAt: inReview ? undefined : now,
        decidedBy: inReview ? undefined : 'auto',
        face: result.face,
        referenceEmbedding: result.referenceEmbedding,
        referenceLandmarks: result.referenceLandmarks,
        dlEmbedding: result.dlEmbedding,
        // Photos are kept only while a person needs to look at them.
        dlImage: inReview ? dlImage : undefined,
        selfieImage: inReview ? selfies[0] : undefined,
    };
    await captain.save();
    res.status(200).json({ verification: verificationView(captain) });
};

// Face check for the current shift window. Riders see this photo on the ride card.
module.exports.uploadShiftSelfie = async (req, res) => {
    if (!req.captain) return res.status(401).json({ message: 'unAuthorised' });
    const captain = await captainModel.findById(req.captain._id).select(SECRET_FIELDS);
    if (captain.verification?.status !== 'verified') {
        return res.status(403).json({ message: 'Finish identity verification first.', reason: 'verify_first' });
    }
    const { image } = req.body || {};
    if (!isImage(image)) {
        return res.status(400).json({ message: 'Please take a clear photo (JPEG or PNG).', reason: 'bad_image' });
    }

    const window = currentShiftWindow();
    const previous = captain.shiftSelfie?.windowId === window.id ? captain.shiftSelfie : null;
    if (previous?.status === 'verified') {
        return res.status(200).json({ verification: verificationView(captain) });
    }
    const attempts = (previous?.attempts || 0) + 1;
    if (previous?.status === 'in_review' || attempts > MAX_SHIFT_ATTEMPTS) {
        return res.status(429).json({ message: 'Your photo is with our team. We will let you know soon.', reason: 'review', verification: verificationView(captain) });
    }

    let result;
    try {
        result = await faceEngine.verifyShiftSelfie({
            selfie: image,
            referenceEmbedding: captain.verification.referenceEmbedding,
            referenceLandmarks: captain.verification.referenceLandmarks,
            dlEmbedding: captain.verification.dlEmbedding,
        });
    } catch (error) {
        if (error instanceof faceEngine.FaceError) {
            return res.status(422).json({ message: 'We could not see one clear face. Please try again.', reason: error.code });
        }
        console.error('Face engine error:', error);
        return res.status(503).json({ message: 'Face check is unavailable right now. Please try again in a few minutes.' });
    }

    // Too many failed tries in one window go to a person instead of more retries.
    let status = { match: 'verified', review: 'in_review', mismatch: 'rejected' }[result.decision];
    if (status === 'rejected' && attempts >= MAX_SHIFT_ATTEMPTS) status = 'in_review';
    captain.shiftSelfie = {
        image,
        takenAt: new Date(),
        windowId: window.id,
        score: result.fingerprintScore,
        status,
        attempts,
    };
    await captain.save();
    res.status(200).json({ verification: verificationView(captain), score: result.fingerprintScore });
};

// ---------- admin review ----------

module.exports.listReviews = async (req, res) => {
    const window = currentShiftWindow();
    const [identity, shifts] = await Promise.all([
        captainModel
            .find({ 'verification.status': 'in_review' })
            .select('name vehicle verification +verification.dlImage +verification.selfieImage')
            .sort({ 'verification.submittedAt': 1 })
            .limit(50),
        captainModel
            .find({ 'shiftSelfie.status': 'in_review', 'shiftSelfie.windowId': window.id })
            .select('name vehicle verification.face shiftSelfie +shiftSelfie.image')
            .limit(50),
    ]);
    res.status(200).json({
        identity: identity.map((c) => ({
            captainId: c._id,
            name: c.name,
            vehicle: c.vehicle,
            submittedAt: c.verification.submittedAt,
            reasons: c.verification.reasons,
            face: c.verification.face,
            dl: { last4: c.verification.dl?.last4, name: c.verification.dl?.name, dob: c.verification.dl?.dob },
            dlImage: c.verification.dlImage,
            selfieImage: c.verification.selfieImage,
        })),
        shifts: shifts.map((c) => ({
            captainId: c._id,
            name: c.name,
            vehicle: c.vehicle,
            windowId: c.shiftSelfie.windowId,
            score: c.shiftSelfie.score,
            attempts: c.shiftSelfie.attempts,
            image: c.shiftSelfie.image,
        })),
    });
};

module.exports.decideReview = async (req, res) => {
    const { decision, kind } = req.body || {};
    if (!['approve', 'reject'].includes(decision) || !['identity', 'shift'].includes(kind)) {
        return res.status(400).json({ message: 'decision must be approve|reject and kind identity|shift' });
    }
    const captain = await captainModel.findById(req.params.captainId);
    if (!captain) return res.status(404).json({ message: 'Captain not found' });

    if (kind === 'identity') {
        if (captain.verification?.status !== 'in_review') return res.status(409).json({ message: 'Nothing to review' });
        captain.verification.status = decision === 'approve' ? 'verified' : 'rejected';
        if (decision === 'reject') captain.verification.reasons = [...(captain.verification.reasons || []), 'admin_rejected'];
        captain.verification.decidedAt = new Date();
        captain.verification.decidedBy = 'admin';
        // Reviewed: the photos aren't needed any more.
        captain.verification.dlImage = undefined;
        captain.verification.selfieImage = undefined;
    } else {
        if (captain.shiftSelfie?.status !== 'in_review') return res.status(409).json({ message: 'Nothing to review' });
        captain.shiftSelfie.status = decision === 'approve' ? 'verified' : 'rejected';
        // A rejected shift photo means someone else may be driving: pause dispatch.
        if (decision === 'reject') {
            captain.suspended = true;
            captain.strikes = (captain.strikes || 0) + 1;
        }
    }
    await captain.save();
    res.status(200).json({ ok: true });
};
