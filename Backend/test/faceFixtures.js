// Test faces cut from the face library's own demo sheet (no real users' photos).
// Row 0 is one man in 18 different photos; rows 2–5 are other people.
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

const sheetPath = path.join(path.dirname(require.resolve('@vladmandic/human')), '..', 'assets', 'screenshot-facematch.jpg');
let sheet;
const ROWS = [286, 399, 511, 624, 737, 849];

// "0.10" → a selfie-style crop; { licence: true } → small, faded, low-quality copy.
function face(id, { licence = false, mirror = false } = {}) {
    sheet = sheet || jpeg.decode(fs.readFileSync(sheetPath), { useTArray: true, maxMemoryUsageInMB: 512 });
    const [row, col] = id.split('.').map(Number);
    const x0 = Math.round((col * 1920) / 18) + 3;
    const y0 = ROWS[row] + 14;
    const s = licence ? 1.2 : 1.6;
    const pad = 40;
    const w = Math.round(100 * s);
    const h = Math.round(82 * s);
    const ow = w + pad * 2;
    const oh = h + pad * 2;
    const out = Buffer.alloc(ow * oh * 4, 120);
    for (let j = 0; j < h; j += 1) {
        for (let i = 0; i < w; i += 1) {
            const p = ((y0 + Math.floor(j / s)) * sheet.width + x0 + Math.floor(i / s)) * 4;
            const ti = mirror ? w - 1 - i : i;
            const q = ((j + pad) * ow + ti + pad) * 4;
            for (let c = 0; c < 3; c += 1) {
                out[q + c] = licence ? Math.max(0, Math.min(255, (sheet.data[p + c] - 128) * 0.8 + 128 + [12, 5, -10][c])) : sheet.data[p + c];
            }
            out[q + 3] = 255;
        }
    }
    return `data:image/jpeg;base64,${jpeg.encode({ data: out, width: ow, height: oh }, licence ? 35 : 90).data.toString('base64')}`;
}

// Known poses of the man (unmirrored): 0.10 straight, 0.14 turned to his left, 0.12 to his right.
const HIM = { straight: '0.10', left: '0.14', right: '0.12', other: ['0.3', '0.11', '0.17'] };
const OTHERS = ['4.3', '3.5', '2.4', '5.2'];
// A licence-style copy of him that is clear enough to read (others are deliberately too poor).
const LICENCE = '0.1';

module.exports = { face, HIM, OTHERS, LICENCE };
