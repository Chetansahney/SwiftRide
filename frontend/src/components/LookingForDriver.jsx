import React from 'react';
import VehicleArt from './ui/VehicleArt';
import RouteSummary from './RouteSummary';
import CancelRideButton from './CancelRideButton';
import { useLanguage } from '../i18n/LanguageContext';
import { formatFare, vehicleMeta } from '../lib/config';

const LookingForDriver = ({ setLookingForDriverPanel, pickup, destination, fare, selectedVehicle, onCancel }) => {
    const { t } = useLanguage();
    const vehicle = vehicleMeta(selectedVehicle);
    const rideFare = fare?.[selectedVehicle];

    return (
        <div className="flex flex-col gap-4">
            <button
                type="button"
                onClick={() => setLookingForDriverPanel(false)}
                aria-label="Minimise"
                className="mx-auto flex h-6 w-16 items-center justify-center"
            >
                <span className="sheet-handle" aria-hidden="true" />
            </button>

            <div className="flex flex-col items-center gap-3 text-center">
                <div className="relative flex h-28 w-28 items-center justify-center">
                    <span className="absolute inset-0 animate-ping rounded-full bg-volt/40" aria-hidden="true" />
                    <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-volt">
                        <VehicleArt art={vehicle.art} width={72} />
                    </span>
                </div>
                <h2 className="font-display text-[22px] font-semibold tracking-tight" aria-live="polite">
                    {t('ride.looking')}
                </h2>
                <p className="text-sm text-muted">{t('ride.lookingSub')}</p>
            </div>

            <div className="h-1 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full w-1/3 animate-ride-load bg-ink" />
            </div>

            <RouteSummary pickup={pickup} destination={destination} />

            <div className="flex items-center justify-between rounded-2xl bg-paper px-4 py-3">
                <span className="text-sm">
                    {t(vehicle.nameKey)} · {t('ride.payCash')}
                </span>
                <strong className="font-display text-xl font-semibold">{formatFare(rideFare)}</strong>
            </div>

            {onCancel ? <CancelRideButton onConfirm={onCancel} /> : null}
        </div>
    );
};

export default LookingForDriver;
