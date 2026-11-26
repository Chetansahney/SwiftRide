import axios from 'axios';

export const API = import.meta.env.VITE_BASE_URL;

const withToken = (key) => () => ({ headers: { Authorization: `Bearer ${localStorage.getItem(key)}` } });

export const riderAuth = withToken('userToken');
export const captainAuth = withToken('captainToken');

// Best-effort current position for safety alerts; resolves to null rather than failing.
export function currentPosition(timeout = 5000) {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (result) => resolve({ lat: result.coords.latitude, lng: result.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout, maximumAge: 15000 }
        );
    });
}

export const riderPost = (path, body) => axios.post(`${API}${path}`, body, riderAuth());
export const captainPost = (path, body) => axios.post(`${API}${path}`, body, captainAuth());

// Live trip link a trusted contact can open without logging in.
export const tripLink = (token) => `${window.location.origin}/track/${token}`;
