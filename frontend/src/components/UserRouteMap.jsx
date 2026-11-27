import BaseMap, { MapMarker, MapRoute } from './ui/BaseMap';
import { useGeolocation, useRoute } from '../lib/maps';

// Rider's map once the trip has started: route from where they are to the drop.
const UserRouteMap = ({ destination }) => {
    const userLocation = useGeolocation();
    const route = useRoute(userLocation, destination, 'user');

    return (
        <div className="relative h-full w-full">
            <BaseMap center={userLocation || undefined} zoom={14}>
                {route?.coordinates ? <MapRoute coordinates={route.coordinates} theme="day" /> : null}
                {userLocation ? <MapMarker position={userLocation} icon="user" title="You" /> : null}
                {route?.to ? <MapMarker position={route.to} icon="drop" title="Drop" /> : null}
            </BaseMap>
        </div>
    );
};

export default UserRouteMap;
