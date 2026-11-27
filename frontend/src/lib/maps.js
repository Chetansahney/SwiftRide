// Map helpers. Maps are drawn with MapLibre on free OpenFreeMap tiles
// (OpenStreetMap data, no API key, no billing). Search, addresses and routes
// come from our backend, which uses free OpenStreetMap services.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from './api';

export const DEFAULT_CENTER = { lat: 22.5726, lng: 88.3639 };

// Matte light map for riders, low-glare dark map for captains.
export const MAP_STYLES = {
    day: 'https://tiles.openfreemap.org/styles/positron',
    night: 'https://tiles.openfreemap.org/styles/dark',
};

const svgUrl = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

// Marker artwork and where the image touches the map (anchor).
export const MARKERS = {
    pickup: {
        url: svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path d="M18 43c-10-12-16-19-16-26a16 16 0 1 1 32 0c0 7-6 14-16 26z" fill="#0E0F12"/><circle cx="18" cy="17" r="6" fill="#D4FF3A"/></svg>'),
        size: [36, 44],
        anchor: 'bottom',
    },
    drop: {
        url: svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path d="M18 43c-10-12-16-19-16-26a16 16 0 1 1 32 0c0 7-6 14-16 26z" fill="#0E0F12"/><rect x="12" y="11" width="12" height="12" rx="2" fill="#FFFFFF"/></svg>'),
        size: [36, 44],
        anchor: 'bottom',
    },
    user: {
        url: svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#0E0F12" fill-opacity="0.10"/><circle cx="22" cy="22" r="9" fill="#0E0F12" stroke="#D4FF3A" stroke-width="4"/></svg>'),
        size: [44, 44],
        anchor: 'center',
    },
    vehicle: {
        url: svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#D4FF3A" fill-opacity="0.45"/><rect x="16" y="15" width="16" height="18" rx="5" fill="#E3B341" stroke="#0E0F12" stroke-width="2.5"/><rect x="19" y="27" width="10" height="3" rx="1" fill="#0E0F12"/></svg>'),
        size: [48, 48],
        anchor: 'center',
    },
    captain: {
        url: svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#D4FF3A" fill-opacity="0.18"/><path d="M24 11 L33 35 L24 29 L15 35 Z" fill="#D4FF3A" stroke="#0E0F12" stroke-width="2" stroke-linejoin="round"/></svg>'),
        size: [48, 48],
        anchor: 'center',
    },
};

// The last GPS fix anywhere in the app, so searches can be biased to it.
let lastKnown = (() => {
    try {
        return JSON.parse(sessionStorage.getItem('swiftride.lastPosition') || 'null');
    } catch {
        return null;
    }
})();
function remember(position) {
    lastKnown = position;
    try {
        sessionStorage.setItem('swiftride.lastPosition', JSON.stringify(position));
    } catch {
        // storage full or blocked: keep it in memory only
    }
}

// Pickup ETAs come from the server (one number for rider and captain).
// Rounded like the server: nearest minute, never below 1; "~" when estimated.
export const etaMinutes = (seconds) => Math.max(1, Math.round(seconds / 60));
export function etaLabel(t, seconds, estimated = false) {
    const n = etaMinutes(seconds);
    return `${estimated ? '~' : ''}${t(n === 1 ? 'time.minute' : 'time.minutes', { n })}`;
}

// Top-down vehicles, nose pointing up (north); rotated to the direction of travel.
export const VEHICLE_ICONS = {
    auto: {
        url: svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><ellipse cx="20" cy="21" rx="11" ry="15" fill="#0E0F12" fill-opacity="0.18"/><path d="M20 4c4 0 7 3 8 7l2 15c0 5-4 9-10 9s-10-4-10-9l2-15c1-4 4-7 8-7z" fill="#E3B341" stroke="#0E0F12" stroke-width="2"/><path d="M13 17h14v12c0 2-3 3-7 3s-7-1-7-3z" fill="#0E0F12"/><rect x="16" y="8" width="8" height="5" rx="2" fill="#D4FF3A"/></svg>'),
        size: [40, 40],
    },
    moto: {
        url: svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><ellipse cx="18" cy="19" rx="6" ry="14" fill="#0E0F12" fill-opacity="0.18"/><rect x="15" y="3" width="6" height="8" rx="3" fill="#0E0F12"/><rect x="13" y="10" width="10" height="15" rx="5" fill="#D4FF3A" stroke="#0E0F12" stroke-width="2"/><rect x="15" y="24" width="6" height="9" rx="3" fill="#0E0F12"/><rect x="9" y="11" width="18" height="2.5" rx="1.2" fill="#0E0F12"/></svg>'),
        size: [36, 36],
    },
    car: {
        url: svgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="44" viewBox="0 0 40 44"><ellipse cx="20" cy="23" rx="12" ry="19" fill="#0E0F12" fill-opacity="0.18"/><rect x="9" y="3" width="22" height="38" rx="8" fill="#F4F5F7" stroke="#0E0F12" stroke-width="2"/><path d="M12 13h16l-2 6H14z" fill="#0E0F12"/><path d="M13 31h14l2 5H11z" fill="#0E0F12"/><rect x="15" y="21" width="10" height="7" rx="2" fill="#D4FF3A"/></svg>'),
        size: [40, 44],
    },
};

// Last known position (this session), for when GPS hasn't answered yet.
export const lastKnownPosition = () => lastKnown;

export function useGeolocation() {
    const [position, setPosition] = useState(null);
    useEffect(() => {
        if (!navigator.geolocation) return undefined;
        const watchId = navigator.geolocation.watchPosition(
            (result) => {
                const next = { lat: result.coords.latitude, lng: result.coords.longitude };
                remember(next);
                setPosition(next);
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);
    return position;
}

// Live position plus whether location access is blocked, and a retry that asks
// the browser again (shows the permission prompt if it isn't permanently denied).
export function useLocation() {
    const [position, setPosition] = useState(null);
    const [denied, setDenied] = useState(() => !navigator.geolocation);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (!navigator.geolocation) return undefined;
        const watchId = navigator.geolocation.watchPosition(
            (result) => {
                const next = { lat: result.coords.latitude, lng: result.coords.longitude };
                remember(next);
                setPosition(next);
                setDenied(false);
            },
            () => setDenied(true),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [attempt]);
    return { position, denied, retry: () => setAttempt((count) => count + 1) };
}

const tokenFor = (role) => localStorage.getItem(role === 'captain' ? 'captainToken' : 'userToken');
const authFor = (role) => ({ Authorization: `Bearer ${tokenFor(role)}` });

// Rider's position as query params, so searches and fares resolve nearby places.
export const nearParams = (position = lastKnown) => (position ? { nearLat: position.lat.toFixed(5), nearLng: position.lng.toFixed(5) } : {});

// GPS position → street address. Resolves to null if the lookup fails.
export function reverseGeocode(position, role = 'user') {
    if (!position) return Promise.resolve(null);
    return axios
        .get(`${API}/maps/reverse`, { params: { lat: position.lat, lng: position.lng }, headers: authFor(role) })
        .then((response) => response.data?.address || null)
        .catch(() => null);
}

const pointText = (place) => (typeof place === 'string' ? place : `${place.lat},${place.lng}`);

// Road route between two places (addresses or {lat,lng}), for drawing on the map.
// Re-fetches only when the endpoints change by more than ~100 m. prefer
// "fastest" for a captain heading to a pickup: the same time the captain's
// offer card showed and the rider is told.
export function useRoute(origin, destination, role = 'user', prefer) {
    const [route, setRoute] = useState(null);
    const roundKey = (place) => (!place ? '' : typeof place === 'string' ? place : `${place.lat.toFixed(3)},${place.lng.toFixed(3)}`);
    const key = `${roundKey(origin)}>${roundKey(destination)}:${prefer || ''}`;
    useEffect(() => {
        if (!origin || !destination) return undefined;
        let cancelled = false;
        axios
            .get(`${API}/maps/route`, {
                params: { origin: pointText(origin), destination: pointText(destination), ...(prefer ? { prefer } : {}) },
                headers: authFor(role),
            })
            .then((response) => {
                if (!cancelled) setRoute(response.data);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, role]);
    return origin && destination ? route : null;
}
