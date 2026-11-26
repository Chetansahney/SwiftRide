import { DirectionsRenderer, Marker } from '@react-google-maps/api';
import { useEffect, useState } from 'react';
import BaseMap from './ui/BaseMap';
import { markerIcons, routeLineOptions, useGeolocation, useMapsLoader } from '../lib/maps';
import { useLanguage } from '../i18n/LanguageContext';
import { shortPlace } from '../lib/config';

// Captain's night map: route from the captain's position to the pickup
// (mode "to-pickup") or to the drop (mode "to-destination").
const CaptainRouteMap = ({ ride, mode, showBanner = true }) => {
    const { t } = useLanguage();
    const [directions, setDirections] = useState(null);
    const captainLocation = useGeolocation();
    const { isLoaded } = useMapsLoader();

    const toDrop = mode === 'to-destination';
    const routeTarget = toDrop ? ride?.destination : ride?.origin;
    const hasLocation = Boolean(captainLocation);

    useEffect(() => {
        if (!isLoaded || !routeTarget || !hasLocation || !window.google) {
            setDirections(null);
            return;
        }
        const service = new window.google.maps.DirectionsService();
        service.route(
            { origin: captainLocation, destination: routeTarget, travelMode: window.google.maps.TravelMode.DRIVING },
            (result, status) => {
                if (status === window.google.maps.DirectionsStatus.OK) setDirections(result);
            }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, routeTarget, hasLocation]);

    const icons = isLoaded ? markerIcons() : {};
    const leg = directions?.routes?.[0]?.legs?.[0];

    return (
        <div className="relative h-full w-full">
            <BaseMap theme="night" center={captainLocation || undefined} zoom={14}>
                {directions ? (
                    <DirectionsRenderer
                        directions={directions}
                        options={{ suppressMarkers: true, polylineOptions: routeLineOptions('night') }}
                    />
                ) : null}
                {captainLocation ? <Marker position={captainLocation} icon={icons.captain} title="You" /> : null}
                {leg?.end_location ? (
                    <Marker position={leg.end_location} icon={toDrop ? icons.drop : icons.pickup} title={toDrop ? 'Drop' : 'Pickup'} />
                ) : null}
            </BaseMap>

            {showBanner && routeTarget ? (
                <div className="absolute left-4 right-4 top-24 z-20 flex items-center gap-3 rounded-2xl bg-night-card/95 p-4 text-white shadow-float">
                    <span className={`h-3 w-3 shrink-0 ${toDrop ? 'rounded-[3px] bg-white' : 'rounded-full bg-volt'}`} aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="text-xs text-night-muted">{toDrop ? t('captain.toDrop') : t('captain.toPickup')}</p>
                        <p className="truncate text-base font-semibold">{shortPlace(routeTarget)}</p>
                    </div>
                    {leg?.duration?.text ? (
                        <span className="ml-auto shrink-0 font-display text-lg font-semibold">{leg.duration.text}</span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export default CaptainRouteMap;
