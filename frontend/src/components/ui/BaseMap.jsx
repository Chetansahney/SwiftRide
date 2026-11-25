import { GoogleMap } from '@react-google-maps/api';
import { DEFAULT_CENTER, mapOptions, useMapsLoader } from '../../lib/maps';

function MapLoading({ theme = 'day' }) {
    return (
        <div
            className={`flex h-full w-full items-center justify-center ${theme === 'night' ? 'bg-[#15171B] text-night-muted' : 'bg-[#EEF0F2] text-muted'}`}
        >
            <span className={`h-2 w-24 overflow-hidden rounded-full ${theme === 'night' ? 'bg-white/10' : 'bg-ink/10'}`}>
                <span className={`block h-full w-1/3 animate-ride-load rounded-full ${theme === 'night' ? 'bg-volt' : 'bg-ink'}`} />
            </span>
        </div>
    );
}

export default function BaseMap({ theme = 'day', center, zoom = 15, children }) {
    const { isLoaded, loadError } = useMapsLoader();
    if (loadError) {
        return <div className="flex h-full w-full items-center justify-center bg-paper text-sm text-muted">Map unavailable</div>;
    }
    if (!isLoaded) {
        return <MapLoading theme={theme} />;
    }
    return (
        <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={center || DEFAULT_CENTER}
            zoom={zoom}
            options={mapOptions(theme)}
        >
            {children}
        </GoogleMap>
    );
}
