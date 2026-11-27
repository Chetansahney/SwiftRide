import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre draws on a background worker; point it at the bundled file so it
// loads the same way in development and in production builds.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { DEFAULT_CENTER, MAP_STYLES, MARKERS } from '../../lib/maps';

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
export default function BaseMap({ theme = 'day', center, zoom = 15, children }) {
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
        map.easeTo({ center: [lng, lat], duration: 600 });
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
export function MapRoute({ coordinates, theme = 'day' }) {
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
        if (line && !fittedRef.current) {
            fittedRef.current = true;
            followingRouteRef.current = true;
            const bounds = line.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(line[0], line[0]));
            map.fitBounds(bounds, { padding: { top: 120, bottom: 80, left: 48, right: 48 }, maxZoom: 16, duration: 700 });
        }
    }, [map, id, coordinates, followingRouteRef]);

    return null;
}
