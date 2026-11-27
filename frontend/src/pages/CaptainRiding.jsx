import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Navigation, TriangleAlert } from 'lucide-react';
import FinishRide from '../components/FinishRIde';
import CaptainRouteMap from '../components/CaptainRouteMap';
import SosSheet from '../components/safety/SosSheet';
import { CaptainDataContext } from '../context/CaptainContext';
import socket from '../socket';
import { useLanguage } from '../i18n/LanguageContext';
import { formatFare, shortPlace } from '../lib/config';
import useKeepAwake from '../lib/useKeepAwake';

const CaptainRiding = () => {
    const { t } = useLanguage();
    const [finishRidePanel, setFinishRidePanel] = useState(false);
    const [sosOpen, setSosOpen] = useState(false);
    const { captain } = useContext(CaptainDataContext);
    const [ride] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('activeRide') || 'null');
        } catch (error) {
            console.error('Failed to parse activeRide:', error);
            return null;
        }
    });

    // The rider and their trusted contacts follow this phone's location.
    useKeepAwake(Boolean(ride?._id));

    // Identify this socket with the login token (again after any reconnect).
    useEffect(() => {
        const join = () => socket.emit('join', { token: localStorage.getItem('captainToken'), userType: 'captain' });
        join();
        socket.on('connect', join);
        return () => socket.off('connect', join);
    }, []);

    // Keep sending live location during the trip: it feeds the rider's map and
    // the live link shared with their trusted contacts.
    useEffect(() => {
        if (!captain?._id || !ride?._id || !navigator.geolocation) return undefined;
        const send = () =>
            navigator.geolocation.getCurrentPosition(
                (position) =>
                    socket.emit('update-location-captain', {
                        rideId: ride._id,
                        location: { lat: position.coords.latitude, lng: position.coords.longitude },
                    }),
                () => {},
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
            );
        send();
        const timer = setInterval(send, 5000);
        return () => clearInterval(timer);
    }, [captain?._id, ride?._id]);

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-night text-white">
            <div className="relative flex-1">
                <CaptainRouteMap ride={ride} mode="to-destination" />
                <button
                    type="button"
                    onClick={() => setSosOpen(true)}
                    className="absolute left-5 top-6 z-20 flex h-12 items-center gap-2 rounded-full bg-signal px-4 text-sm font-semibold text-white shadow-float"
                >
                    <TriangleAlert size={18} aria-hidden="true" />
                    {t('captain.sos')}
                </button>
                <Link
                    to="/captainhome"
                    aria-label="Captain home"
                    className="absolute right-5 top-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-night-card text-white shadow-float"
                >
                    <Navigation size={20} aria-hidden="true" />
                </Link>
            </div>

            <div className="relative z-10 -mt-7 mx-auto flex w-full max-w-xl items-center justify-between gap-4 rounded-t-sheet border-t border-night-line bg-night px-5 pb-8 pt-6">
                <div className="min-w-0">
                    <p className="text-xs text-night-muted">{t('captain.toDrop')}</p>
                    <p className="truncate text-lg font-semibold">{shortPlace(ride?.destination) || '—'}</p>
                    <p className="font-display text-sm text-volt">{formatFare(ride?.fare)}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setFinishRidePanel(true)}
                    className="h-14 shrink-0 rounded-2xl bg-volt px-6 text-base font-semibold text-ink active:scale-[0.98]"
                >
                    {t('captain.finish')}
                </button>
            </div>

            <div
                className={`fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl rounded-t-sheet border-t border-night-line bg-night px-5 pb-8 pt-3 transition-transform duration-500 ease-in-out ${finishRidePanel ? 'translate-y-0' : 'pointer-events-none translate-y-full border-transparent'}`}
                aria-hidden={!finishRidePanel}
            >
                <FinishRide ride={ride} onClose={() => setFinishRidePanel(false)} />
            </div>

            <SosSheet open={sosOpen} onClose={() => setSosOpen(false)} ride={ride} role="captain" dark />
        </div>
    );
};

export default CaptainRiding;
