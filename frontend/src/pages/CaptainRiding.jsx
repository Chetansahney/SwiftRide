import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Navigation } from 'lucide-react';
import FinishRide from '../components/FinishRIde';
import CaptainRouteMap from '../components/CaptainRouteMap';
import { useLanguage } from '../i18n/LanguageContext';
import { formatFare, shortPlace } from '../lib/config';

const CaptainRiding = () => {
    const { t } = useLanguage();
    const [finishRidePanel, setFinishRidePanel] = useState(false);
    const [ride] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('activeRide') || 'null');
        } catch (error) {
            console.error('Failed to parse activeRide:', error);
            return null;
        }
    });

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-night text-white">
            <div className="relative flex-1">
                <CaptainRouteMap ride={ride} mode="to-destination" />
                <Link
                    to="/captainhome"
                    aria-label="Captain home"
                    className="absolute right-5 top-6 flex h-12 w-12 items-center justify-center rounded-full bg-night-card text-white shadow-float"
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
        </div>
    );
};

export default CaptainRiding;
