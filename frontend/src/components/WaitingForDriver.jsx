import React, { useEffect, useState } from 'react';
import { BadgeCheck, Clock, Flag, MapPin, Phone, Share2, ShieldAlert, TriangleAlert } from 'lucide-react';
import VehicleArt from './ui/VehicleArt';
import NumberPlate from './ui/NumberPlate';
import WomanIcon from './ui/WomanIcon';
import FareLockedBanner from './safety/FareLockedBanner';
import CancelRideButton from './CancelRideButton';
import { useLanguage } from '../i18n/LanguageContext';
import { FREE_WAIT_MIN, WAIT_PER_MIN, formatFare, shortPlace, vehicleMeta } from '../lib/config';
import { currentPosition, riderPost } from '../lib/api';

function useFreeWaitLeft(arrivedAt) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!arrivedAt) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [arrivedAt]);
    if (!arrivedAt) return null;
    return Math.max(0, FREE_WAIT_MIN * 60 - Math.floor((now - new Date(arrivedAt).getTime()) / 1000));
}

const WaitingForDriver = ({ ride, otp, setWaitingForDriver, onShare, onReport, onSos, onCancel }) => {
    const { t } = useLanguage();
    const [verified, setVerified] = useState(null);
    const captain = ride?.captain;
    const captainName = captain?.name?.firstname || t('ride.driver');
    const vehicle = captain?.vehicle || {};
    const meta = vehicleMeta(vehicle.vehicleType || ride?.vehicleType || 'car');
    const vehicleLabel = [vehicle.color, vehicle.model].filter(Boolean).join(' ') || t(meta.nameKey);
    const pin = String(otp || '').padEnd(4, '·').slice(0, 4).split('');
    const freeLeft = useFreeWaitLeft(ride?.arrivedAt);
    const rideId = ride?._id;

    const answer = async (match) => {
        setVerified(match);
        if (!rideId) return;
        const location = match ? null : await currentPosition();
        riderPost(`/rides/${rideId}/verify-driver`, { match, location: location || undefined }).catch(() => {});
    };

    return (
        <div className="flex flex-col gap-3">
            <button
                type="button"
                onClick={() => setWaitingForDriver(false)}
                aria-label="Minimise"
                className="mx-auto flex h-6 w-16 items-center justify-center"
            >
                <span className="sheet-handle" aria-hidden="true" />
            </button>

            {ride?.arrivedAt ? (
                <div className="flex items-center gap-3 rounded-2xl bg-volt px-4 py-3 text-ink" role="status">
                    <Clock size={22} aria-hidden="true" />
                    <div className="flex flex-col">
                        <strong className="text-[15px] font-semibold">{t('fare.arrivedTitle')}</strong>
                        <span className="text-[13px]">
                            {t('fare.freeWait', { rate: formatFare(WAIT_PER_MIN[meta.key] || WAIT_PER_MIN.car) })}
                            {freeLeft > 0 ? ` · ${Math.floor(freeLeft / 60)}:${String(freeLeft % 60).padStart(2, '0')}` : ''}
                        </span>
                    </div>
                </div>
            ) : (
                <h2 className="font-display text-[22px] font-semibold tracking-tight">{t('ride.driverOnWay')}</h2>
            )}

            <FareLockedBanner fare={ride?.fare} />

            <section className="flex flex-col gap-3 rounded-2xl border border-line p-3" aria-label={t('safety.isThisYourRide')}>
                <div className="flex items-center gap-3">
                    {captain?.photo ? (
                        <img src={captain.photo} alt={captainName} className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                    ) : (
                        <span
                            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink font-display text-xl font-semibold text-volt"
                            aria-hidden="true"
                        >
                            {captainName.slice(0, 1).toUpperCase()}
                        </span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <strong className="flex items-center gap-1.5 text-base font-semibold">
                            {captainName}
                            {captain?.isWoman ? <WomanIcon size={16} className="text-ink" /> : null}
                        </strong>
                        {captain?.selfieCheckedToday ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
                                <BadgeCheck size={14} aria-hidden="true" />
                                {t('safety.selfieToday')}
                            </span>
                        ) : null}
                        <span className="truncate text-[13px] text-muted">{vehicleLabel}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-paper p-2">
                    <VehicleArt art={meta.art} width={76} />
                    <NumberPlate plate={vehicle.plate} size="lg" />
                </div>

                {verified === null ? (
                    <>
                        <div>
                            <strong className="text-[15px] font-semibold">{t('safety.isThisYourRide')}</strong>
                            <p className="text-[13px] text-muted">{t('safety.checkPhoto')}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => answer(true)} className="btn-primary h-12 text-[15px]">
                                {t('safety.yesMine')}
                            </button>
                            <button
                                type="button"
                                onClick={() => answer(false)}
                                className="flex h-12 items-center justify-center rounded-[14px] border border-signal/40 text-[15px] font-semibold text-signal"
                            >
                                {t('safety.notMine')}
                            </button>
                        </div>
                    </>
                ) : verified ? (
                    <p className="flex items-center gap-2 rounded-xl bg-volt/40 px-3 py-2 text-sm font-semibold" role="status">
                        <BadgeCheck size={18} aria-hidden="true" />
                        {t('safety.confirmed')}
                    </p>
                ) : (
                    <div className="flex flex-col gap-2 rounded-xl bg-signal/10 p-3" role="alert">
                        <strong className="flex items-center gap-2 text-sm font-semibold text-signal">
                            <ShieldAlert size={18} aria-hidden="true" />
                            {t('safety.notMineBody')}
                        </strong>
                        <button type="button" onClick={onSos} className="flex h-12 items-center justify-center rounded-[12px] bg-signal text-sm font-semibold text-white">
                            {t('safety.sosTitle')}
                        </button>
                    </div>
                )}
            </section>

            {ride?.origin ? (
                <div className="flex items-center gap-3 rounded-[14px] border border-line px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-volt" aria-hidden="true">
                        <MapPin size={16} />
                    </span>
                    <span className="min-w-0 text-sm leading-snug">
                        {t('ride.meetAt')} <strong className="font-semibold">{shortPlace(ride.origin)}</strong>
                    </span>
                </div>
            ) : null}

            <div className="flex items-center justify-between rounded-2xl bg-paper px-4 py-3">
                <div className="flex flex-col">
                    <strong className="text-sm font-semibold">{t('ride.pin')}</strong>
                    <span className="text-xs text-muted">{t('ride.pinSub')}</span>
                </div>
                <div className="flex gap-1.5" aria-label={`${t('ride.pin')}: ${pin.join(' ')}`}>
                    {pin.map((digit, index) => (
                        <span
                            key={index}
                            className="flex h-11 w-9 items-center justify-center rounded-[10px] bg-white font-display text-2xl font-semibold"
                            aria-hidden="true"
                        >
                            {digit}
                        </span>
                    ))}
                </div>
            </div>

            <div className={`grid gap-2 ${captain?.phone ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {captain?.phone ? (
                    <a href={`tel:${captain.phone}`} className="flex h-16 flex-col items-center justify-center gap-1 rounded-[14px] bg-ink text-xs font-semibold text-white">
                        <Phone size={18} className="text-volt" aria-hidden="true" />
                        {t('ride.call')}
                    </a>
                ) : null}
                <button type="button" onClick={onShare} className="flex h-16 flex-col items-center justify-center gap-1 rounded-[14px] bg-paper text-xs font-semibold">
                    <Share2 size={18} aria-hidden="true" />
                    {t('ride.share')}
                </button>
                <button type="button" onClick={onReport} className="flex h-16 flex-col items-center justify-center gap-1 rounded-[14px] bg-paper px-1 text-center text-[11px] font-semibold leading-tight">
                    <Flag size={18} aria-hidden="true" />
                    {t('report.extraButton')}
                </button>
                <button type="button" onClick={onSos} className="flex h-16 flex-col items-center justify-center gap-1 rounded-[14px] bg-signal text-xs font-semibold text-white">
                    <TriangleAlert size={18} aria-hidden="true" />
                    {t('ride.sos')}
                </button>
            </div>

            {onCancel && ['requested', 'accepted'].includes(ride?.status || 'requested') ? <CancelRideButton onConfirm={onCancel} /> : null}
        </div>
    );
};

export default WaitingForDriver;
