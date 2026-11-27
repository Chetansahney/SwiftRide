// Liveness: the server picks random actions ("turn left", "smile", ...) for
// each check, so a printed photo, a phone screen or a pre-recorded video can't
// pass. Each challenge is single-use and expires.
const crypto = require('crypto');
const { measurePose } = require('./geometry');

const ACTIONS = ['left', 'right', 'up', 'smile'];
const TURNS = ['left', 'right'];

function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(0, i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// Sign-up: straight + two different actions, at least one head turn.
// Each shift: straight + one action.
function createSteps(purpose) {
    if (purpose === 'shift') return ['straight', ACTIONS[crypto.randomInt(0, ACTIONS.length)]];
    const turn = TURNS[crypto.randomInt(0, TURNS.length)];
    const other = shuffle(ACTIONS.filter((action) => action !== turn))[0];
    return ['straight', ...shuffle([turn, other])];
}

// Checks each photo did what was asked. `faces` are the analysed main faces,
// in the same order as `steps` (steps[0] is always "straight").
// Photos from the phone's gallery may be mirrored, so for uploads a head turn
// only has to be clearly to one side (and left/right opposite to each other).
function checkSteps(faces, steps, { capture = 'camera', thresholds }) {
    const t = thresholds;
    const poses = faces.map((face) => measurePose(face.mesh));
    const base = poses[0];
    const mirroredOk = capture === 'upload';

    for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        const pose = poses[i];
        const face = faces[i];
        let ok;
        if (step === 'straight') ok = Math.abs(pose.turn) <= t.maxStraightTurn && Math.abs(face.yaw) < 0.3;
        else if (step === 'left') ok = mirroredOk ? Math.abs(pose.turn) >= t.minTurn : pose.turn >= t.minTurn;
        else if (step === 'right') ok = mirroredOk ? Math.abs(pose.turn) >= t.minTurn : pose.turn <= -t.minTurn;
        else if (step === 'up') ok = base.lift - pose.lift >= t.minLiftDrop;
        else if (step === 'smile') ok = pose.mouth >= base.mouth * t.minSmileGain || (face.happy || 0) >= t.minHappy;
        else ok = false;
        if (!ok) return { passed: false, failedStep: step, poses };
    }

    // Uploads asked for both turns: they must point opposite ways.
    const left = steps.indexOf('left');
    const right = steps.indexOf('right');
    if (mirroredOk && left > 0 && right > 0 && Math.sign(poses[left].turn) === Math.sign(poses[right].turn)) {
        return { passed: false, failedStep: 'right', poses };
    }
    return { passed: true, failedStep: null, poses };
}

module.exports = { createSteps, checkSteps, ACTIONS };
