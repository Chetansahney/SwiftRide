import { useEffect, useState } from 'react';
import socket from '../socket';
import BaseMap, { MapMarker } from './ui/BaseMap';
import { useGeolocation } from '../lib/maps';

// Full-screen background map on the rider home screen: where you are, and
// where your captain is once a ride is confirmed.
const LiveTracking = () => {
    const [captainLocation, setCaptainLocation] = useState(null);
    const userLocation = useGeolocation();

    useEffect(() => {
        let rideId = null;
        try {
            rideId = JSON.parse(localStorage.getItem('activeRide') || 'null')?._id || null;
        } catch {
            rideId = null;
        }

        const handleCaptainLocation = (payload) => {
            if (!payload?.location) return;
            if (rideId && payload.rideId && payload.rideId !== rideId) return;
            setCaptainLocation(payload.location);
        };

        socket.on('captain-location', handleCaptainLocation);
        return () => socket.off('captain-location', handleCaptainLocation);
    }, []);

    const center = captainLocation || userLocation || undefined;

    return (
        <div className="relative h-full w-full">
            <BaseMap center={center} zoom={15}>
                {userLocation ? <MapMarker position={userLocation} icon="user" title="You" /> : null}
                {captainLocation ? <MapMarker position={captainLocation} icon="vehicle" title="Your driver" /> : null}
            </BaseMap>
        </div>
    );
};

export default LiveTracking;
