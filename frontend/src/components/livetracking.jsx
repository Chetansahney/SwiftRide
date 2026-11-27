import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import socket from '../socket';
import BaseMap, { MapMarker, MapRoute, MapVehicle } from './ui/BaseMap';
import { etaLabel, lastKnownPosition, useGeolocation, useRoute } from '../lib/maps';
import { API } from '../lib/api';
import { useLanguage } from '../i18n/LanguageContext';

const NEARBY_REFRESH_MS = 5000;
const metres = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));
const vehicleKey = (type) => (type === 'bike' ? 'moto' : type || 'car');

// Vehicles around a point (approximate positions), refreshed every few seconds.
function useNearbyVehicles(center, enabled) {
    const [vehicles, setVehicles] = useState([]);
    const lat = center?.lat;
    const lng = center?.lng;
    useEffect(() => {
        if (!enabled || lat == null || lng == null) return undefined;
        let cancelled = false;
        const load = () =>
            axios
                .get(`${API}/rides/nearby-vehicles`, {
                    params: { lat: lat.toFixed(5), lng: lng.toFixed(5) },
                    headers: { Authorization: `Bearer ${localStorage.getItem('userToken')}` },
                })
                .then((response) => {
                    if (!cancelled) setVehicles(Array.isArray(response.data) ? response.data : []);
                })
                .catch(() => {});
        load();
        const timer = setInterval(load, NEARBY_REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [enabled, lat, lng]);
    return enabled ? vehicles : [];
}

// The rider's home map, Uber-style:
//  - before booking: vehicles moving around you (of the chosen type, once picked)
//  - with pickup and drop chosen: the route between them
//  - once a captain accepts: their vehicle driving in to the pickup, with an ETA
const LiveTracking = ({ pickup, destination, showRoute = false, vehicleType, ride }) => {
    const { t } = useLanguage();
    const gps = useGeolocation();
    // Until GPS answers, use the last position we knew.
    const [fallback] = useState(lastKnownPosition);
    const userLocation = gps || fallback;
    const [captainLocation, setCaptainLocation] = useState(null);
    // Where the approach line starts; moved only every ~250 m (fewer route requests).
    const [lineFrom, setLineFrom] = useState(null);
    const rideId = ride?._id;
    const captainAssigned = Boolean(ride?.captain && ['accepted'].includes(ride?.status));
    const arrived = captainAssigned && Boolean(ride?.arrivedAt);

    // Pickup ETA from the server: starts as the ETA on the captain's offer card,
    // then updates as they drive (the captain's app shows the same number).
    const [liveEta, setLiveEta] = useState(null);
    const eta = liveEta?.rideId === rideId ? liveEta : ride?.approach?.etaS != null ? ride.approach : null;
    useEffect(() => {
        const handle = (payload) => {
            if (payload?.rideId && payload.rideId === rideId) setLiveEta(payload);
        };
        socket.on('captain-eta', handle);
        return () => socket.off('captain-eta', handle);
    }, [rideId]);

    // Live position of the assigned captain.
    useEffect(() => {
        const handle = (payload) => {
            if (!payload?.location) return;
            if (rideId && payload.rideId && payload.rideId !== rideId) return;
            setCaptainLocation(payload.location);
            setLineFrom((previous) => (!previous || metres(previous, payload.location) > 250 ? payload.location : previous));
        };
        socket.on('captain-location', handle);
        return () => socket.off('captain-location', handle);
    }, [rideId]);

    const tripRoute = useRoute(showRoute && !captainAssigned ? pickup : null, showRoute && !captainAssigned ? destination : null, 'user');
    const pickupPoint = ride?.pickupPoint?.lat != null ? ride.pickupPoint : tripRoute?.from || null;
    // The approach line is redrawn every ~250 m of driving (the minutes come from
    // the server); none once the captain is at the pickup.
    const approach = useRoute(captainAssigned && !arrived ? lineFrom : null, captainAssigned && !arrived ? pickupPoint || pickup : null, 'user', 'fastest');

    const nearbyCenter = pickupPoint || tripRoute?.from || userLocation;
    const nearby = useNearbyVehicles(nearbyCenter, !captainAssigned && !rideId);
    const shownNearby = vehicleType ? nearby.filter((v) => v.type === vehicleKey(vehicleType)) : nearby;
    const center = captainLocation || userLocation || undefined;
    const captainName = ride?.captain?.name?.firstname || t('ride.driver');
    // Fit routes into the strip above whichever booking sheet is open.
    const sheetInset = useCallback(() => {
        const open = [...document.querySelectorAll('.sheet')].filter((el) => el.classList.contains('translate-y-0') && el.getAttribute('aria-hidden') !== 'true');
        return Math.max(80, ...open.map((el) => Math.min(el.offsetHeight, window.innerHeight * 0.6) + 16));
    }, []);
    // Routes also keep clear of the ETA chip that sits on top of the sheet.
    const routeInset = useCallback(() => sheetInset() + 56, [sheetInset]);

    return (
        <div className="relative h-full w-full">
            {/* While a captain is on the way, the approach route frames the view instead. */}
            <BaseMap center={captainAssigned ? undefined : center} zoom={15} bottomInset={sheetInset}>
                {userLocation && !showRoute ? <MapMarker position={userLocation} icon="user" title="You" /> : null}

                {/* Trip preview: pickup → drop. */}
                {tripRoute?.coordinates ? <MapRoute key="trip" coordinates={tripRoute.coordinates} theme="day" bottomInset={routeInset} refit /> : null}
                {tripRoute?.from && !captainAssigned ? <MapMarker position={tripRoute.from} icon="pickup" title="Pickup" /> : null}
                {tripRoute?.to && !captainAssigned ? <MapMarker position={tripRoute.to} icon="drop" title="Drop" /> : null}

                {/* Captain on the way: their route to the pickup. */}
                {captainAssigned && approach?.coordinates ? <MapRoute key="approach" coordinates={approach.coordinates} theme="day" bottomInset={routeInset} refit /> : null}
                {captainAssigned && pickupPoint ? <MapMarker position={pickupPoint} icon="pickup" title="Pickup" /> : null}
                {captainLocation ? (
                    <MapVehicle position={captainLocation} type={vehicleKey(ride?.vehicleType || vehicleType)} title={ride?.captain?.name?.firstname || 'Your driver'} />
                ) : null}

                {/* Vehicles around (approximate). */}
                {shownNearby.map((vehicle) => (
                    <MapVehicle key={vehicle.id} position={vehicle} type={vehicle.type} duration={NEARBY_REFRESH_MS - 500} title="" />
                ))}
            </BaseMap>

            {captainAssigned && (arrived || eta) ? (
                // Sits just above the sheet (like Uber), clear of the route and vehicle.
                <div
                    className={`pointer-events-none fixed left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-float ${arrived ? 'bg-volt text-ink' : 'bg-ink text-white'}`}
                    style={{ bottom: sheetInset() + 4 }}
                    role="status"
                >
                    {arrived
                        ? t('ride.arrivedChip', { name: captainName })
                        : eta.etaS < 60
                          ? t('ride.arrivingNow', { name: captainName })
                          : t('ride.arrivingIn', { time: etaLabel(t, eta.etaS, eta.estimated), name: captainName })}
                </div>
            ) : null}
        </div>
    );
};

export default LiveTracking;
