// Face-mesh geometry: the stable "dots" comparison (Procrustes alignment in 3D)
// and simple pose / expression measures used by the liveness challenges.
// Mesh indices follow MediaPipe's 468-point face mesh.

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

const dist2d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Pose and expression from the mesh, in image coordinates of an UNMIRRORED photo:
//   turn  > 0 → the person turned to THEIR left (nose moves to the image's right)
//   lift  smaller than the straight photo's → looking up (nose rises towards the eyes)
//   mouth mouth width relative to eye distance (grows with a smile)
function measurePose(mesh) {
    const nose = mesh[1];
    const eyeA = mesh[33];
    const eyeB = mesh[263];
    const chin = mesh[152];
    const eyeMid = [(eyeA[0] + eyeB[0]) / 2, (eyeA[1] + eyeB[1]) / 2];
    const interocular = dist2d(eyeA, eyeB) || 1;
    const chinDrop = chin[1] - eyeMid[1] || 1;
    return {
        turn: (nose[0] - eyeMid[0]) / interocular,
        lift: (nose[1] - eyeMid[1]) / chinDrop,
        mouth: dist2d(mesh[61], mesh[291]) / interocular,
    };
}

module.exports = { STABLE_POINTS, stablePoints, procrustesDistance, measurePose };
