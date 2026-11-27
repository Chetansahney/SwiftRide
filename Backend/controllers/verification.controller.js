// Captain identity verification (once, at sign-up) and the face check at the
// start of each of the three daily shift windows (6–14, 14–22, 22–6 IST).
// Both use a random, single-use liveness challenge issued by the server.
const crypto = require('crypto');
const captainModel = require('../models/captain.models');
const faceEngine = require('../services/faceEngine');
const { getProvider, VEHICLE_CLASSES } = require('../services/verificationProvider');
const { currentShiftWindow } = require('../utils/shiftWindow');

const IMAGE = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const MAX_IMAGE_CHARS = 700000; // ~500 KB per photo after client-side compression
const MAX_SHIFT_ATTEMPTS = 5;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const GALLERY_SIZE = 5;
const FACE_SECRETS =
    '+verification.referenceEmbedding +verification.dlEmbedding +verification.referenceLandmarks ' +
    '+verification.referenceDescriptor +verification.dlDescriptor +verification.gallery';

const isImage = (value) => typeof value === 'string' && value.length <= MAX_IMAGE_CHARS && IMAGE.test(value);
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

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
        failedStep: v.failedStep,
        submittedAt: v.submittedAt,
        decidedAt: v.decidedAt,
        genderCheck: captain.genderCheck?.status || 'not_needed',
        dl: v.dl?.last4 ? { last4: v.dl.last4, validUntil: v.dl.validUntil, classes: v.dl.classes } : undefined,
        vehicle: v.vehicle?.plate ? { plate: v.vehicle.plate, vehicleClass: v.vehicle.vehicleClass } : undefined,
        shift: {
            windowId: window.id,
            label: window.label,
            endsAt: window.endsAt,
            status: thisWindow ? selfie.status : 'needed',
            reason: thisWindow ? selfie.reason : undefined,
            attempts: thisWindow ? selfie.attempts || 0 : 0,
        },
    };
}

// Marks the challenge used and returns its steps, or null if it's unknown,
// expired, already used or for something else. One atomic update, so a
// challenge can never be used twice.
async function consumeChallenge(captainId, challengeId, purpose) {
    if (typeof challengeId !== 'string' || challengeId.length > 100) return null;
    const captain = await captainModel
        .findOneAndUpdate(
            {
                _id: captainId,
                'liveness.idHash': sha256(challengeId),
                'liveness.purpose': purpose,
                'liveness.used': false,
                'liveness.expiresAt': { $gt: new Date() },
            },
            { 'liveness.used': true },
            { new: true }
        )
        .select('+liveness');
    return captain?.liveness?.steps || null;
}

module.exports.getVerification = async (req, res) => {
    res.status(200).json({ verification: verificationView(req.captain) });
};

// A fresh set of random actions for the next face check.
module.exports.createChallenge = async (req, res) => {
    const purpose = req.body?.purpose === 'shift' ? 'shift' : 'verification';
    const status = req.captain.verification?.status;
    if (purpose === 'verification' && (status === 'verified' || status === 'in_review')) {
        return res.status(409).json({ message: 'Verification already submitted.' });
    }
    if (purpose === 'shift' && status !== 'verified') {
        return res.status(403).json({ message: 'Finish identity verification first.', reason: 'verify_first' });
    }
    const challengeId = crypto.randomBytes(24).toString('hex');
    const steps = faceEngine.createSteps(purpose);
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await captainModel.updateOne({ _id: req.captain._id }, { liveness: { idHash: sha256(challengeId), steps, purpose, expiresAt, used: false } });
    res.status(201).json({ challengeId, steps, expiresAt });
};

module.exports.submitVerification = async (req, res) => {
    const captain = req.captain;
    const status = captain.verification?.status;
    if (status === 'verified' || status === 'in_review') {
        return res.status(409).json({ message: 'Verification already submitted.', verification: verificationView(captain) });
    }

    const { dlNumber, dob, dlName, dlImage, selfies, challengeId } = req.body || {};
    const capture = req.body?.capture === 'upload' ? 'upload' : 'camera';
    if (typeof dlNumber !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(dob || '')) || !isImage(dlImage) ||
        !Array.isArray(selfies) || selfies.length < 2 || selfies.length > 4 || !selfies.every(isImage)) {
        return res.status(400).json({ message: 'Please fill in your licence details and take all the photos.', reasons: ['bad_image'] });
    }
    const steps = await consumeChallenge(captain._id, challengeId, 'verification');
    if (!steps || steps.length !== selfies.length) {
        return res.status(400).json({ message: 'This face check has expired. Please start it again.', reason: 'challenge_expired' });
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
    const reject = async (list, failedStep) => {
        captain.verification = { ...base, status: 'rejected', reasons: list, failedStep, decidedAt: now, decidedBy: 'auto' };
        await captain.save();
        return res.status(200).json({ verification: verificationView(captain) });
    };

    // Document problems: no need to look at faces.
    if (reasons.length) return reject(reasons);

    let result;
    try {
        result = await faceEngine.verifyIdentity({ dlImage, selfies, steps, capture });
    } catch (error) {
        if (error instanceof faceEngine.FaceError) return reject([error.code]);
        console.error('Face engine error:', error);
        return res.status(503).json({ message: 'Face check is unavailable right now. Please try again in a few minutes.' });
    }

    const inReview = result.decision === 'in_review';
    captain.verification = {
        ...base,
        status: result.decision,
        reasons: result.reasons,
        failedStep: result.failedStep || undefined,
        decidedAt: inReview ? undefined : now,
        decidedBy: inReview ? undefined : 'auto',
        face: result.face,
        referenceEmbedding: result.referenceEmbedding,
        referenceDescriptor: result.referenceDescriptor,
        referenceLandmarks: result.referenceLandmarks,
        dlEmbedding: result.dlEmbedding,
        dlDescriptor: result.dlDescriptor,
        gallery: [],
        // Photos are kept only while a person needs to look at them.
        dlImage: inReview ? dlImage : undefined,
        selfieImage: inReview ? selfies[0] : undefined,
    };
    if (result.decision !== 'rejected') {
        captain.genderCheck = genderOutcome(captain.gender, result.gender, selfies[0]);
        if (captain.genderCheck.status !== 'verified') captain.womenRidersOnly = false;
    }
    await captain.save();
    res.status(200).json({ verification: verificationView(captain) });
};

// Face check for the current shift window. Riders see the straight photo on the ride card.
module.exports.uploadShiftSelfie = async (req, res) => {
    const captain = await captainModel.findById(req.captain._id).select(FACE_SECRETS);
    if (captain.verification?.status !== 'verified') {
        return res.status(403).json({ message: 'Finish identity verification first.', reason: 'verify_first' });
    }
    const { frames, challengeId } = req.body || {};
    const capture = req.body?.capture === 'upload' ? 'upload' : 'camera';
    if (!Array.isArray(frames) || frames.length < 1 || frames.length > 3 || !frames.every(isImage)) {
        return res.status(400).json({ message: 'Please take the photos again.', reason: 'bad_image' });
    }

    const window = currentShiftWindow();
    const previous = captain.shiftSelfie?.windowId === window.id ? captain.shiftSelfie : null;
    if (previous?.status === 'verified') return res.status(200).json({ verification: verificationView(captain) });
    const attempts = (previous?.attempts || 0) + 1;
    if (previous?.status === 'in_review' || attempts > MAX_SHIFT_ATTEMPTS) {
        return res.status(429).json({ message: 'Your photo is with our team. We will let you know soon.', reason: 'review', verification: verificationView(captain) });
    }
    const steps = await consumeChallenge(captain._id, challengeId, 'shift');
    if (!steps || steps.length !== frames.length) {
        return res.status(400).json({ message: 'This face check has expired. Please start it again.', reason: 'challenge_expired' });
    }

    const v = captain.verification;
    let result;
    try {
        result = await faceEngine.verifyShiftSelfie({
            frames,
            steps,
            capture,
            reference: { embedding: v.referenceEmbedding, descriptor: v.referenceDescriptor, points: v.referenceLandmarks },
            gallery: v.gallery || [],
            dlDescriptor: v.dlDescriptor,
            dlEmbedding: v.dlEmbedding,
        });
    } catch (error) {
        if (error instanceof faceEngine.FaceError) {
            return res.status(422).json({ message: 'We could not see one clear face. Please try again.', reason: error.code });
        }
        console.error('Face engine error:', error);
        return res.status(503).json({ message: 'Face check is unavailable right now. Please try again in a few minutes.' });
    }

    // Too many failed tries in one window go to a person instead of more retries.
    let status = { match: 'verified', review: 'in_review', mismatch: 'rejected', liveness_failed: 'rejected' }[result.decision];
    if (status === 'rejected' && attempts >= MAX_SHIFT_ATTEMPTS) status = 'in_review';
    captain.shiftSelfie = {
        image: frames[0],
        takenAt: new Date(),
        windowId: window.id,
        score: result.fingerprintScore,
        status,
        attempts,
        reason: result.decision === 'liveness_failed' ? `liveness_${result.failedStep}` : result.notes?.[0],
        pendingDescriptor: status === 'in_review' ? result.galleryItem?.descriptor : undefined,
        pendingEmbedding: status === 'in_review' ? result.galleryItem?.embedding : undefined,
    };
    await captain.save();
    if (status === 'verified' && result.galleryItem) await addToGallery(captain._id, result.galleryItem);
    res.status(200).json({ verification: verificationView(captain), score: result.fingerprintScore, failedStep: result.failedStep });
};

// Keeps the newest GALLERY_SIZE verified shift selfies; fills in the original
// reference fingerprint for captains verified before it existed.
async function addToGallery(captainId, item) {
    await captainModel.updateOne(
        { _id: captainId },
        { $push: { 'verification.gallery': { $each: [{ ...item, at: new Date() }], $slice: -GALLERY_SIZE } } }
    );
    await captainModel.updateOne({ _id: captainId, 'verification.referenceDescriptor.0': { $exists: false } }, { 'verification.referenceDescriptor': item.descriptor });
}

// Women captains are confirmed from the same live photos. Only a clear "woman"
// confirms automatically; anything else is for a person to decide (the model
// never rejects anyone's gender by itself).
function genderOutcome(declared, estimate, photo) {
    if (declared !== 'female') return { status: 'not_needed' };
    const base = { estimate: estimate?.estimate, pFemale: estimate?.pFemale };
    if (estimate?.estimate === 'female') return { ...base, status: 'verified', decidedBy: 'auto', decidedAt: new Date() };
    return { ...base, status: 'in_review', reason: estimate?.estimate === 'male' ? 'model_disagrees' : 'unclear', image: photo };
}

// ---------- admin review ----------

module.exports.listReviews = async (req, res) => {
    const window = currentShiftWindow();
    const [identity, shifts, gender] = await Promise.all([
        captainModel
            .find({ 'verification.status': 'in_review' })
            .select('name vehicle verification.submittedAt verification.reasons verification.face verification.dl.last4 verification.dl.name verification.dl.dob +verification.dlImage +verification.selfieImage')
            .sort({ 'verification.submittedAt': 1 })
            .limit(50),
        captainModel
            .find({ 'shiftSelfie.status': 'in_review', 'shiftSelfie.windowId': window.id })
            .select('name vehicle shiftSelfie.windowId shiftSelfie.score shiftSelfie.attempts shiftSelfie.status shiftSelfie.reason +shiftSelfie.image')
            .limit(50),
        captainModel
            .find({ 'genderCheck.status': 'in_review' })
            .select('name vehicle gender genderCheck.estimate genderCheck.pFemale genderCheck.reason +genderCheck.image')
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
            reason: c.shiftSelfie.reason,
            image: c.shiftSelfie.image,
        })),
        gender: gender.map((c) => ({
            captainId: c._id,
            name: c.name,
            vehicle: c.vehicle,
            declared: c.gender,
            estimate: c.genderCheck.estimate,
            pFemale: c.genderCheck.pFemale,
            reason: c.genderCheck.reason,
            image: c.genderCheck.image,
        })),
    });
};

module.exports.decideReview = async (req, res) => {
    const { decision, kind } = req.body || {};
    if (!['approve', 'reject'].includes(decision) || !['identity', 'shift', 'gender'].includes(kind)) {
        return res.status(400).json({ message: 'decision must be approve|reject and kind identity|shift|gender' });
    }
    const captain = await captainModel.findById(req.params.captainId).select('+shiftSelfie.pendingDescriptor +shiftSelfie.pendingEmbedding');
    if (!captain) return res.status(404).json({ message: 'Captain not found' });

    if (kind === 'gender') {
        if (captain.genderCheck?.status !== 'in_review') return res.status(409).json({ message: 'Nothing to review' });
        captain.genderCheck.status = decision === 'approve' ? 'verified' : 'rejected';
        captain.genderCheck.decidedBy = 'admin';
        captain.genderCheck.decidedAt = new Date();
        captain.genderCheck.image = undefined;
        if (decision === 'reject') captain.womenRidersOnly = false;
        await captain.save();
        return res.status(200).json({ ok: true });
    }

    if (kind === 'identity') {
        if (captain.verification?.status !== 'in_review') return res.status(409).json({ message: 'Nothing to review' });
        captain.verification.status = decision === 'approve' ? 'verified' : 'rejected';
        if (decision === 'reject') captain.verification.reasons = [...(captain.verification.reasons || []), 'admin_rejected'];
        captain.verification.decidedAt = new Date();
        captain.verification.decidedBy = 'admin';
        // Reviewed: the photos aren't needed any more.
        captain.verification.dlImage = undefined;
        captain.verification.selfieImage = undefined;
        await captain.save();
        return res.status(200).json({ ok: true });
    }

    if (captain.shiftSelfie?.status !== 'in_review') return res.status(409).json({ message: 'Nothing to review' });
    const pending = captain.shiftSelfie.pendingDescriptor?.length
        ? { descriptor: [...captain.shiftSelfie.pendingDescriptor], embedding: [...(captain.shiftSelfie.pendingEmbedding || [])] }
        : null;
    captain.shiftSelfie.status = decision === 'approve' ? 'verified' : 'rejected';
    captain.shiftSelfie.pendingDescriptor = undefined;
    captain.shiftSelfie.pendingEmbedding = undefined;
    // A rejected shift photo means someone else may be driving: pause dispatch.
    if (decision === 'reject') {
        captain.suspended = true;
        captain.strikes = (captain.strikes || 0) + 1;
    }
    await captain.save();
    if (decision === 'approve' && pending) await addToGallery(captain._id, pending);
    res.status(200).json({ ok: true });
};
