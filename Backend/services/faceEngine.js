// SwiftRide face engine (v2).
//
// Matches a captain's live selfies against the photo on their driving licence
// at sign-up, and every shift against their verified face. Three independent
// signals, all from MIT-licensed models running inside this server:
//
//  1. ResNet face fingerprint (face-api, 128 numbers) — decides. On our
//     calibration set it separated the same person from different people
//     completely (AUC 1.000; same person ≤ 0.556 apart, others ≥ 0.574).
//  2. Human "faceres" fingerprint — second opinion. If it strongly disagrees,
//     a match goes to a person instead of being approved.
//  3. Face "dots" — 48 stable mesh points aligned in 3D. Too noisy to decide
//     on their own (AUC 0.51), so a shape that's far off is a red flag only.
//
// Liveness is a random, single-use challenge (straight + random actions such as
// "turn left", "look up", "smile"), checked from the mesh geometry.
// Thresholds live in config/faceThresholds.json; `npm run face:calibrate`
// re-derives them from real licence/selfie pairs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { analyze, faceresSimilarity, warm, FaceError } = require('./face/models');
const { stablePoints, procrustesDistance, STABLE_POINTS } = require('./face/geometry');
const { createSteps, checkSteps } = require('./face/liveness');

const DEFAULTS = {
    matchDistance: 0.5,
    reviewDistance: 0.6,
    faceresDisagree: 0.3,
    landmarkRedFlag: 0.3,
    sameAcrossFrames: 0.6,
    galleryDriftLimit: 0.6,
    licenceShiftLimit: 0.65,
    realMin: 0.5,
    minTurn: 0.15,
    maxStraightTurn: 0.12,
    minLiftDrop: 0.05,
    minSmileGain: 1.08,
    minHappy: 0.6,
    // Women-only features: probability (face-api) that the live photos show a woman.
    femaleConfirm: 0.7,
    femaleFloor: 0.5,
    maleConfirm: 0.3,
    // Legacy (faceres-only) thresholds, used when an older record has no ResNet fingerprint.
    legacyMatch: 0.62,
    legacyReject: 0.35,
};
const THRESHOLDS_FILE = path.join(__dirname, '..', 'config', 'faceThresholds.json');

function loadThresholds() {
    try {
        const fromFile = JSON.parse(fs.readFileSync(THRESHOLDS_FILE, 'utf8'));
        const numbers = Object.fromEntries(Object.entries(fromFile).filter(([, value]) => typeof value === 'number'));
        return { ...DEFAULTS, ...numbers };
    } catch {
        return { ...DEFAULTS };
    }
}
const THRESHOLDS = loadThresholds();

const round = (value, digits = 3) => (value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const euclid = (a, b) => Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
// 0.4 apart → 100%, 0.5 → 75%, 0.6 → 50%, 0.8+ → 0%: an easy-to-read score for reviewers.
const matchScore = (distance) => Math.max(0, Math.min(1, (0.8 - distance) / 0.4));

// The main face in a photo. Selfies must contain one person; licence cards can
// have a small "ghost" photo, so only a clearly-large second face counts.
function primaryFace(faces, { selfie }) {
    if (!faces.length) throw new FaceError(selfie ? 'no_face_selfie' : 'no_face_dl');
    if (selfie && faces.length > 1 && faces[1].area > faces[0].area * 0.35) throw new FaceError('multiple_faces');
    return faces[0];
}

const describe = (face) => ({
    embedding: face.embedding,
    descriptor: face.descriptor || null,
    points: stablePoints(face.mesh),
    yaw: face.yaw,
});

function unflattenPoints(flat) {
    const points = [];
    for (let i = 0; i + 2 < (flat || []).length; i += 3) points.push([flat[i], flat[i + 1], flat[i + 2]]);
    return points;
}

// match / review / mismatch for one pair of faces.
async function compareFaces(reference, candidate) {
    const t = THRESHOLDS;
    const faceres = reference.embedding?.length && candidate.embedding?.length ? await faceresSimilarity(reference.embedding, candidate.embedding) : null;
    let landmarkDistance = null;
    if (reference.points?.length && candidate.points?.length === reference.points.length) {
        landmarkDistance = procrustesDistance(reference.points, candidate.points);
    }
    const redFlag = landmarkDistance != null && landmarkDistance > t.landmarkRedFlag;

    let decision;
    let distance = null;
    let model;
    if (reference.descriptor?.length && candidate.descriptor?.length) {
        model = 'resnet';
        distance = euclid(reference.descriptor, candidate.descriptor);
        if (distance > t.reviewDistance) decision = 'mismatch';
        else if (distance <= t.matchDistance && !redFlag && (faceres == null || faceres >= t.faceresDisagree)) decision = 'match';
        else decision = 'review';
    } else {
        // Older records without a ResNet fingerprint: never auto-approve on this alone.
        model = 'faceres';
        if (faceres == null || faceres < t.legacyReject) decision = 'mismatch';
        else decision = 'review';
    }
    return {
        decision,
        model,
        distance: round(distance, 4),
        fingerprintScore: round(distance != null ? matchScore(distance) : faceres),
        faceresScore: round(faceres),
        landmarkScore: landmarkDistance == null ? null : round(Math.max(0, 1 - landmarkDistance / (t.landmarkRedFlag * 1.2))),
        landmarkDistance: round(landmarkDistance, 4),
        landmarkRedFlag: redFlag,
    };
}

// The fingerprint needs a clear face; otherwise ask for a retake rather than
// guess from a poor photo.
function requireClearFace(face, code) {
    if (!face.descriptor) throw new FaceError(code);
    return face;
}

// Analyses each live photo and runs the challenge + same-person checks.
async function checkLiveness(images, steps, capture) {
    if (!Array.isArray(images) || images.length !== steps.length) throw new FaceError('bad_image');
    // Sending the same photo several times is not a live person.
    const hashes = images.map((image) => crypto.createHash('sha256').update(String(image)).digest('hex'));
    const repeated = hashes.findIndex((hash, i) => hashes.indexOf(hash) !== i);
    const faces = [];
    for (const image of images) faces.push(primaryFace(await analyze(image), { selfie: true }));
    const [straight] = faces;
    requireClearFace(straight, 'selfie_unclear');

    const challenge = repeated === -1 ? checkSteps(faces, steps, { capture, thresholds: THRESHOLDS }) : { passed: false, failedStep: steps[repeated] };
    let sameAcross = true;
    for (const face of faces.slice(1)) {
        if (straight.descriptor && face.descriptor) {
            if (euclid(straight.descriptor, face.descriptor) > THRESHOLDS.sameAcrossFrames) sameAcross = false;
        } else if ((await faceresSimilarity(straight.embedding, face.embedding)) < 0.4) {
            sameAcross = false;
        }
    }
    const real = Math.min(straight.real ?? 1, straight.live ?? 1);
    return {
        faces,
        straight,
        passed: challenge.passed && sameAcross,
        failedStep: challenge.failedStep || (sameAcross ? null : 'same_person'),
        real,
        turns: (challenge.poses || []).map((pose) => round(pose.turn)),
    };
}

// Gender estimate for the women-only features, averaged over the live photos.
// face-api's estimate only: on our calibration photos it separated men
// (≤ 0.16 "woman") from women (≥ 0.72) cleanly, while Human's was too noisy.
// "female" confirms automatically; anything else goes to a person — the model
// never rejects anyone's gender on its own.
function estimateGender(faces) {
    const t = THRESHOLDS;
    const values = faces.map((face) => face.pFemale?.faceapi).filter((value) => typeof value === 'number');
    if (!values.length) return { estimate: 'uncertain', pFemale: null, photos: 0 };
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    let estimate = 'uncertain';
    if (average >= t.femaleConfirm && Math.min(...values) >= t.femaleFloor) estimate = 'female';
    else if (average <= t.maleConfirm) estimate = 'male';
    return { estimate, pFemale: round(average), photos: values.length };
}

// Sign-up: licence photo + one live photo per challenge step.
async function verifyIdentity({ dlImage, selfies, steps = ['straight', 'left', 'right'], capture = 'camera' }) {
    const dlFace = requireClearFace(primaryFace(await analyze(dlImage), { selfie: false }), 'dl_unclear');
    const live = await checkLiveness(selfies, steps, capture);
    const match = await compareFaces(describe(dlFace), describe(live.straight));

    const reasons = [];
    if (!live.passed) reasons.push('liveness_failed');
    if (match.decision === 'mismatch') reasons.push('face_mismatch');
    if (match.decision === 'review') reasons.push('face_borderline');
    if (live.passed && match.decision === 'match' && live.real < THRESHOLDS.realMin) reasons.push('spoof_check');

    // A failed challenge is a retry ("try again"), not a case for review.
    let decision = 'verified';
    if (match.decision === 'mismatch' || !live.passed) decision = 'rejected';
    else if (match.decision === 'review' || live.real < THRESHOLDS.realMin) decision = 'in_review';

    const reference = describe(live.straight);
    return {
        decision,
        reasons,
        gender: estimateGender(live.faces),
        failedStep: live.failedStep,
        face: {
            fingerprintScore: match.fingerprintScore,
            distance: match.distance,
            faceresScore: match.faceresScore,
            landmarkScore: match.landmarkScore,
            landmarkRedFlag: match.landmarkRedFlag,
            livenessPassed: live.passed,
            steps,
            turns: live.turns,
            real: round(live.real),
            model: match.model,
        },
        referenceEmbedding: reference.embedding,
        referenceDescriptor: reference.descriptor,
        referenceLandmarks: reference.points.flat(),
        dlEmbedding: dlFace.embedding,
        dlDescriptor: dlFace.descriptor,
    };
}

// Each shift window: live photos for the challenge, matched against the
// captain's gallery of verified selfies (adapts to beards, glasses, ageing),
// while staying close to the original verified face and the licence.
async function verifyShiftSelfie({ frames, steps = ['straight'], capture = 'camera', reference, gallery = [], dlDescriptor, dlEmbedding }) {
    const t = THRESHOLDS;
    const live = await checkLiveness(frames, steps, capture);
    const candidate = describe(live.straight);
    const original = { embedding: reference.embedding, descriptor: reference.descriptor, points: unflattenPoints(reference.points) };

    const vsOriginal = await compareFaces(original, candidate);
    let best = vsOriginal;
    for (const item of gallery) {
        const result = await compareFaces({ embedding: item.embedding, descriptor: item.descriptor }, candidate);
        if (result.distance != null && (best.distance == null || result.distance < best.distance)) best = result;
    }

    let decision = best.decision;
    const notes = [];
    // Drift guard: matching a recent selfie isn't enough if the face has moved
    // away from the originally verified one.
    if (decision === 'match' && vsOriginal.distance != null && vsOriginal.distance > t.galleryDriftLimit) {
        decision = 'review';
        notes.push('drift');
    }
    // The licence photo should still roughly agree.
    let licenceDistance = null;
    if (dlDescriptor?.length && candidate.descriptor) {
        licenceDistance = euclid(dlDescriptor, candidate.descriptor);
        if (decision === 'match' && licenceDistance > t.licenceShiftLimit) {
            decision = 'review';
            notes.push('licence');
        }
    } else if (dlEmbedding?.length && decision === 'match' && (await faceresSimilarity(dlEmbedding, candidate.embedding)) < t.legacyReject) {
        decision = 'review';
        notes.push('licence');
    }
    if (decision === 'match' && live.real < t.realMin) {
        decision = 'review';
        notes.push('spoof_suspected');
    }
    if (!live.passed) decision = 'liveness_failed';

    return {
        decision,
        notes,
        failedStep: live.failedStep,
        fingerprintScore: best.fingerprintScore,
        distance: best.distance,
        originalDistance: vsOriginal.distance,
        licenceDistance: round(licenceDistance, 4),
        real: round(live.real),
        model: best.model,
        // Added to the gallery when this check is approved.
        galleryItem: candidate.descriptor ? { descriptor: candidate.descriptor, embedding: candidate.embedding } : null,
    };
}

module.exports = {
    verifyIdentity,
    verifyShiftSelfie,
    compareFaces,
    analyze,
    describe,
    createSteps,
    estimateGender,
    warm,
    FaceError,
    THRESHOLDS,
    STABLE_POINTS,
    loadThresholds,
};
