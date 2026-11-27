// Saved Home/Work and recent destinations. Kept on the phone for instant,
// offline use; saved places are also synced to the rider's account so they
// follow them to a new phone. Recent trips stay on this phone only.
import axios from 'axios';
const SAVED_KEY = 'swiftride.savedPlaces';
const RECENT_KEY = 'swiftride.recentPlaces';
const MAX_RECENT = 5;

// Fire-and-forget: the phone copy is the source of truth for the screen.
function pushToAccount(saved) {
    const token = localStorage.getItem('userToken');
    if (!token) return;
    const body = { home: saved.home || '', work: saved.work || '', custom: saved.custom || [] };
    axios.put(`${import.meta.env.VITE_BASE_URL}/users/places`, body, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

function write(saved) {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    pushToAccount(saved);
    return saved;
}

// After the profile loads: use the account's places, or upload this phone's
// places the first time (for riders who saved them before sync existed).
export function syncPlacesFromProfile(profile) {
    const remote = profile?.savedPlaces;
    const hasRemote = Boolean(remote && (remote.home || remote.work || remote.custom?.length));
    if (hasRemote) {
        const saved = { ...(remote.home ? { home: remote.home } : {}), ...(remote.work ? { work: remote.work } : {}), custom: remote.custom || [] };
        localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
        return saved;
    }
    const local = getSavedPlaces();
    if (local.home || local.work || local.custom?.length) pushToAccount(local);
    return local;
}

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
    return write(saved);
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
    return write(saved);
}

// Extra named places ("Gym", "Mom's house") alongside Home and Work.
export function addCustomPlace(label, address) {
    const saved = getSavedPlaces();
    const id = Date.now().toString(36);
    saved.custom = [...(saved.custom || []), { id, label: label.trim(), address }];
    return write(saved);
}

export function removeCustomPlace(id) {
    const saved = getSavedPlaces();
    saved.custom = (saved.custom || []).filter((place) => place.id !== id);
    return write(saved);
}

export function clearPlaces() {
    localStorage.removeItem(SAVED_KEY);
    localStorage.removeItem(RECENT_KEY);
}
