import { DirectionsRenderer, Marker } from '@react-google-maps/api';
import { useEffect, useState } from 'react';
import BaseMap from './ui/BaseMap';
import { markerIcons, routeLineOptions, useGeolocation, useMapsLoader } from '../lib/maps';

// Rider's map once the trip has started: route from where they are to the drop.
const UserRouteMap = ({ destination }) => {
    const [directions, setDirections] = useState(null);
    const userLocation = useGeolocation();
    const { isLoaded } = useMapsLoader();

    // Route once we have a first fix; don't re-request on every GPS update.
    const hasLocation = Boolean(userLocation);
    useEffect(() => {
        if (!isLoaded || !destination || !hasLocation || !window.google) return;
        const service = new window.google.maps.DirectionsService();
        service.route(
            { origin: userLocation, destination, travelMode: window.google.maps.TravelMode.DRIVING },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK) setDirections(result);
            }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, destination, hasLocation]);

    const icons = isLoaded ? markerIcons() : {};
    const leg = directions?.routes?.[0]?.legs?.[0];

    return (
        <div className="relative h-full w-full">
            <BaseMap center={userLocation || undefined} zoom={14}>
                {directions ? (
                    <DirectionsRenderer
                        directions={directions}
                        options={{ suppressMarkers: true, preserveViewport: false, polylineOptions: routeLineOptions('day') }}
                    />
                ) : null}
                {userLocation ? <Marker position={userLocation} icon={icons.user} title="You" /> : null}
                {leg?.end_location ? <Marker position={leg.end_location} icon={icons.drop} title="Drop" /> : null}
            </BaseMap>
        </div>
    );
};

export default UserRouteMap;
