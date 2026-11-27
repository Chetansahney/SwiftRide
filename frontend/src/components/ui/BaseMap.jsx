import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre draws on a background worker; point it at the bundled file so it
// loads the same way in development and in production builds.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { DEFAULT_CENTER, MAP_STYLES, MARKERS, VEHICLE_ICONS } from '../../lib/maps';

maplibregl.setWorkerUrl(workerUrl);

const MapContext = createContext(null);

const toLngLat = (point) => [point.lng, point.lat];

function MapLoading({ theme = 'day' }) {
    return (
        <div className={`absolute inset-0 flex items-center justify-center ${theme === 'night' ? 'bg-[#15171B]' : 'bg-[#EEF0F2]'}`}>
            <span className={`h-2 w-24 overflow-hidden rounded-full ${theme === 'night' ? 'bg-white/10' : 'bg-ink/10'}`}>
                <span className={`block h-full w-1/3 animate-ride-load rounded-full ${theme === 'night' ? 'bg-volt' : 'bg-ink'}`} />
            </span>
        </div>
    );
}

// Free map (MapLibre + OpenFreeMap tiles). Children are <MapMarker> and
// <MapRoute>. The view follows `center`, unless a route is being shown.
// `bottomInset` (pixels or a function) is how much of the map a bottom sheet
// covers, so following the centre keeps it in the visible part.
export default function BaseMap({ theme = 'day', center, zoom = 15, bottomInset = 0, children }) {
    const containerRef = useRef(null);
    const [map, setMap] = useState(null);
    const [failed, setFailed] = useState(false);
    // Set while a route is shown, so following the GPS doesn't undo "fit route".
    const followingRouteRef = useRef(false);
    const context = useMemo(() => (map ? { map, followingRouteRef } : null), [map]);

    useEffect(() => {
        let instance;
        try {
            instance = new maplibregl.Map({
                container: containerRef.current,
                style: MAP_STYLES[theme] || MAP_STYLES.day,
                center: toLngLat(center || DEFAULT_CENTER),
                zoom,
                attributionControl: { compact: true },
                dragRotate: false,
                pitchWithRotate: false,
            });
        } catch {
            // No WebGL on this device.
            setFailed(true);
            return undefined;
        }
        instance.touchZoomRotate.disableRotation();
        instance.on('load', () => setMap(instance));
        return () => {
            setMap(null);
            instance.remove();
        };
        // The map is created once; center/zoom changes are applied below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [theme]);

    const lat = center?.lat;
    const lng = center?.lng;
    useEffect(() => {
        if (!map || lat == null || lng == null || followingRouteRef.current) return;
        const inset = typeof bottomInset === 'function' ? bottomInset() : bottomInset;
        // A one-off offset (not "padding", which MapLibre keeps and would add to
        // later route framing) moves the centre into the part above the sheet.
        const shift = Math.max(0, Math.min(map.getContainer().clientHeight - 160, inset || 0)) / 2;
        try {
            map.easeTo({ center: [lng, lat], offset: [0, -shift], duration: 600 });
        } catch {
            map.setCenter([lng, lat]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, lat, lng]);

    return (
        <div className="relative h-full w-full">
            <div ref={containerRef} className="h-full w-full" style={{ position: 'absolute', inset: 0 }} />
            {failed ? (
                <div className="absolute inset-0 flex items-center justify-center bg-paper text-sm text-muted">Map unavailable</div>
            ) : !map ? (
                <MapLoading theme={theme} />
            ) : null}
            {context ? <MapContext.Provider value={context}>{children}</MapContext.Provider> : null}
        </div>
    );
}

// A pin or dot on the map. `icon` is one of MARKERS (pickup, drop, user, vehicle, captain).
export function MapMarker({ position, icon = 'pickup', title }) {
    const { map } = useContext(MapContext) || {};
    const markerRef = useRef(null);
    const lat = position?.lat;
    const lng = position?.lng;

    useEffect(() => {
        if (!map) return undefined;
        const art = MARKERS[icon] || MARKERS.pickup;
        const element = document.createElement('img');
        element.src = art.url;
        element.width = art.size[0];
        element.height = art.size[1];
        element.alt = title || '';
        element.draggable = false;
        markerRef.current = new maplibregl.Marker({ element, anchor: art.anchor });
        return () => {
            markerRef.current?.remove();
            markerRef.current = null;
        };
    }, [map, icon, title]);

    useEffect(() => {
        const marker = markerRef.current;
        if (!map || !marker) return;
        if (lat == null || lng == null) {
            marker.remove();
            return;
        }
        marker.setLngLat([lng, lat]).addTo(map);
    }, [map, lat, lng, icon, title]);

    return null;
}

let routeCount = 0;

// A thick route line ([lng, lat] pairs). The first time it appears, the map
// zooms to fit it; after that the rider/captain can pan freely.
// `bottomInset` (pixels, or a function returning pixels) keeps the route clear
// of a bottom sheet covering part of the map.
// `refit` re-frames the map every time the route changes (e.g. a driver
// approaching: the view zooms in as they get closer, like Uber).
export function MapRoute({ coordinates, theme = 'day', bottomInset = 80, refit = false }) {
    const { map, followingRouteRef } = useContext(MapContext) || {};
    const [id] = useState(() => `route-${(routeCount += 1)}`);
    const fittedRef = useRef(false);
    const night = theme === 'night';

    useEffect(() => {
        if (!map) return undefined;
        map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
            id: `${id}-casing`,
            type: 'line',
            source: id,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': night ? '#0E0F12' : '#FFFFFF', 'line-width': 10 },
        });
        map.addLayer({
            id: `${id}-line`,
            type: 'line',
            source: id,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': night ? '#D4FF3A' : '#0E0F12', 'line-width': 6 },
        });
        return () => {
            followingRouteRef.current = false;
            if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
            if (map.getLayer(`${id}-casing`)) map.removeLayer(`${id}-casing`);
            if (map.getSource(id)) map.removeSource(id);
        };
    }, [map, id, night, followingRouteRef]);

    useEffect(() => {
        const source = map?.getSource(id);
        if (!source) return;
        const line = Array.isArray(coordinates) && coordinates.length > 1 ? coordinates : null;
        source.setData(line ? { type: 'Feature', geometry: { type: 'LineString', coordinates: line } } : { type: 'FeatureCollection', features: [] });
        if (line && (refit || !fittedRef.current)) {
            fittedRef.current = true;
            followingRouteRef.current = true;
            const bounds = line.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(line[0], line[0]));
            // Clear of the header (~85 px) and whatever covers the bottom, always
            // leaving at least 110 px of map for the route.
            const height = map.getContainer().clientHeight;
            const top = Math.min(90, Math.round(height * 0.14));
            const wanted = typeof bottomInset === 'function' ? bottomInset() : bottomInset;
            const bottom = Math.max(40, Math.min(height - top - 110, wanted));
            // Framing the view must never break the app (e.g. a tiny or hidden map).
            try {
                map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
                map.fitBounds(bounds, { padding: { top, bottom, left: 40, right: 40 }, maxZoom: 16, duration: 700 });
            } catch (error) {
                console.warn('[map] could not frame route', { height, width: map.getContainer().clientWidth, top, bottom, error: error.message });
            }
        }
    }, [map, id, coordinates, followingRouteRef, bottomInset, refit]);

    return null;
}

const toRad = (deg) => (deg * Math.PI) / 180;
// Compass bearing from a to b, in degrees (0 = north).
function bearing(a, b) {
    const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
    const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function metresBetween(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
// Shortest way round from one heading to another (so 350° → 10° turns 20°, not 340°).
const turnTowards = (from, to, t) => from + ((((to - from) % 360) + 540) % 360 - 180) * t;

// A vehicle that glides between GPS updates and turns to face where it's going,
// like Uber. Big jumps (> 2 km, e.g. first fix) are applied instantly.
export function MapVehicle({ position, type = 'car', duration = 2500, title }) {
    const { map } = useContext(MapContext) || {};
    const markerRef = useRef(null);
    const shownRef = useRef(null); // { lat, lng, heading } currently drawn
    const frameRef = useRef(0);
    const lat = position?.lat;
    const lng = position?.lng;

    useEffect(() => {
        if (!map) return undefined;
        const art = VEHICLE_ICONS[type] || VEHICLE_ICONS.car;
        const element = document.createElement('img');
        element.src = art.url;
        element.width = art.size[0];
        element.height = art.size[1];
        element.alt = title || '';
        element.draggable = false;
        markerRef.current = new maplibregl.Marker({ element, anchor: 'center', rotationAlignment: 'map', pitchAlignment: 'map' });
        return () => {
            cancelAnimationFrame(frameRef.current);
            markerRef.current?.remove();
            markerRef.current = null;
            shownRef.current = null;
        };
    }, [map, type, title]);

    useEffect(() => {
        const marker = markerRef.current;
        if (!map || !marker || lat == null || lng == null) return undefined;
        const target = { lat, lng };
        const from = shownRef.current;
        cancelAnimationFrame(frameRef.current);

        if (!from || metresBetween(from, target) > 2000) {
            shownRef.current = { ...target, heading: from?.heading || 0 };
            marker.setLngLat([lng, lat]).setRotation(shownRef.current.heading).addTo(map);
            return undefined;
        }
        // Barely moved (GPS jitter): don't spin the vehicle around.
        const targetHeading = metresBetween(from, target) > 4 ? bearing(from, target) : from.heading;
        const started = performance.now();
        const step = (now) => {
            const t = Math.min(1, (now - started) / duration);
            const current = {
                lat: from.lat + (target.lat - from.lat) * t,
                lng: from.lng + (target.lng - from.lng) * t,
                heading: turnTowards(from.heading, targetHeading, Math.min(1, t * 3)),
            };
            shownRef.current = current;
            marker.setLngLat([current.lng, current.lat]).setRotation(current.heading);
            if (t < 1) frameRef.current = requestAnimationFrame(step);
        };
        frameRef.current = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frameRef.current);
    }, [map, lat, lng, duration]);

    return null;
}
