import React from 'react';
import { MapPin, Phone, Share2, TriangleAlert } from 'lucide-react';
import VehicleArt from './ui/VehicleArt';
import NumberPlate from './ui/NumberPlate';
import { GuaranteePill } from './ui/Brand';
import { useLanguage } from '../i18n/LanguageContext';
import { FEATURES, formatFare, shortPlace, vehicleMeta } from '../lib/config';

const WaitingForDriver = (props) => {
    const { t } = useLanguage();
    const ride = props.ride;
    const captain = ride?.captain;
    const captainName = [captain?.name?.firstname, captain?.name?.lastname].filter(Boolean).join(' ') || t('ride.driver');
    const initials = captainName
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const vehicle = captain?.vehicle || {};
    const meta = vehicleMeta(vehicle.vehicleType || 'car');
    const vehicleLabel = [vehicle.color, vehicle.model].filter(Boolean).join(' ') || t(meta.nameKey);
    const pickup = ride?.origin || '';
    const pin = String(props.otp || '').padEnd(4, '·').slice(0, 4).split('');

    const shareTrip = async () => {
        const text = `${t('ride.driverOnWay')}: ${captainName}, ${vehicle.plate || ''} → ${shortPlace(ride?.destination)}`;
        if (navigator.share) {
            try {
                await navigator.share({ title: 'SwiftRide', text });
            } catch {
                // user closed the share sheet
            }
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(text);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <button
                type="button"
                onClick={() => props.setWaitingForDriver(false)}
                aria-label="Minimise"
                className="mx-auto flex h-6 w-16 items-center justify-center"
            >
                <span className="sheet-handle" aria-hidden="true" />
            </button>

            <h2 className="font-display text-[22px] font-semibold tracking-tight">{t('ride.driverOnWay')}</h2>
            {FEATURES.rideGuarantee ? <GuaranteePill>{t('guarantee.name')}</GuaranteePill> : null}

            <div className="flex items-center gap-3 rounded-2xl bg-paper p-3">
                <VehicleArt art={meta.art} width={84} />
                <div className="flex flex-col items-start gap-1.5">
                    <NumberPlate plate={vehicle.plate} size="lg" />
                    <span className="text-[13px] text-muted">{vehicleLabel}</span>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink font-display text-lg font-semibold text-volt"
                    aria-hidden="true"
                >
                    {initials}
                </div>
                <div className="flex min-w-0 flex-col">
                    <strong className="text-base font-semibold">{captainName}</strong>
                    <span className="text-[13px] text-muted">{t(meta.nameKey)}</span>
                </div>
            </div>

            {pickup ? (
                <div className="flex items-center gap-3 rounded-[14px] border border-line px-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-volt" aria-hidden="true">
                        <MapPin size={16} />
                    </span>
                    <span className="min-w-0 text-sm leading-snug">
                        {t('ride.meetAt')} <strong className="font-semibold">{shortPlace(pickup)}</strong>
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

            <div className="flex items-center justify-between px-1 text-sm">
                <span className="text-muted">{t('ride.payCash')}</span>
                <strong className="font-display text-lg font-semibold">{formatFare(ride?.fare)}</strong>
            </div>

            <div className={`grid gap-2 ${captain?.phone ? 'grid-cols-[2fr_1fr_1fr]' : 'grid-cols-2'}`}>
                {captain?.phone ? (
                    <a href={`tel:${captain.phone}`} className="btn-primary gap-2">
                        <Phone size={20} className="text-volt" aria-hidden="true" />
                        {t('ride.call')}
                    </a>
                ) : null}
                <button
                    type="button"
                    onClick={shareTrip}
                    className="flex h-14 flex-col items-center justify-center gap-1 rounded-[14px] bg-paper text-xs font-medium"
                >
                    <Share2 size={18} aria-hidden="true" />
                    {t('ride.share')}
                </button>
                <a
                    href="tel:112"
                    className="flex h-14 flex-col items-center justify-center gap-1 rounded-[14px] bg-signal text-xs font-semibold text-white"
                >
                    <TriangleAlert size={18} aria-hidden="true" />
                    {t('ride.sos')}
                </a>
            </div>
        </div>
    );
};

export default WaitingForDriver;
