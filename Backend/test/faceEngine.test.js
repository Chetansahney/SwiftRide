// Runs the real face models (WebAssembly) on demo faces. Slower than the other
// tests (~1–2 s per photo), so it uses a small sample.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { face, HIM, OTHERS, LICENCE } = require('./faceFixtures');
const engine = require('../services/faceEngine');
const { start, stop, reset, api, auth, captain, mongoose } = require('./helpers');

before(start);
after(stop);
beforeEach(reset);

const T = { timeout: 120000 };

test('same person (licence vs live) is never rejected; different people are never approved', T, async () => {
    const licence = engine.describe((await engine.analyze(face(LICENCE, { licence: true })))[0]);
    for (const id of [HIM.straight, ...HIM.other]) {
        const result = await engine.compareFaces(licence, engine.describe((await engine.analyze(face(id)))[0]));
        assert.notEqual(result.decision, 'mismatch', `him ${id}: ${JSON.stringify(result)}`);
        assert.equal(result.model, 'resnet');
    }
    for (const id of OTHERS) {
        const result = await engine.compareFaces(licence, engine.describe((await engine.analyze(face(id)))[0]));
        assert.notEqual(result.decision, 'match', `other ${id}: ${JSON.stringify(result)}`);
    }
});

test('liveness: the requested actions must be done, in order, by the same person', T, async () => {
    const dlImage = face(LICENCE, { licence: true });
    const ok = await engine.verifyIdentity({ dlImage, selfies: [face(HIM.straight), face(HIM.left), face(HIM.right)], steps: ['straight', 'left', 'right'] });
    assert.equal(ok.face.livenessPassed, true, JSON.stringify(ok.face));
    assert.notEqual(ok.decision, 'rejected');

    const swapped = await engine.verifyIdentity({ dlImage, selfies: [face(HIM.straight), face(HIM.right), face(HIM.left)], steps: ['straight', 'left', 'right'] });
    assert.equal(swapped.decision, 'rejected');
    assert.equal(swapped.failedStep, 'left');

    const samePhoto = await engine.verifyIdentity({ dlImage, selfies: [face(HIM.straight), face(HIM.straight), face(HIM.straight)], steps: ['straight', 'left', 'right'] });
    assert.equal(samePhoto.decision, 'rejected', 'a held-up photo can’t turn its head');

    const swapPerson = await engine.verifyIdentity({ dlImage, selfies: [face(HIM.straight), face(HIM.left), face(OTHERS[0], { mirror: true })], steps: ['straight', 'left', 'right'], capture: 'upload' });
    assert.equal(swapPerson.face.livenessPassed, false, 'all photos must be the same person');
});

test('uploaded (possibly mirrored) photos only need clear turns in opposite directions', T, async () => {
    const dlImage = face(LICENCE, { licence: true });
    const mirrored = await engine.verifyIdentity({
        dlImage,
        selfies: [face(HIM.straight, { mirror: true }), face(HIM.left, { mirror: true }), face(HIM.right, { mirror: true })],
        steps: ['straight', 'left', 'right'],
        capture: 'upload',
    });
    assert.equal(mirrored.face.livenessPassed, true);
});

test('shift check: matches the gallery but never drifts away from the original face', T, async () => {
    const original = engine.describe((await engine.analyze(face(HIM.straight)))[0]);
    const reference = { embedding: original.embedding, descriptor: original.descriptor, points: original.points.flat() };
    const genuine = await engine.verifyShiftSelfie({ frames: [face(HIM.other[2])], steps: ['straight'], reference, gallery: [] });
    assert.notEqual(genuine.decision, 'mismatch', JSON.stringify(genuine));

    // A gallery "poisoned" with someone else must not let that person through.
    const impostor = engine.describe((await engine.analyze(face(OTHERS[0])))[0]);
    const poisoned = await engine.verifyShiftSelfie({
        frames: [face(OTHERS[0])],
        steps: ['straight'],
        reference,
        gallery: [{ descriptor: impostor.descriptor, embedding: impostor.embedding }],
    });
    assert.notEqual(poisoned.decision, 'match', JSON.stringify(poisoned));
});

test('a licence photo too poor to read asks for a retake instead of guessing', T, async () => {
    await assert.rejects(
        engine.verifyIdentity({ dlImage: face('0.0', { licence: true }), selfies: [face(HIM.straight), face(HIM.left), face(HIM.right)], steps: ['straight', 'left', 'right'] }),
        (error) => error.code === 'dl_unclear'
    );
});

test('challenges are random, single-use and checked by the server', T, async () => {
    const c = await captain({ verified: false });
    const first = await api().post('/captains/liveness-challenge').set(auth(c.token)).send({ purpose: 'verification' });
    assert.equal(first.status, 201);
    assert.equal(first.body.steps[0], 'straight');
    assert.equal(first.body.steps.length, 3);
    assert.ok(first.body.steps.some((s) => s === 'left' || s === 'right'), 'at least one head turn');

    const body = (challengeId, selfies) => ({
        dlNumber: 'WB0120110012345',
        dob: '1988-04-12',
        dlName: 'Test',
        dlImage: face(LICENCE, { licence: true }),
        selfies,
        challengeId,
    });
    const three = [face(HIM.straight), face(HIM.left), face(HIM.right)];
    assert.equal((await api().post('/captains/verification').set(auth(c.token)).send(body('made-up-id', three))).status, 400);
    const used = await api().post('/captains/verification').set(auth(c.token)).send(body(first.body.challengeId, three));
    assert.equal(used.status, 200);
    // The same challenge can't be replayed.
    await mongoose.model('Captain').updateOne({ _id: c.id }, { 'verification.status': 'rejected' });
    const replay = await api().post('/captains/verification').set(auth(c.token)).send(body(first.body.challengeId, three));
    assert.equal(replay.status, 400);
    assert.equal(replay.body.reason, 'challenge_expired');
});

// "Look up" and "smile" have no labelled demo photos, so their geometry is
// checked on synthetic meshes (eye corners 33/263, nose 1, chin 152, mouth 61/291).
test('challenge geometry: look up and smile are measured against the straight photo', () => {
    const { checkSteps } = require('../services/face/liveness');
    const mesh = ({ noseX = 50, noseY = 60, mouthHalf = 15 } = {}) => {
        const m = Array.from({ length: 468 }, () => [50, 50, 0]);
        m[33] = [35, 50, 0];
        m[263] = [65, 50, 0];
        m[1] = [noseX, noseY, 0];
        m[152] = [50, 90, 0];
        m[61] = [50 - mouthHalf, 75, 0];
        m[291] = [50 + mouthHalf, 75, 0];
        return m;
    };
    const f = (opts, extra = {}) => ({ mesh: mesh(opts), yaw: 0, happy: 0, ...extra });
    const thresholds = engine.THRESHOLDS;
    const straight = f();
    assert.equal(checkSteps([straight, f({ noseY: 56 })], ['straight', 'up'], { thresholds }).passed, true, 'nose rises towards the eyes');
    assert.equal(checkSteps([straight, f({ noseY: 60 })], ['straight', 'up'], { thresholds }).passed, false, 'no change');
    assert.equal(checkSteps([straight, f({ mouthHalf: 17 })], ['straight', 'smile'], { thresholds }).passed, true, 'wider mouth');
    assert.equal(checkSteps([straight, f({}, { happy: 0.9 })], ['straight', 'smile'], { thresholds }).passed, true, 'expression model says happy');
    assert.equal(checkSteps([straight, f()], ['straight', 'smile'], { thresholds }).passed, false, 'no smile');
    assert.equal(checkSteps([f({ noseX: 58 }), f()], ['straight', 'smile'], { thresholds }).passed, false, 'first photo must look straight');
    assert.equal(checkSteps([straight, f({ noseX: 56 })], ['straight', 'left'], { thresholds }).passed, true, 'left = nose to image right (unmirrored)');
    assert.equal(checkSteps([straight, f({ noseX: 56 })], ['straight', 'right'], { thresholds }).passed, false);
});

test('gender estimate: the man is never confirmed as a woman; clear women photos are', T, async () => {
    const faces = async (ids) => Promise.all(ids.map(async (id) => (await engine.analyze(face(id)))[0]));
    const him = engine.estimateGender(await faces([HIM.straight, HIM.left, HIM.right]));
    assert.notEqual(him.estimate, 'female', JSON.stringify(him));
    const her = engine.estimateGender(await faces(['3.2', '3.6', '5.0']));
    assert.equal(her.estimate, 'female', JSON.stringify(her));
});
