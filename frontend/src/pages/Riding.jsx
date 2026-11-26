import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Flag, House, ShieldCheck, Share2, TriangleAlert } from 'lucide-react';
import UserRouteMap from '../components/UserRouteMap';
import RouteSummary from '../components/RouteSummary';
import VehicleArt from '../components/ui/VehicleArt';
import NumberPlate from '../components/ui/NumberPlate';
import FareSplit from '../components/ui/FareSplit';
import RateRideSheet from '../components/RateRideSheet';
import BottomSheet from '../components/ui/BottomSheet';
import FareLockedBanner from '../components/safety/FareLockedBanner';
import ShareTripSheet from '../components/safety/ShareTripSheet';
import SosSheet from '../components/safety/SosSheet';
import ReportSheet from '../components/safety/ReportSheet';
import CheckInSheet from '../components/safety/CheckInSheet';
import { useLanguage } from '../i18n/LanguageContext';
import { formatFare, vehicleMeta } from '../lib/config';
import { useLocation } from '../lib/maps';
import { API, riderAuth, riderPost } from '../lib/api';
import useSafetyMonitor from '../lib/useSafetyMonitor';
import socket from '../socket';

const TIP_OPTIONS = [0, 10, 20, 30];

function readActiveRide() {
    try {
        return JSON.parse(localStorage.getItem('activeRide') || 'null');
    } catch {
        return null;
    }
}

const Riding = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [ride, setRide] = useState(readActiveRide);
    const [selectedVehicle] = useState(() => localStorage.getItem('selectedVehicle') || 'car');
    const [isPaying, setIsPaying] = useState(false);
    const [tip, setTip] = useState(0);
    const [shareOpen, setShareOpen] = useState(false);
    const [sosOpen, setSosOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const [askReached, setAskReached] = useState(false);
    const [alertNotice, setAlertNotice] = useState('');
    const [rating, setRating] = useState(false);
    // Wallet credit (refunds, Ride Guarantee) is taken off at payment.
    const [walletCredit, setWalletCredit] = useState(0);
    useEffect(() => {
        axios
            .get(`${API}/users/profile`, riderAuth())
            .then(({ data }) => setWalletCredit(Math.floor(data?.walletCredit || 0)))
            .catch(() => {});
    }, []);
    const total = (Number(ride?.fare) || 0) + tip;
    const creditUsed = Math.min(walletCredit, total);
    const { position } = useLocation();

    const ended = ride?.status === 'completed';
    const monitor = useSafetyMonitor({ active: Boolean(ride?._id) && !ended, position, dropPoint: ride?.dropPoint });

    // The captain ending the trip brings up "Did you reach safely?", then payment.
    useEffect(() => {
        const handleEnded = (endedRide) => {
            if (!endedRide) return;
            setRide(endedRide);
            localStorage.setItem('activeRide', JSON.stringify(endedRide));
            setAskReached(true);
        };
        socket.on('ride-ended', handleEnded);
        return () => socket.off('ride-ended', handleEnded);
    }, []);

    const captain = ride?.captain;
    const captainName = captain?.name?.firstname || t('ride.driver');
    const vehicle = captain?.vehicle || {};
    const meta = vehicleMeta(vehicle.vehicleType || ride?.vehicleType || selectedVehicle);
    const vehicleLabel = [vehicle.color, vehicle.model].filter(Boolean).join(' ') || t(meta.nameKey);

    const answerCheckIn = (response) => {
        const reason = monitor.trigger;
        monitor.clear();
        if (!ride?._id) return;
        riderPost(`/rides/${ride._id}/check-in`, { reason, response, location: position || undefined }).catch(() => {});
        if (response !== 'ok') {
            setAlertNotice(t('safety.alertSent'));
            if (response === 'help') setSosOpen(true);
        }
    };

    const answerReached = (safe) => {
        setAskReached(false);
        if (!ride?._id) return;
        riderPost(`/rides/${ride._id}/reached`, { safe, location: position || undefined }).catch(() => {});
        if (!safe) {
            setAlertNotice(t('safety.alertSent'));
            setSosOpen(true);
        }
    };

    const pay = async () => {
        if (!ride?._id || isPaying) return;
        setIsPaying(true);
        try {
            await axios.post(`${API}/rides/complete-payment`, { rideId: ride._id, tip: tip || undefined }, riderAuth());
            localStorage.removeItem('activeRide');
            // Ask for a rating before going home (skippable).
            setRating(true);
        } catch (error) {
            console.error('Payment failed:', error.response?.data || error.message);
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-[#EEF0F2]">
            <div className="relative h-[38%] min-h-[220px] w-full shrink-0">
                <UserRouteMap destination={ride?.destination} />
                <div className="absolute inset-x-5 top-6 z-20 flex justify-between">
                    <button
                        type="button"
                        onClick={() => setSosOpen(true)}
                        className="flex h-12 items-center gap-2 rounded-full bg-signal px-4 text-sm font-semibold text-white shadow-float"
                    >
                        <TriangleAlert size={18} aria-hidden="true" />
                        {t('ride.sos')}
                    </button>
                    <Link
                        to="/home"
                        aria-label="Home"
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-float"
                    >
                        <House size={20} aria-hidden="true" />
                    </Link>
                </div>
            </div>

            <div className="sheet relative z-10 -mt-7 mx-auto flex w-full max-w-xl flex-1 flex-col gap-3.5 overflow-y-auto px-5 pb-7 pt-3">
                <span className="sheet-handle" aria-hidden="true" />

                <div className="flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white" aria-live="polite">
                    <span className="relative flex h-3 w-3" aria-hidden="true">
                        {!ended ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-75" /> : null}
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-volt" />
                    </span>
                    <div>
                        <strong className="block text-[15px] font-semibold">{ended ? t('track.completed') : t('ride.started')}</strong>
                        {!ended ? <span className="text-xs text-[#B4B8C0]">{t('ride.startedSub')}</span> : null}
                    </div>
                </div>

                {alertNotice ? (
                    <p role="status" className="flex items-center gap-2 rounded-2xl bg-volt/50 px-4 py-3 text-sm font-semibold">
                        <ShieldCheck size={18} aria-hidden="true" />
                        {alertNotice}
                    </p>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setShareOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-paper text-sm font-semibold">
                        <Share2 size={18} aria-hidden="true" />
                        {t('safety.shareTrip')}
                    </button>
                    <button type="button" onClick={() => setReportOpen(true)} className="flex h-12 items-center justify-center gap-2 rounded-[14px] bg-paper px-2 text-sm font-semibold">
                        <Flag size={18} aria-hidden="true" />
                        <span className="truncate">{t('report.extraButton')}</span>
                    </button>
                </div>

                <div className="flex items-center gap-3 rounded-2xl bg-paper p-3">
                    <VehicleArt art={meta.art} width={80} />
                    <div className="flex min-w-0 flex-col items-start gap-1">
                        <NumberPlate plate={vehicle.plate} />
                        <span className="truncate text-[13px] text-muted">
                            {captainName} · {vehicleLabel}
                        </span>
                    </div>
                </div>

                <RouteSummary pickup={ride?.origin} destination={ride?.destination} />

                <FareLockedBanner fare={ride?.fare} />
                <FareSplit fare={ride?.fare} breakdown={ride?.fareBreakdown} />

                <div className="flex flex-col gap-2">
                    <strong className="text-sm font-semibold">{t('tip.title')}</strong>
                    <div role="radiogroup" aria-label={t('tip.title')} className="grid grid-cols-4 gap-2">
                        {TIP_OPTIONS.map((amount) => (
                            <button
                                key={amount}
                                type="button"
                                role="radio"
                                aria-checked={tip === amount}
                                onClick={() => setTip(amount)}
                                className={`h-11 rounded-[12px] text-sm font-semibold ${tip === amount ? 'bg-ink text-white' : 'bg-paper text-ink'}`}
                            >
                                {amount ? `+₹${amount}` : t('tip.none')}
                            </button>
                        ))}
                    </div>
                    <span className="text-xs text-muted">{t('tip.note')}</span>
                </div>

                {creditUsed > 0 ? (
                    <div className="flex items-center justify-between rounded-2xl bg-volt/30 px-4 py-3 text-sm font-semibold">
                        <span>{t('fare.walletCredit')}</span>
                        <span>−{formatFare(creditUsed)}</span>
                    </div>
                ) : null}

                <button type="button" onClick={pay} disabled={isPaying || !ride?._id} className="btn-volt mt-auto shrink-0">
                    {isPaying ? t('ride.paying') : t('ride.pay', { fare: formatFare(total - creditUsed) })}
                </button>
            </div>

            <CheckInSheet reason={monitor.trigger} onAnswer={answerCheckIn} />

            <RateRideSheet
                open={rating}
                title={t('rate.title', { name: ride?.captain?.name?.firstname || t('ride.driver') })}
                submit={(stars, comment) => riderPost(`/rides/${ride._id}/rate`, { stars, comment: comment || undefined })}
                onDone={() => navigate('/home')}
            />

            <BottomSheet open={askReached} onClose={() => setAskReached(false)} title={t('safety.reachedTitle')} dismissable={false}>
                {ride?.safety?.endedAwayFromDrop ? (
                    <p className="rounded-[14px] bg-signal/10 px-4 py-3 text-sm font-semibold text-signal">{t('safety.endedAway')}</p>
                ) : null}
                <button type="button" onClick={() => answerReached(true)} className="btn-volt gap-2">
                    <ShieldCheck size={20} aria-hidden="true" />
                    {t('safety.yesReached')}
                </button>
                <button
                    type="button"
                    onClick={() => answerReached(false)}
                    className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-signal text-base font-semibold text-white"
                >
                    <TriangleAlert size={20} aria-hidden="true" />
                    {t('safety.notSafe')}
                </button>
            </BottomSheet>

            <ShareTripSheet open={shareOpen} onClose={() => setShareOpen(false)} ride={ride} />
            <SosSheet open={sosOpen} onClose={() => setSosOpen(false)} ride={ride} onShareWithContacts={() => setShareOpen(true)} />
            <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} ride={ride} />
        </div>
    );
};

export default Riding;
