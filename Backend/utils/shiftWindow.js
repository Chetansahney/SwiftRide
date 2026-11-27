// Captains verify their face three times a day. Each window is identified by
// the India date it started on plus its slot:
//   slot 0: 06:00 – 14:00
//   slot 1: 14:00 – 22:00
//   slot 2: 22:00 – 06:00 (next day; 00:00–06:00 belongs to the previous date)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SLOTS = [
    { start: 6, end: 14, label: '6 AM – 2 PM' },
    { start: 14, end: 22, label: '2 PM – 10 PM' },
    { start: 22, end: 30, label: '10 PM – 6 AM' },
];

function currentShiftWindow(date = new Date()) {
    // Shift the clock to India time, then read it with UTC getters.
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    let hour = ist.getUTCHours();
    if (hour < 6) {
        // Early morning is the tail of the previous day's night window.
        ist.setUTCDate(ist.getUTCDate() - 1);
        hour += 24;
    }
    const slot = SLOTS.findIndex((s) => hour >= s.start && hour < s.end);
    const day = ist.toISOString().slice(0, 10);

    const startIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), SLOTS[slot].start);
    const startsAt = new Date(startIst - IST_OFFSET_MS);
    const endsAt = new Date(startsAt.getTime() + 8 * 60 * 60 * 1000);

    return { id: `${day}#${slot}`, slot, label: SLOTS[slot].label, startsAt, endsAt };
}

module.exports = { currentShiftWindow, SLOTS };
