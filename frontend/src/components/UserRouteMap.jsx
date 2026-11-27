import { useEffect, useState } from 'react';
import socket from '../socket';
import BaseMap, { MapMarker, MapRoute, MapVehicle } from './ui/BaseMap';
import { useGeolocation, useRoute } from '../lib/maps';

// Rider's map during the trip: the vehicle driving along the route to the drop.
// Uses the captain's live position (sent every few seconds), or the rider's own
// GPS until the first update arrives.
const UserRouteMap = ({ destination, dropPoint, rideId, vehicleType = 'car' }) => {
    const userLocation = useGeolocation();
    const [captainLocation, setCaptainLocation] = useState(null);

    useEffect(() => {
        const handle = (payload) => {
            if (!payload?.location) return;
            if (rideId && payload.rideId && payload.rideId !== rideId) return;
            setCaptainLocation(payload.location);
        };
        socket.on('captain-location', handle);
        return () => socket.off('captain-location', handle);
    }, [rideId]);

    const here = captainLocation || userLocation;
    const target = dropPoint?.lat != null ? dropPoint : destination;
    const route = useRoute(here, target, 'user');
    const type = vehicleType === 'bike' ? 'moto' : vehicleType;

    return (
        <div className="relative h-full w-full">
            <BaseMap center={here || undefined} zoom={14}>
                {route?.coordinates ? <MapRoute coordinates={route.coordinates} theme="day" bottomInset={40} refit /> : null}
                {captainLocation ? <MapVehicle position={captainLocation} type={type} title="Your ride" /> : userLocation ? <MapMarker position={userLocation} icon="user" title="You" /> : null}
                {route?.to ? <MapMarker position={route.to} icon="drop" title="Drop" /> : null}
            </BaseMap>
        </div>
    );
};

export default UserRouteMap;
