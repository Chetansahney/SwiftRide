// Loads the face models once and runs them on photos. All MIT-licensed,
// running on WebAssembly inside this server (no native build, no cloud):
//   @vladmandic/human    – detection, 468-point mesh, head pose, anti-spoof,
//                          liveness, expression, and a secondary fingerprint
//   @vladmandic/face-api – ResNet-34 face fingerprint (128 numbers), the
//                          primary identity signal (much stronger in our tests)
const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const MAX_SIDE = 1280;

class FaceError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

// Node's fetch can't read file:// URLs; Human loads its models with fetch.
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

// Package folders (their exports maps hide package.json, so walk up from main).
const packageDir = (name) => path.resolve(path.dirname(require.resolve(name)), '..');

let enginePromise = null;
function getEngine() {
    if (!enginePromise) {
        enginePromise = (async () => {
            installFileFetch();
            const humanDir = packageDir('@vladmandic/human');
            const { Human } = require(path.join(humanDir, 'dist', 'human.node-wasm.js'));
            const wasmDir = path.dirname(require.resolve('@tensorflow/tfjs-backend-wasm/package.json'));
            const human = new Human({
                backend: 'wasm',
                wasmPath: `${pathToFileURL(path.join(wasmDir, 'dist')).href}/`,
                modelBasePath: `${pathToFileURL(path.join(humanDir, 'models')).href}/`,
                debug: false,
                face: {
                    enabled: true,
                    detector: { rotation: true, maxDetected: 3, minConfidence: 0.4 },
                    mesh: { enabled: true },
                    iris: { enabled: false },
                    description: { enabled: true },
                    emotion: { enabled: true, minConfidence: 0.1 },
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

            // face-api shares the same TensorFlow instance and wasm backend.
            const faceapiDir = packageDir('@vladmandic/face-api');
            const faceapi = require(path.join(faceapiDir, 'dist', 'face-api.node-wasm.js'));
            const modelDir = path.join(faceapiDir, 'model');
            await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelDir);
            await faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir);
            await faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir);
            await faceapi.nets.ageGenderNet.loadFromDisk(modelDir);
            return { human, faceapi };
        })();
        enginePromise.catch(() => {
            enginePromise = null;
        });
    }
    return enginePromise;
}

// Run one job at a time: the wasm backend isn't built for parallel inference.
let queue = Promise.resolve();
function serial(job) {
    const run = queue.then(job, job);
    queue = run.catch(() => {});
    return run;
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
        if (buffer[0] === 0xff && buffer[1] === 0xd8) decoded = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 256 });
        else if (buffer[0] === 0x89 && buffer[1] === 0x50) decoded = PNG.sync.read(buffer);
        else throw new FaceError('bad_image');
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

// The ResNet fingerprint (and face-api's gender estimate) for the face Human found at `box`. face-api must find
// and align the face itself: when we forced it onto faces it couldn't find,
// accuracy dropped sharply (AUC 1.00 → 0.86 on licence copies). So a crop
// around the face is tried as-is, then enlarged 2x (small licence photos);
// if it still isn't found, the photo isn't clear enough and we return null
// so the captain is asked to retake it.
async function resnetDescriptor(faceapi, tf, image, box) {
    const [x, y, w, h] = box;
    const margin = 0.8;
    const x0 = Math.max(0, Math.floor(x - w * margin));
    const y0 = Math.max(0, Math.floor(y - h * margin));
    const x1 = Math.min(image.shape[1], Math.ceil(x + w * (1 + margin)));
    const y1 = Math.min(image.shape[0], Math.ceil(y + h * (1 + margin)));
    const crop = tf.slice(image, [y0, x0, 0], [y1 - y0, x1 - x0, 3]);
    const attempts = [
        { input: crop, confidence: 0.3 },
        { input: null, confidence: 0.2, scale: 2 },
    ];
    try {
        for (const attempt of attempts) {
            let input = attempt.input;
            if (attempt.scale) {
                if (Math.max(crop.shape[0], crop.shape[1]) * attempt.scale > 1600) continue;
                input = tf.image.resizeBilinear(crop, [crop.shape[0] * attempt.scale, crop.shape[1] * attempt.scale]);
            }
            try {
                const found = await faceapi
                    .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: attempt.confidence }))
                    .withFaceLandmarks()
                    .withFaceDescriptor()
                    .withAgeAndGender();
                if (found) {
                    return {
                        descriptor: Array.from(found.descriptor),
                        pFemale: found.gender === 'female' ? found.genderProbability : 1 - found.genderProbability,
                    };
                }
            } finally {
                if (input !== crop) input.dispose();
            }
        }
        return null;
    } finally {
        crop.dispose();
    }
}

// Every face in a photo, largest first, with everything the checks need.
async function analyze(image) {
    const { human, faceapi } = await getEngine();
    const { rgb, width, height } = decode(image);
    return serial(async () => {
        const tf = human.tf;
        const image3d = tf.tensor3d(rgb, [height, width, 3]);
        const batch = tf.expandDims(image3d, 0);
        try {
            const result = await human.detect(batch);
            const faces = result.face
                .filter((face) => face.mesh?.length >= 468 && face.embedding?.length)
                .sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])
                .slice(0, 3);
            const out = [];
            for (const face of faces) {
                const resnet = await resnetDescriptor(faceapi, tf, image3d, face.box);
                const humanPFemale = face.gender === 'female' ? face.genderScore : face.gender === 'male' ? 1 - face.genderScore : null;
                out.push({
                    score: face.score,
                    box: face.box,
                    area: face.box[2] * face.box[3],
                    mesh: face.mesh,
                    embedding: Array.from(face.embedding),
                    descriptor: resnet?.descriptor || null,
                    // Probability the face is a woman, from each model (null if unknown).
                    pFemale: { faceapi: resnet?.pFemale ?? null, human: humanPFemale ?? null },
                    yaw: face.rotation?.angle?.yaw ?? 0,
                    pitch: face.rotation?.angle?.pitch ?? 0,
                    roll: face.rotation?.angle?.roll ?? 0,
                    real: face.real,
                    live: face.live,
                    happy: face.emotion?.find((e) => e.emotion === 'happy')?.score ?? 0,
                });
            }
            return out;
        } finally {
            batch.dispose();
            image3d.dispose();
        }
    });
}

// The secondary (Human "faceres") similarity, 0..1.
async function faceresSimilarity(a, b) {
    const { human } = await getEngine();
    return human.match.similarity(a, b);
}

function warm() {
    getEngine().catch((error) => console.error('Face engine failed to load:', error.message));
}

module.exports = { analyze, faceresSimilarity, warm, FaceError, decode };
