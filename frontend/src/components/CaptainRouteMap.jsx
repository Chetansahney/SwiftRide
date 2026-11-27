import BaseMap, { MapMarker, MapRoute } from './ui/BaseMap';
import { useGeolocation, useRoute } from '../lib/maps';
import { useLanguage } from '../i18n/LanguageContext';
import { shortPlace } from '../lib/config';

// Captain's night map: route from the captain's position to the pickup
// (mode "to-pickup") or to the drop (mode "to-destination").
const CaptainRouteMap = ({ ride, mode, showBanner = true }) => {
    const { t } = useLanguage();
    const captainLocation = useGeolocation();
    const toDrop = mode === 'to-destination';
    // Exact points when the ride has them, else the address text.
    const target = toDrop ? ride?.dropPoint?.lat != null ? ride.dropPoint : ride?.destination : ride?.pickupPoint?.lat != null ? ride.pickupPoint : ride?.origin;
    const routeTarget = toDrop ? ride?.destination : ride?.origin;
    const route = useRoute(captainLocation, target, 'captain');

    return (
        <div className="relative h-full w-full">
            <BaseMap theme="night" center={captainLocation || undefined} zoom={14}>
                {route?.coordinates ? <MapRoute coordinates={route.coordinates} theme="night" /> : null}
                {captainLocation ? <MapMarker position={captainLocation} icon="captain" title="You" /> : null}
                {route?.to ? <MapMarker position={route.to} icon={toDrop ? 'drop' : 'pickup'} title={toDrop ? 'Drop' : 'Pickup'} /> : null}
            </BaseMap>

            {showBanner && routeTarget ? (
                <div className="absolute left-4 right-4 top-24 z-20 flex items-center gap-3 rounded-2xl bg-night-card/95 p-4 text-white shadow-float">
                    <span className={`h-3 w-3 shrink-0 ${toDrop ? 'rounded-[3px] bg-white' : 'rounded-full bg-volt'}`} aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="text-xs text-night-muted">{toDrop ? t('captain.toDrop') : t('captain.toPickup')}</p>
                        <p className="truncate text-base font-semibold">{shortPlace(routeTarget)}</p>
                    </div>
                    {route?.duration ? <span className="ml-auto shrink-0 font-display text-lg font-semibold">{route.duration}</span> : null}
                </div>
            ) : null}
        </div>
    );
};

export default CaptainRouteMap;
