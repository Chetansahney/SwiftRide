// SwiftRide face engine.
//
// Matches a captain's live selfie against the photo on their driving licence
// (and later shift selfies against the verified face) using two independent
// signals, both from the MIT-licensed @vladmandic/human models running on
// WebAssembly (no native build, no cloud service):
//
//  1. Face fingerprint — a 1024-number descriptor of the face, compared with
//     a similarity score. This is what decides.
//  2. Landmark "dots" — 468 face-mesh points in 3D; we keep the 51 that don't
//     move with expression (eye corners, nose, brows, forehead, jaw, chin),
//     align the two sets for position, size and head rotation (Procrustes)
//     and measure how far each dot is from its partner.
//
// Calibration on the library's demo photos (18 photos of one man vs 71 other
// people) showed the dots alone can't tell people apart (AUC 0.51 — a coin
// flip: expression, lens and photo age move them as much as identity does),
// while the fingerprint can (AUC 0.89). So the dots are a red flag only: a
// face whose bone structure is further off than any same-person pair we saw
// is never auto-approved. Everything in between goes to a person for review.
// Re-tune THRESHOLDS on real licence/selfie pairs before launch.

const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const THRESHOLDS = {
    // Fingerprint similarity (0–1). At 0.62, 0.5% of wrong-person pairs passed
    // on low-quality web thumbnails; good selfies should do much better.
    fingerprintMatch: 0.62,
    // Below this it's rejected; between the two it goes to review.
    fingerprintReject: 0.35,
    // Aligned 3D dot distance. Same person (faded licence vs selfie) never
    // exceeded 0.27 in calibration; 1.3% of other people were above 0.3.
    landmarkRedFlag: 0.3,
    // Liveness: the head must turn this far (radians) left and right.
    minTurn: 0.2,
    maxStraight: 0.3,
    sameAcrossFrames: 0.4,
    // Antispoof / liveness model scores below this send the case to review.
    realMin: 0.5,
};

// Stable MediaPipe face-mesh points: no mouth or eyelids (they move with expression).
const STABLE_POINTS = [
    // eye corners
    33, 133, 362, 263,
    // nose bridge, tip, nostrils, base
    168, 6, 197, 195, 5, 4, 1, 2, 98, 327,
    // brows
    70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
    // forehead
    10, 109, 338,
    // cheek edges, jaw line, chin
    234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454,
];

const MAX_SIDE = 1280;

// ---------- engine bootstrap ----------

let humanPromise = null;
let queue = Promise.resolve();

// Node's fetch can't read file:// URLs; the models live on disk.
function installFileFetch() {
    if (global.__swiftrideFileFetch) return;
    const realFetch = global.fetch;
    global.fetch = async (url, options) => {
        const href = typeof url === 'string' ? url : url?.url || String(url);
        if (href.startsWith('file:')) {
            const file = fileURLToPath(href);
            const body = await fs.promises.readFile(file);
            const type = file.endsWith('.json') ? 'application/json' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
            return new Response(body, { status: 200, headers: { 'content-type': type } });
        }
        return realFetch(url, options);
    };
    global.__swiftrideFileFetch = true;
}

function getHuman() {
    if (!humanPromise) {
        humanPromise = (async () => {
            installFileFetch();
            // The package's exports map hides package.json, so walk up from its main file.
            const modules = path.resolve(path.dirname(require.resolve('@vladmandic/human')), '..');
            const { Human } = require(path.join(modules, 'dist', 'human.node-wasm.js'));
            const wasmDir = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json'));
            const human = new Human({
                backend: 'wasm',
                wasmPath: `${pathToFileURL(path.join(wasmDir, 'dist')).href}/`,
                modelBasePath: `${pathToFileURL(path.join(modules, 'models')).href}/`,
                debug: false,
                face: {
                    enabled: true,
                    detector: { rotation: true, maxDetected: 3, minConfidence: 0.4 },
                    mesh: { enabled: true },
                    iris: { enabled: false },
                    description: { enabled: true },
                    emotion: { enabled: false },
                    antispoof: { enabled: true },
                    liveness: { enabled: true },
                },
                body: { enabled: false },
                hand: { enabled: false },
                object: { enabled: false },
                gesture: { enabled: false },
                segmentation: { enabled: false },
                filter: { enabled: false },
            });
            await human.load();
            return human;
        })();
        humanPromise.catch(() => {
            humanPromise = null;
        });
    }
    return humanPromise;
}

// Run one job at a time: the wasm backend isn't built for parallel inference.
function serial(job) {
    const run = queue.then(job, job);
    queue = run.catch(() => {});
    return run;
}

// ---------- image decoding ----------

class FaceError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

function toBuffer(image) {
    if (Buffer.isBuffer(image)) return image;
    const match = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(String(image || ''));
    if (!match) throw new FaceError('bad_image');
    return Buffer.from(match[1], 'base64');
}

function decode(image) {
    const buffer = toBuffer(image);
    let decoded;
    try {
        if (buffer[0] === 0xff && buffer[1] === 0xd8) {
            decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 256 });
        } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
            decoded = PNG.sync.read(buffer);
        } else {
            throw new FaceError('bad_image');
        }
    } catch (error) {
        throw error instanceof FaceError ? error : new FaceError('bad_image');
    }
    const { width, height, data } = decoded;
    // Nearest-neighbour downscale of very large photos keeps inference fast.
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const rgb = new Float32Array(w * h * 3);
    for (let y = 0, q = 0; y < h; y += 1) {
        const sy = Math.min(height - 1, Math.floor(y / scale));
        for (let x = 0; x < w; x += 1) {
            const sx = Math.min(width - 1, Math.floor(x / scale));
            const p = (sy * width + sx) * 4;
            rgb[q++] = data[p];
            rgb[q++] = data[p + 1];
            rgb[q++] = data[p + 2];
        }
    }
    return { rgb, width: w, height: h };
}

// ---------- analysis ----------

async function analyze(image) {
    const human = await getHuman();
    const { rgb, width, height } = decode(image);
    return serial(async () => {
        const tensor = human.tf.tensor4d(rgb, [1, height, width, 3]);
        try {
            const result = await human.detect(tensor);
            return result.face
                .filter((face) => face.mesh?.length >= 468 && face.embedding?.length)
                .map((face) => ({
                    score: face.score,
                    box: face.box,
                    area: face.box[2] * face.box[3],
                    mesh: face.mesh,
                    embedding: Array.from(face.embedding),
                    yaw: face.rotation?.angle?.yaw ?? 0,
                    pitch: face.rotation?.angle?.pitch ?? 0,
                    roll: face.rotation?.angle?.roll ?? 0,
                    real: face.real,
                    live: face.live,
                }))
                .sort((a, b) => b.area - a.area);
        } finally {
            tensor.dispose();
        }
    });
}

// The main face in a photo. Selfies must contain one person; licence cards can
// have a small "ghost" photo, so only a clearly-large second face counts.
function primaryFace(faces, { selfie }) {
    if (!faces.length) throw new FaceError(selfie ? 'no_face_selfie' : 'no_face_dl');
    if (selfie && faces.length > 1 && faces[1].area > faces[0].area * 0.35) {
        throw new FaceError('multiple_faces');
    }
    return faces[0];
}

// ---------- landmark geometry ----------

// 3D points (x, y, depth) so a slight head turn or tilt can be aligned away.
function stablePoints(mesh) {
    return STABLE_POINTS.map((index) => [mesh[index][0], mesh[index][1], mesh[index][2] || 0]);
}

function centreAndScale(points) {
    const n = points.length;
    const c = [0, 1, 2].map((k) => points.reduce((s, p) => s + p[k], 0) / n);
    const centred = points.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]]);
    const size = Math.sqrt(centred.reduce((s, p) => s + p[0] ** 2 + p[1] ** 2 + p[2] ** 2, 0) / n) || 1;
    return centred.map((p) => [p[0] / size, p[1] / size, p[2] / size]);
}

// Largest eigenvector of a symmetric 4x4 matrix (Jacobi rotations).
function topEigenvector(m) {
    const a = m.map((row) => row.slice());
    const v = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep += 1) {
        let off = 0;
        for (let p = 0; p < 4; p += 1) for (let q = p + 1; q < 4; q += 1) off += a[p][q] ** 2;
        if (off < 1e-18) break;
        for (let p = 0; p < 4; p += 1) {
            for (let q = p + 1; q < 4; q += 1) {
                if (Math.abs(a[p][q]) < 1e-15) continue;
                const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
                const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(t * t + 1);
                const s = t * c;
                for (let k = 0; k < 4; k += 1) {
                    const akp = a[k][p];
                    const akq = a[k][q];
                    a[k][p] = c * akp - s * akq;
                    a[k][q] = s * akp + c * akq;
                }
                for (let k = 0; k < 4; k += 1) {
                    const apk = a[p][k];
                    const aqk = a[q][k];
                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }
                for (let k = 0; k < 4; k += 1) {
                    const vkp = v[k][p];
                    const vkq = v[k][q];
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }
    let best = 0;
    for (let k = 1; k < 4; k += 1) if (a[k][k] > a[best][best]) best = k;
    return v.map((row) => row[best]);
}

// Procrustes: centre, scale to unit size, find the best 3D rotation of B onto A
// (Horn's quaternion method), then return the RMS distance between partners.
function procrustesDistance(a, b) {
    const pa = centreAndScale(a);
    const pb = centreAndScale(b);
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < pa.length; i += 1) for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) S[r][c] += pb[i][r] * pa[i][c];
    const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
    const q = topEigenvector([
        [xx + yy + zz, yz - zy, zx - xz, xy - yx],
        [yz - zy, xx - yy - zz, xy + yx, zx + xz],
        [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
        [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
    ]);
    const [w, x, y, z] = q;
    const R = [
        [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
    ];
    let sum = 0;
    for (let i = 0; i < pa.length; i += 1) {
        const p = pb[i];
        for (let r = 0; r < 3; r += 1) {
            const rotated = R[r][0] * p[0] + R[r][1] * p[1] + R[r][2] * p[2];
            sum += (pa[i][r] - rotated) ** 2;
        }
    }
    return Math.sqrt(sum / pa.length);
}

// Dot similarity for display: 0 distance → 1.0, red-flag distance and beyond → ~0.
function landmarkSimilarity(pointsA, pointsB) {
    const distance = procrustesDistance(pointsA, pointsB);
    return { distance, score: Math.max(0, Math.min(1, 1 - distance / (THRESHOLDS.landmarkRedFlag * 1.2))) };
}

// ---------- comparison ----------

async function fingerprintSimilarity(a, b) {
    const human = await getHuman();
    return human.match.similarity(a, b);
}

async function compareFaces(reference, candidate) {
    const fingerprint = await fingerprintSimilarity(reference.embedding, candidate.embedding);
    const landmarks = landmarkSimilarity(reference.points, candidate.points);
    const redFlag = landmarks.distance > THRESHOLDS.landmarkRedFlag;

    let decision = 'review';
    if (fingerprint < THRESHOLDS.fingerprintReject) decision = 'mismatch';
    else if (fingerprint >= THRESHOLDS.fingerprintMatch && !redFlag) decision = 'match';
    return {
        decision,
        fingerprintScore: round(fingerprint),
        landmarkScore: round(landmarks.score),
        landmarkDistance: round(landmarks.distance, 4),
        landmarkRedFlag: redFlag,
    };
}

const round = (value, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits;

const describe = (face) => ({
    embedding: face.embedding,
    points: stablePoints(face.mesh),
    yaw: face.yaw,
});

// ---------- public API ----------

// Sign-up check: licence photo + three selfies (straight, left, right).
async function verifyIdentity({ dlImage, selfies }) {
    const reasons = [];
    const dlFace = primaryFace(await analyze(dlImage), { selfie: false });
    const frames = [];
    for (const selfie of selfies) {
        frames.push(primaryFace(await analyze(selfie), { selfie: true }));
    }
    const [straight, ...turns] = frames;

    // Liveness: straight first, then the head clearly turned both ways, and the
    // same person throughout (a printed photo or a screen can't turn its head).
    const yaws = frames.map((frame) => frame.yaw);
    const turnedBothWays =
        turns.length >= 2 &&
        Math.min(...turns.map((f) => f.yaw)) <= -THRESHOLDS.minTurn &&
        Math.max(...turns.map((f) => f.yaw)) >= THRESHOLDS.minTurn;
    let sameAcross = true;
    for (const turn of turns) {
        if ((await fingerprintSimilarity(straight.embedding, turn.embedding)) < THRESHOLDS.sameAcrossFrames) {
            sameAcross = false;
        }
    }
    const lookingStraight = Math.abs(straight.yaw) < THRESHOLDS.maxStraight;
    const livenessPassed = turnedBothWays && sameAcross && lookingStraight;
    if (!livenessPassed) reasons.push('liveness_failed');
    const realScore = Math.min(straight.real ?? 1, straight.live ?? 1);

    const match = await compareFaces(describe(dlFace), describe(straight));
    if (match.decision === 'mismatch') reasons.push('face_mismatch');
    if (match.decision === 'review') reasons.push('face_borderline');

    // A failed head-turn is a retry ("try again"), not a case for review.
    let decision = 'verified';
    if (match.decision === 'mismatch' || !livenessPassed) decision = 'rejected';
    else if (match.decision === 'review' || realScore < THRESHOLDS.realMin) decision = 'in_review';

    return {
        decision,
        reasons,
        face: {
            fingerprintScore: match.fingerprintScore,
            landmarkScore: match.landmarkScore,
            landmarkRedFlag: match.landmarkRedFlag,
            livenessPassed,
            yaw: yaws.map((yaw) => round(yaw)),
            real: round(realScore),
        },
        referenceEmbedding: straight.embedding,
        referenceLandmarks: describe(straight).points.flat(),
        dlEmbedding: dlFace.embedding,
    };
}

// Each shift window: one selfie against the verified selfie and the licence.
async function verifyShiftSelfie({ selfie, referenceEmbedding, referenceLandmarks, dlEmbedding }) {
    const face = primaryFace(await analyze(selfie), { selfie: true });
    const candidate = describe(face);
    const points = [];
    for (let i = 0; i < (referenceLandmarks || []).length; i += 3) points.push([referenceLandmarks[i], referenceLandmarks[i + 1], referenceLandmarks[i + 2]]);
    const reference = { embedding: referenceEmbedding, points: points.length ? points : candidate.points, yaw: 0 };
    const vsReference = await compareFaces(reference, candidate);
    const vsLicence = dlEmbedding?.length ? await fingerprintSimilarity(dlEmbedding, face.embedding) : null;
    const realScore = Math.min(face.real ?? 1, face.live ?? 1);

    let decision = vsReference.decision;
    if (decision === 'match' && vsLicence != null && vsLicence < THRESHOLDS.fingerprintReject) decision = 'review';
    if (decision === 'match' && realScore < THRESHOLDS.realMin) decision = 'review';
    return { decision, ...vsReference, licenceScore: vsLicence == null ? null : round(vsLicence), real: round(realScore) };
}

// Load models in the background at startup so the first check isn't slow.
function warm() {
    getHuman().catch((error) => console.error('Face engine failed to load:', error.message));
}

module.exports = { verifyIdentity, verifyShiftSelfie, analyze, compareFaces, describe, warm, FaceError, THRESHOLDS, STABLE_POINTS };
