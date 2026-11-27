import React from 'react';
import { ArrowRight, ChevronLeft, MapPin } from 'lucide-react';
import VehicleArt from './ui/VehicleArt';
import FareSplit from './ui/FareSplit';
import WomanIcon from './ui/WomanIcon';
import { useLanguage } from '../i18n/LanguageContext';
import { VEHICLES, formatDistance, formatFare } from '../lib/config';

const VehiclePanel = ({
    setVehiclePanel,
    setConfirmRidePanel,
    fare,
    distanceTime,
    selectedVehicle,
    setSelectedVehicle,
    nearby,
    onBack,
    womenMode = false,
    allowAnyCaptain = false,
    setAllowAnyCaptain,
}) => {
    const { t } = useLanguage();
    const tripLine = distanceTime?.duration
        ? `${distanceTime.distance ? `${distanceTime.distance} · ` : ''}${distanceTime.duration}`
        : t('ride.enterBoth');
    const selected = VEHICLES.find((vehicle) => vehicle.key === selectedVehicle) || VEHICLES[1];
    const selectedFare = fare?.[selected.key];
    const noWomenForSelected = womenMode && nearby && nearby.women?.[selected.key] == null;

    const distanceLine = (key) => {
        if (!nearby) return null;
        if (womenMode) {
            const meters = nearby.women?.[key];
            return meters == null ? (
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-muted">
                    <WomanIcon size={13} />
                    {t('safety.noWomenNearby')}
                </span>
            ) : (
                <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-ink">
                    <WomanIcon size={13} />
                    {t('safety.womenNearby', { distance: formatDistance(meters) })}
                </span>
            );
        }
        return (
            <span className={`mt-0.5 inline-flex items-center gap-1 text-xs font-semibold ${nearby[key] == null ? 'text-muted' : 'text-ink'}`}>
                <MapPin size={12} aria-hidden="true" />
                {nearby[key] == null ? t('ride.noneNearby') : t('ride.fromPickup', { distance: formatDistance(nearby[key]) })}
            </span>
        );
    };

    return (
        <div className="flex flex-col gap-3.5">
            <div className="relative flex items-center justify-center">
                <button
                    type="button"
                    onClick={() => (onBack ? onBack() : setVehiclePanel(false))}
                    aria-label="Back"
                    className="absolute left-0 flex h-11 w-11 items-center justify-center rounded-full bg-paper"
                >
                    <ChevronLeft size={22} aria-hidden="true" />
                </button>
                <span className="sheet-handle" aria-hidden="true" />
            </div>

            <div>
                <h2 className="font-display text-[22px] font-semibold tracking-tight">{t('ride.chooseTitle')}</h2>
                <p className="text-sm text-muted">{tripLine}</p>
            </div>

            <div role="radiogroup" aria-label={t('ride.chooseTitle')} className="flex flex-col gap-2">
                {VEHICLES.map((vehicle) => {
                    const isSelected = vehicle.key === selectedVehicle;
                    return (
                        <button
                            key={vehicle.key}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => setSelectedVehicle(vehicle.key)}
                            className={`flex items-center gap-3 rounded-2xl bg-white p-2 pr-3.5 text-left transition ${isSelected ? 'border-2 border-ink' : 'border border-line'}`}
                        >
                            <span className={`flex h-[52px] w-[72px] shrink-0 items-center justify-center rounded-xl ${isSelected ? 'bg-volt' : 'bg-paper'}`}>
                                <VehicleArt art={vehicle.art} width={62} />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col">
                                <strong className="text-[15px] font-semibold">{t(vehicle.nameKey)}</strong>
                                <span className="text-xs text-muted">{t(vehicle.noteKey)}</span>
                                {distanceLine(vehicle.key)}
                            </span>
                            <span className="font-display text-xl font-semibold">{formatFare(fare?.[vehicle.key])}</span>
                        </button>
                    );
                })}
            </div>

            {noWomenForSelected ? (
                <div className="flex flex-col gap-2 rounded-2xl border border-line p-3" role="group" aria-label={t('safety.noWomenNearby')}>
                    <strong className="flex items-center gap-2 text-sm font-semibold">
                        <WomanIcon size={16} />
                        {t('safety.noWomenNearby')}
                    </strong>
                    {[
                        { value: true, label: t('safety.bookAny') },
                        { value: false, label: t('safety.waitWomen') },
                    ].map((option) => (
                        <button
                            key={String(option.value)}
                            type="button"
                            role="radio"
                            aria-checked={allowAnyCaptain === option.value}
                            onClick={() => setAllowAnyCaptain?.(option.value)}
                            className={`flex h-12 items-center gap-3 rounded-[12px] px-3 text-left text-sm font-semibold ${allowAnyCaptain === option.value ? 'bg-ink text-white' : 'bg-paper text-ink'}`}
                        >
                            <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${allowAnyCaptain === option.value ? 'border-volt bg-volt' : 'border-[#B4B8C0]'}`}
                                aria-hidden="true"
                            >
                                {allowAnyCaptain === option.value ? <span className="h-2 w-2 rounded-full bg-ink" /> : null}
                            </span>
                            {option.label}
                        </button>
                    ))}
                </div>
            ) : null}

            <FareSplit fare={selectedFare} breakdown={fare?.breakdown?.[selected.key]} />

            <button
                type="button"
                disabled={!selectedFare && selectedFare !== 0}
                onClick={() => {
                    setVehiclePanel(false);
                    setConfirmRidePanel(true);
                }}
                className="btn-primary justify-between pl-5 pr-2"
            >
                {t('ride.book', { vehicle: t(selected.nameKey), fare: formatFare(selectedFare) })}
                <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-volt text-ink" aria-hidden="true">
                    <ArrowRight size={20} />
                </span>
            </button>
        </div>
    );
};

export default VehiclePanel;
