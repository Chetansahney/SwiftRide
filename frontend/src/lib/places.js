// Saved Home/Work and recent destinations, kept on the rider's phone so the
// home screen can offer one-tap trips without any typing.
const SAVED_KEY = 'swiftride.savedPlaces';
const RECENT_KEY = 'swiftride.recentPlaces';
const MAX_RECENT = 5;

function read(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}

export function getSavedPlaces() {
    return read(SAVED_KEY, {});
}

export function savePlace(kind, address) {
    const saved = getSavedPlaces();
    saved[kind] = address;
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    return saved;
}

export function getRecentPlaces() {
    return read(RECENT_KEY, []);
}

export function addRecentPlace(address) {
    if (!address) return getRecentPlaces();
    const recent = [address, ...getRecentPlaces().filter((place) => place !== address)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    return recent;
}

export function removePlace(kind) {
    const saved = getSavedPlaces();
    delete saved[kind];
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    return saved;
}

// Extra named places ("Gym", "Mom's house") alongside Home and Work.
export function addCustomPlace(label, address) {
    const saved = getSavedPlaces();
    const id = Date.now().toString(36);
    saved.custom = [...(saved.custom || []), { id, label: label.trim(), address }];
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    return saved;
}

export function removeCustomPlace(id) {
    const saved = getSavedPlaces();
    saved.custom = (saved.custom || []).filter((place) => place.id !== id);
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    return saved;
}

export function clearPlaces() {
    localStorage.removeItem(SAVED_KEY);
    localStorage.removeItem(RECENT_KEY);
}
