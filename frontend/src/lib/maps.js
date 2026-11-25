import { useJsApiLoader } from '@react-google-maps/api';
import { useEffect, useState } from 'react';

export const DEFAULT_CENTER = { lat: 22.5726, lng: 88.3639 };

// Loaded once and shared by every map, instead of each map mounting its own
// <LoadScript> (which re-injects the Google script and can fail on navigation).
export function useMapsLoader() {
    return useJsApiLoader({
        id: 'swiftride-google-maps',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API,
    });
}

// Day map for riders: matte, sunlight-readable, main roads in soft yellow,
// shops hidden so Metro stations, hospitals and parks stand out as landmarks.
const DAY_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#EEF0F2' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#4A4F58' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }, { weight: 3 }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#E4E6EA' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D5E8CC' }] },
    { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4E7A43' }] },
    { featureType: 'poi.medical', elementType: 'labels.text.fill', stylers: [{ color: '#B3242B' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D3D7DD' }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FBF1CF' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F7E9B9' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#E0CB8C' }] },
    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#C9CED6' }] },
    { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#2F5E9E' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#C9DCEE' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4F7298' }] },
];

// Night map for captains: low glare, same landmark emphasis.
const NIGHT_STYLE = [
    { elementType: 'geometry', stylers: [{ color: '#15171B' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#A3A8B3' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#15171B' }, { weight: 3 }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1C1F25' }] },
    { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#18261C' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2C3038' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0B0C0E' }] },
    { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#33363D' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3A3527' }] },
    { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#2A2D33' }] },
    { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#8DB0E0' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#132131' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4F6A85' }] },
];

export function mapOptions(theme = 'day') {
    return {
        styles: theme === 'night' ? NIGHT_STYLE : DAY_STYLE,
        disableDefaultUI: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
        backgroundColor: theme === 'night' ? '#15171B' : '#EEF0F2',
    };
}

const svgUrl = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const PICKUP_PIN = svgUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path d="M18 43c-10-12-16-19-16-26a16 16 0 1 1 32 0c0 7-6 14-16 26z" fill="#0E0F12"/><circle cx="18" cy="17" r="6" fill="#D4FF3A"/></svg>'
);
const DROP_PIN = svgUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44"><path d="M18 43c-10-12-16-19-16-26a16 16 0 1 1 32 0c0 7-6 14-16 26z" fill="#0E0F12"/><rect x="12" y="11" width="12" height="12" rx="2" fill="#FFFFFF"/></svg>'
);
const USER_DOT = svgUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20" fill="#0E0F12" fill-opacity="0.10"/><circle cx="22" cy="22" r="9" fill="#0E0F12" stroke="#D4FF3A" stroke-width="4"/></svg>'
);
const VEHICLE_DOT = svgUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#D4FF3A" fill-opacity="0.45"/><rect x="16" y="15" width="16" height="18" rx="5" fill="#E3B341" stroke="#0E0F12" stroke-width="2.5"/><rect x="19" y="27" width="10" height="3" rx="1" fill="#0E0F12"/></svg>'
);
const CAPTAIN_ARROW = svgUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#D4FF3A" fill-opacity="0.18"/><path d="M24 11 L33 35 L24 29 L15 35 Z" fill="#D4FF3A" stroke="#0E0F12" stroke-width="2" stroke-linejoin="round"/></svg>'
);

// Marker icons need google.maps.Size/Point, so build them after the script loads.
export function markerIcons() {
    const maps = window.google?.maps;
    if (!maps) return {};
    const pin = (url) => ({ url, scaledSize: new maps.Size(36, 44), anchor: new maps.Point(18, 43) });
    const round = (url, size) => ({
        url,
        scaledSize: new maps.Size(size, size),
        anchor: new maps.Point(size / 2, size / 2),
    });
    return {
        pickup: pin(PICKUP_PIN),
        drop: pin(DROP_PIN),
        user: round(USER_DOT, 44),
        vehicle: round(VEHICLE_DOT, 48),
        captain: round(CAPTAIN_ARROW, 48),
    };
}

// Thick route line with small arrows showing the direction of travel.
export function routeLineOptions(theme = 'day') {
    const maps = window.google?.maps;
    const night = theme === 'night';
    return {
        strokeColor: night ? '#D4FF3A' : '#0E0F12',
        strokeOpacity: 1,
        strokeWeight: 6,
        icons: maps
            ? [
                {
                    icon: {
                        path: maps.SymbolPath.FORWARD_OPEN_ARROW,
                        scale: 2,
                        strokeColor: night ? '#0E0F12' : '#D4FF3A',
                        strokeWeight: 2,
                    },
                    offset: '40px',
                    repeat: '90px',
                },
            ]
            : undefined,
    };
}

export function useGeolocation() {
    const [position, setPosition] = useState(null);
    useEffect(() => {
        if (!navigator.geolocation) return undefined;
        const watchId = navigator.geolocation.watchPosition(
            (result) => setPosition({ lat: result.coords.latitude, lng: result.coords.longitude }),
            () => {},
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, []);
    return position;
}

// Turns the rider's GPS position into a street address using the Maps JS
// Geocoder. Resolves to null if Maps isn't loaded or the lookup fails.
export function reverseGeocode(position) {
    const maps = window.google?.maps;
    if (!maps?.Geocoder || !position) return Promise.resolve(null);
    return new maps.Geocoder()
        .geocode({ location: position })
        .then((response) => response?.results?.[0]?.formatted_address || null)
        .catch(() => null);
}
