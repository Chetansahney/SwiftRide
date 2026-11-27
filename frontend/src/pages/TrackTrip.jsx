import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { ShieldAlert } from 'lucide-react';
import BaseMap, { MapMarker } from '../components/ui/BaseMap';
import VehicleArt from '../components/ui/VehicleArt';
import NumberPlate from '../components/ui/NumberPlate';
import RouteSummary from '../components/RouteSummary';
import { LanguageToggle, Logo } from '../components/ui/Brand';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES } from '../i18n/strings';
import { API } from '../lib/api';
import { vehicleMeta } from '../lib/config';

const REFRESH_MS = 10000;

// What a trusted contact sees when they open the shared link: live position,
// driver, plate and where the trip is going. Refreshes every 10 seconds.
export default function TrackTrip() {
    const { token } = useParams();
    const { t, lang } = useLanguage();
    const [trip, setTrip] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = () =>
            axios
                .get(`${API}/rides/shared/${token}`)
                .then((response) => {
                    if (!cancelled) {
                        setTrip(response.data);
                        setError(false);
                    }
                })
                .catch(() => {
                    if (!cancelled) setError(true);
                });
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [token]);

    const locale = LANGUAGES.find((language) => language.code === lang)?.speech || 'en-IN';
    const meta = vehicleMeta(trip?.captain?.vehicleType || 'car');

    return (
        <div className="flex h-full flex-col bg-paper">
            <div className="relative h-[45%] min-h-[240px] shrink-0">
                <BaseMap center={trip?.location || trip?.dropPoint || undefined} zoom={15}>
                    {trip?.location ? <MapMarker position={trip.location} icon="vehicle" title={trip.captain?.firstname} /> : null}
                    {trip?.dropPoint?.lat != null ? <MapMarker position={trip.dropPoint} icon="drop" title="Drop" /> : null}
                </BaseMap>
                <div className="absolute inset-x-5 top-6 z-20 flex items-center justify-between">
                    <span className="flex h-12 items-center rounded-full bg-white px-4 shadow-float">
                        <Logo />
                    </span>
                    <LanguageToggle />
                </div>
            </div>

            <div className="sheet relative z-10 -mt-7 mx-auto flex w-full max-w-xl flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-8 pt-4">
                {error && !trip ? (
                    <p className="py-10 text-center text-base text-muted">{t('track.notFound')}</p>
                ) : !trip ? (
                    <p className="py-10 text-center text-base text-muted">{t('loading')}</p>
                ) : (
                    <>
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted">{t('track.sharedBy', { name: trip.riderName || '—' })}</span>
                            <h1 className="font-display text-2xl font-semibold tracking-tight" aria-live="polite">
                                {t(`track.${trip.status}`)}
                            </h1>
                            <span className="text-xs text-muted">
                                {t('track.updated', { time: new Date(trip.updatedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) })}
                            </span>
                        </div>

                        {trip.endedAwayFromDrop ? (
                            <p role="alert" className="flex items-center gap-2 rounded-[14px] bg-signal/10 px-4 py-3 text-sm font-semibold text-signal">
                                <ShieldAlert size={18} aria-hidden="true" />
                                {t('track.endedAway')}
                            </p>
                        ) : null}

                        {trip.captain ? (
                            <div className="flex items-center gap-3 rounded-2xl bg-paper p-3">
                                <VehicleArt art={meta.art} width={80} />
                                <div className="flex min-w-0 flex-col items-start gap-1">
                                    <NumberPlate plate={trip.captain.plate} />
                                    <span className="truncate text-[13px] text-muted">
                                        {[trip.captain.firstname, trip.captain.color, trip.captain.model].filter(Boolean).join(' · ')}
                                    </span>
                                </div>
                            </div>
                        ) : null}

                        <RouteSummary pickup={trip.origin} destination={trip.destination} />

                        <a href="tel:112" className="flex h-14 items-center justify-center rounded-[14px] bg-signal text-base font-semibold text-white">
                            {t('safety.call112')}
                        </a>
                    </>
                )}
            </div>
        </div>
    );
}
