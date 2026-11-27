#!/usr/bin/env node
// Re-tunes the face-match thresholds from real photos.
//
//   npm run face:calibrate -- <folder>            report only
//   npm run face:calibrate -- <folder> --write    also update config/faceThresholds.json
//   npm run face:calibrate -- --demo              use the face library's demo photos
//
// <folder> has one sub-folder per person (with their consent), e.g.
//   calibration-data/driver-01/licence.jpg
//   calibration-data/driver-01/selfie-1.jpg  selfie-2.jpg ...
// Files with "licence" or "dl" in the name are licence photos; the rest are selfies.
// calibration-data/ is git-ignored: never commit people's faces.
//
// It measures how far apart the face fingerprints are for the SAME person
// (licence vs selfie, selfie vs selfie) and for DIFFERENT people, then picks:
//   matchDistance  — below the closest different-person pair, with a safety margin
//   reviewDistance — above (almost) every same-person pair, so real drivers
//                    land in review rather than being rejected
const fs = require('fs');
const path = require('path');
const { analyze } = require('../services/face/models');

const THRESHOLDS_FILE = path.join(__dirname, '..', 'config', 'faceThresholds.json');
const SAFETY_MARGIN = 0.03;
const euclid = (a, b) => Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
const pct = (part, total) => `${total ? ((part / total) * 100).toFixed(1) : '0.0'}%`;

function readFolder(folder) {
    const people = [];
    for (const person of fs.readdirSync(folder, { withFileTypes: true })) {
        if (!person.isDirectory()) continue;
        const dir = path.join(folder, person.name);
        const files = fs.readdirSync(dir).filter((file) => /\.(jpe?g|png)$/i.test(file));
        const load = (file) => `data:image/${/png$/i.test(file) ? 'png' : 'jpeg'};base64,${fs.readFileSync(path.join(dir, file)).toString('base64')}`;
        people.push({
            id: person.name,
            licences: files.filter((file) => /licen[cs]e|(^|[^a-z])dl([^a-z]|$)/i.test(file)).map(load),
            selfies: files.filter((file) => !/licen[cs]e|(^|[^a-z])dl([^a-z]|$)/i.test(file)).map(load),
        });
    }
    return people;
}

// The face library's demo sheet: row 1 is one man (18 photos), rows 3–6 are others.
function demoPeople() {
    const jpeg = require('jpeg-js');
    const sheet = path.join(path.dirname(require.resolve('@vladmandic/human')), '..', 'assets', 'screenshot-facematch.jpg');
    const src = jpeg.decode(fs.readFileSync(sheet), { useTArray: true, maxMemoryUsageInMB: 512 });
    const rows = [286, 399, 511, 624, 737, 849];
    const cell = (col, row, licence) => {
        const x0 = Math.round((col * 1920) / 18) + 3;
        const y0 = rows[row] + 14;
        const s = licence ? 1.2 : 1.6;
        const pad = 40;
        const ow = Math.round(100 * s) + pad * 2;
        const oh = Math.round(82 * s) + pad * 2;
        const out = Buffer.alloc(ow * oh * 4, 120);
        for (let j = 0; j < Math.round(82 * s); j += 1) {
            for (let i = 0; i < Math.round(100 * s); i += 1) {
                const p = ((y0 + Math.floor(j / s)) * src.width + x0 + Math.floor(i / s)) * 4;
                const q = ((j + pad) * ow + i + pad) * 4;
                for (let c = 0; c < 3; c += 1) {
                    out[q + c] = licence ? Math.max(0, Math.min(255, (src.data[p + c] - 128) * 0.8 + 128 + [12, 5, -10][c])) : src.data[p + c];
                }
                out[q + 3] = 255;
            }
        }
        return `data:image/jpeg;base64,${jpeg.encode({ data: out, width: ow, height: oh }, licence ? 35 : 90).data.toString('base64')}`;
    };
    // Only the man is labelled; the other cells may repeat the same person, so
    // they're compared against him only ("unlabelled"), never with each other.
    const people = [{ id: 'demo-man', licences: [], selfies: [] }];
    for (let col = 0; col < 18; col += 1) {
        people[0].licences.push(cell(col, 0, true));
        people[0].selfies.push(cell(col, 0, false));
    }
    for (let row = 2; row < 6; row += 1) {
        for (let col = 0; col < 18; col += 1) people.push({ id: `demo-${row}-${col}`, unlabelled: true, licences: [], selfies: [cell(col, row, false)] });
    }
    return people;
}

async function fingerprints(images) {
    const out = [];
    let unclear = 0;
    for (const image of images) {
        const face = (await analyze(image).catch(() => []))[0];
        if (face?.descriptor) out.push(face.descriptor);
        else unclear += 1;
    }
    return { list: out, unclear };
}

async function main() {
    const args = process.argv.slice(2);
    const write = args.includes('--write');
    const demo = args.includes('--demo');
    const folder = args.find((arg) => !arg.startsWith('--'));
    if (!demo && !folder) {
        console.error('Usage: npm run face:calibrate -- <folder> [--write]   or   -- --demo');
        process.exit(1);
    }
    const people = demo ? demoPeople() : readFolder(path.resolve(folder));
    console.log(`Analysing ${people.length} people...`);

    let unclearLicences = 0;
    let unclearSelfies = 0;
    let totalLicences = 0;
    let totalSelfies = 0;
    for (const person of people) {
        const licences = await fingerprints(person.licences);
        const selfies = await fingerprints(person.selfies);
        person.l = licences.list;
        person.s = selfies.list;
        unclearLicences += licences.unclear;
        unclearSelfies += selfies.unclear;
        totalLicences += person.licences.length;
        totalSelfies += person.selfies.length;
    }

    const genuine = { licence: [], selfie: [] };
    const impostor = { licence: [], selfie: [] };
    for (const a of people) {
        for (const b of people) {
            if (a.unlabelled && b.unlabelled) continue;
            const same = a === b;
            for (const l of a.l) for (const s of b.s) (same ? genuine : impostor).licence.push(euclid(l, s));
            for (let i = 0; i < a.s.length; i += 1) {
                for (let j = 0; j < b.s.length; j += 1) {
                    if (same && i >= j) continue;
                    if (!same && a.id > b.id) continue;
                    (same ? genuine : impostor).selfie.push(euclid(a.s[i], b.s[j]));
                }
            }
        }
    }

    console.log(`\nPhotos too unclear to use (the app asks for a retake): licences ${unclearLicences}/${totalLicences}, selfies ${unclearSelfies}/${totalSelfies}`);
    const allGenuine = [...genuine.licence, ...genuine.selfie].sort((x, y) => x - y);
    const allImpostor = [...impostor.licence, ...impostor.selfie].sort((x, y) => x - y);
    if (allGenuine.length < 5 || allImpostor.length < 5) {
        console.error('Not enough pairs: add more people (and at least one licence + two selfies each).');
        process.exit(1);
    }

    for (const kind of ['licence', 'selfie']) {
        const g = genuine[kind].sort((x, y) => x - y);
        const i = impostor[kind].sort((x, y) => x - y);
        if (!g.length || !i.length) continue;
        let auc = 0;
        for (const x of g) for (const y of i) auc += x < y ? 1 : x === y ? 0.5 : 0;
        console.log(`\n${kind === 'licence' ? 'Licence vs selfie' : 'Selfie vs selfie'}: ${g.length} same-person pairs, ${i.length} different-person pairs`);
        console.log(`  separation (AUC): ${(auc / (g.length * i.length)).toFixed(4)}`);
        console.log(`  same person  distance: median ${quantile(g, 0.5).toFixed(3)}, 95% ${quantile(g, 0.95).toFixed(3)}, max ${g[g.length - 1].toFixed(3)}`);
        console.log(`  other people distance: min ${i[0].toFixed(3)}, 1% ${quantile(i, 0.01).toFixed(3)}, median ${quantile(i, 0.5).toFixed(3)}`);
    }

    // Auto-approve only clearly below the closest different-person pair; review up to
    // where (almost) all real drivers fall.
    // With little data, don't go above the model's well-tested 0.50 however clean
    // the sample looks: a small sample can't show the rare close look-alike.
    const cap = allImpostor.length >= 20000 ? 0.55 : 0.5;
    const matchDistance = Math.min(cap, Math.max(0.35, allImpostor[0] - SAFETY_MARGIN));
    const reviewDistance = Math.min(0.68, Math.max(matchDistance + 0.05, quantile(allGenuine, 0.995) + 0.01));
    const autoApproved = allGenuine.filter((x) => x <= matchDistance).length;
    const reviewed = allGenuine.filter((x) => x > matchDistance && x <= reviewDistance).length;
    const wrongApproved = allImpostor.filter((x) => x <= matchDistance).length;
    const wrongReviewed = allImpostor.filter((x) => x > matchDistance && x <= reviewDistance).length;

    console.log(`\nRecommended: matchDistance ${matchDistance.toFixed(3)}, reviewDistance ${reviewDistance.toFixed(3)}`);
    console.log(`  real drivers:  auto-approved ${pct(autoApproved, allGenuine.length)}, review ${pct(reviewed, allGenuine.length)}, rejected ${pct(allGenuine.length - autoApproved - reviewed, allGenuine.length)}`);
    console.log(`  wrong person:  auto-approved ${wrongApproved}/${allImpostor.length}, sent to review ${wrongReviewed}/${allImpostor.length}`);
    if (allImpostor.length < 2000) console.log(`  Note: with only ${allImpostor.length} different-person pairs, a 1-in-1000 error rate can't be measured yet. More people = more confidence.`);

    if (write) {
        const current = JSON.parse(fs.readFileSync(THRESHOLDS_FILE, 'utf8'));
        const next = {
            ...current,
            matchDistance: Number(matchDistance.toFixed(3)),
            reviewDistance: Number(reviewDistance.toFixed(3)),
            calibration: {
                date: new Date().toISOString().slice(0, 10),
                data: demo ? 'Face library demo photos' : `${people.length} people from ${path.basename(path.resolve(folder))}`,
                genuinePairs: allGenuine.length,
                impostorPairs: allImpostor.length,
                genuineMaxDistance: Number(allGenuine[allGenuine.length - 1].toFixed(3)),
                impostorMinDistance: Number(allImpostor[0].toFixed(3)),
                note: 'Written by npm run face:calibrate. Restart the server to apply.',
            },
        };
        fs.writeFileSync(THRESHOLDS_FILE, `${JSON.stringify(next, null, 2)}\n`);
        console.log(`\nSaved to ${path.relative(process.cwd(), THRESHOLDS_FILE)}. Restart the server to apply.`);
    }
    process.exit(0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
