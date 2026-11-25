import React from 'react';
import RouteSummary from './RouteSummary';
import { useLanguage } from '../i18n/LanguageContext';
import { FEATURES, fareBreakdown, formatFare } from '../lib/config';

const RidePopUp = (props) => {
    const { t } = useLanguage();
    const rider = props.user;
    const riderName = [rider?.name?.firstname, rider?.name?.lastname].filter(Boolean).join(' ') || t('captain.rider');
    const split = FEATURES.fareSplit ? fareBreakdown(props.fare) : null;
    const distanceLabel = props.distanceTime?.distance || props.distance;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-volt opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-volt" />
                    </span>
                    {t('captain.newRequest')}
                </span>
                <span className="text-sm text-night-muted">{riderName}</span>
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
            </div>

            <RouteSummary pickup={props.pickup} destination={props.destination} dark />

            <p className="text-xs leading-relaxed text-night-muted">{t('captain.seeAll')}</p>

            <div className="flex gap-2.5">
                <button
                    type="button"
                    onClick={() => props.setRidePopUp(false)}
                    className="h-[60px] rounded-2xl border border-night-edge px-6 text-base font-medium text-white"
                >
                    {t('captain.skip')}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        props.confirmride();
                        props.setRidePopUp(false);
                        props.setconfirmRidePopUp(true);
                    }}
                    className="h-[60px] flex-1 rounded-2xl bg-volt text-[17px] font-semibold text-ink active:scale-[0.98]"
                >
                    {t('captain.accept')}
                </button>
            </div>
        </div>
    );
};

export default RidePopUp;
