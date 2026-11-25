import { Marker } from '@react-google-maps/api';
import { useEffect, useState } from 'react';
import socket from '../socket';
import BaseMap from './ui/BaseMap';
import { markerIcons, useGeolocation, useMapsLoader } from '../lib/maps';

// Full-screen background map on the rider home screen: where you are, and
// where your captain is once a ride is confirmed.
const LiveTracking = () => {
    const [captainLocation, setCaptainLocation] = useState(null);
    const userLocation = useGeolocation();
    const { isLoaded } = useMapsLoader();

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

    const icons = isLoaded ? markerIcons() : {};
    const center = captainLocation || userLocation || undefined;

    return (
        <div className="relative h-full w-full">
            <BaseMap center={center} zoom={15}>
                {userLocation ? <Marker position={userLocation} icon={icons.user} title="You" /> : null}
                {captainLocation ? <Marker position={captainLocation} icon={icons.vehicle} title="Your driver" /> : null}
            </BaseMap>
        </div>
    );
};

export default LiveTracking;
