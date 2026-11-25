import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import RouteSummary from './RouteSummary';
import { useLanguage } from '../i18n/LanguageContext';
import { formatFare } from '../lib/config';

const FinishRide = ({ ride, onClose }) => {
    const { t } = useLanguage();
    const [swipeValue, setSwipeValue] = useState(0);
    const [isEnding, setIsEnding] = useState(false);
    const navigate = useNavigate();
    const riderName = [ride?.user?.name?.firstname, ride?.user?.name?.lastname].filter(Boolean).join(' ') || t('captain.rider');

    const handleSwipe = (e) => {
        const value = parseInt(e.target.value, 10);
        setSwipeValue(value);
        if (value < 98 || isEnding) return;

        setIsEnding(true);
        const token = localStorage.getItem('captainToken');
        if (!token || !ride?._id) {
            setSwipeValue(0);
            setIsEnding(false);
            return;
        }
        axios
            .post(
                `${import.meta.env.VITE_BASE_URL}/rides/end-ride`,
                { rideId: ride._id },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            .then(() => {
                localStorage.removeItem('activeRide');
                navigate('/captainhome');
            })
            .catch((error) => {
                console.error('Failed to end ride:', error.response?.data || error.message);
                setSwipeValue(0);
            })
            .finally(() => setIsEnding(false));
    };

    const releaseSwipe = () => {
        if (swipeValue < 98) setSwipeValue(0);
    };

    return (
        <div className="flex flex-col gap-4">
            <button type="button" onClick={onClose} aria-label="Minimise" className="mx-auto flex h-6 w-16 items-center justify-center">
                <span className="mx-auto h-1 w-10 rounded-full bg-night-line" aria-hidden="true" />
            </button>

            <h3 className="font-display text-xl font-semibold">{t('captain.finishTitle')}</h3>

            <div className="flex items-center justify-between rounded-2xl bg-night-card px-4 py-3">
                <div className="flex flex-col">
                    <span className="text-xs text-night-muted">{t('captain.rider')}</span>
                    <strong className="text-base font-semibold">{riderName}</strong>
                </div>
                <strong className="font-display text-2xl font-semibold text-volt">{formatFare(ride?.fare)}</strong>
            </div>

            <RouteSummary pickup={ride?.origin} destination={ride?.destination} dark />

            <div className="relative flex h-16 w-full items-center overflow-hidden rounded-2xl bg-night-card p-1">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="text-sm font-semibold text-night-muted">{swipeValue > 50 ? '' : t('captain.slide')}</span>
                </div>
                <div style={{ width: `${swipeValue}%` }} className="h-full rounded-xl bg-volt transition-all duration-75" />
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={swipeValue}
                    onChange={handleSwipe}
                    onMouseUp={releaseSwipe}
                    onTouchEnd={releaseSwipe}
                    onKeyUp={releaseSwipe}
                    aria-label={t('captain.slide')}
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0"
                />
                <div
                    style={{ left: `calc(${swipeValue}% - ${swipeValue > 15 ? '58px' : '0px'})`, transition: 'left 0.05s linear' }}
                    className="pointer-events-none absolute flex h-14 w-14 items-center justify-center rounded-xl bg-white text-ink shadow-md"
                    aria-hidden="true"
                >
                    <ArrowRight size={22} />
                </div>
            </div>

            <p className="text-center text-xs text-night-muted">{t('captain.finishNote')}</p>
        </div>
    );
};

export default FinishRide;
