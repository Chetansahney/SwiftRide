import React, { useEffect, useState } from 'react';
import RouteSummary from './RouteSummary';
import WomanIcon from './ui/WomanIcon';
import { useLanguage } from '../i18n/LanguageContext';
import { FEATURES, fareBreakdown, formatFare } from '../lib/config';

const RidePopUp = (props) => {
    const { t } = useLanguage();
    const rider = props.user;
    const riderName = rider?.name?.firstname || t('captain.rider');
    const split = FEATURES.fareSplit ? fareBreakdown(props.fare, props.ride?.fareBreakdown) : null;
    const returnFee = Number(props.ride?.fareBreakdown?.returnFee) || 0;
    const distanceLabel = props.distanceTime?.distance || props.distance;
    const offer = props.ride?.offer;
    const [now, setNow] = useState(() => Date.now());
    const [accepting, setAccepting] = useState(false);
    const secondsLeft = offer?.expiresAt ? Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - now) / 1000)) : null;
    const pickupDistance = offer?.distanceM != null ? (offer.distanceM < 1000 ? `${offer.distanceM} m` : `${(offer.distanceM / 1000).toFixed(1)} km`) : null;

    // Live countdown; when the offer runs out the card closes by itself.
    useEffect(() => {
        if (!offer?.expiresAt) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
    }, [offer?.expiresAt]);
    const { onExpired } = props;
    useEffect(() => {
        if (secondsLeft === 0 && !accepting) onExpired?.();
    }, [secondsLeft, accepting, onExpired]);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-volt" />
                    </span>
                    {t('captain.newRequest')}
                    {secondsLeft != null ? (
                        <span className="rounded-full bg-volt px-2 py-0.5 font-display text-xs font-semibold text-ink" aria-label={t('captain.secondsLeft', { s: secondsLeft })}>
                            {t('captain.secondsLeft', { s: secondsLeft })}
                        </span>
                    ) : null}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm text-night-muted">
                    {props.ride?.riderIsWoman ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-night-card px-2 py-0.5 text-xs font-semibold text-white">
                            <WomanIcon size={13} className="text-volt" />
                            {t('captain.womanRider')}
                        </span>
                    ) : null}
                    {riderName}
                </span>
            </div>

            <div className="flex flex-col gap-0.5" aria-live="assertive">
                <span className="text-[13px] text-night-muted">{split ? t('captain.youEarn') : t('captain.fare')}</span>
                <strong className="font-display text-[56px] font-semibold leading-none tracking-tight text-volt">
                    {formatFare(split ? split.driver : props.fare)}
                </strong>
                {split ? (
                    <span className="text-[13px] text-night-muted">
                        {t('captain.fare')}: {formatFare(split.total)}
                        {distanceLabel ? ` · ${distanceLabel}` : ''}
                    </span>
                ) : null}
                {returnFee > 0 ? (
                    <span className="mt-1 text-[13px] font-semibold text-white">{t('captain.returnIncluded', { fee: formatFare(returnFee) })}</span>
                ) : null}
            </div>

            {offer ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    {pickupDistance ? <span className="rounded-full bg-night-card px-3 py-1 font-semibold">{t('captain.pickupAway', { min: `${offer.estimated ? '~' : ''}${offer.etaMin}`, distance: pickupDistance })}</span> : null}
                    {offer.riderRating ? <span className="rounded-full bg-night-card px-3 py-1 text-night-muted">{t('captain.riderRating', { rating: offer.riderRating.toFixed(1) })}</span> : null}
                </div>
            ) : null}

            <RouteSummary pickup={props.pickup} destination={props.destination} dark />

            <p className="text-xs leading-relaxed text-night-muted">{t('captain.seeAll')} {t('captain.acceptAgree')}</p>

            <div className="flex gap-2.5">
                <button
                    type="button"
                    onClick={() => props.onDecline?.()}
                    className="h-[60px] rounded-2xl border border-night-edge px-6 text-base font-medium text-white"
                >
                    {t('captain.decline')}
                </button>
                <button
                    type="button"
                    disabled={accepting}
                    onClick={async () => {
                        setAccepting(true);
                        // Only move on to pickup once the server confirms this captain got the ride.
                        const ok = await props.confirmride();
                        setAccepting(false);
                        props.setRidePopUp(false);
                        if (ok) props.setconfirmRidePopUp(true);
                    }}
                    className="h-[60px] flex-1 rounded-2xl bg-volt text-[17px] font-semibold text-ink active:scale-[0.98] disabled:opacity-60"
                >
                    {accepting ? t('loading') : t('captain.accept')}
                </button>
            </div>
        </div>
    );
};

export default RidePopUp;
